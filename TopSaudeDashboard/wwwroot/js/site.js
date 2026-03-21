(function () {
  async function apiFetch(url, options) {
    const response = await fetch(url, Object.assign({
      headers: { "Content-Type": "application/json" }
    }, options || {}));

    if (!response.ok) {
      let message = response.status + " " + response.statusText;
      try {
        const body = await response.json();
        message = body.error || body.title || message;
        if (body.detail) message += "\n" + body.detail;
        if (body.traceId) message += "\ntraceId=" + body.traceId;
      } catch { }
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    const ct = response.headers.get("content-type") || "";
    if (ct.includes("application/json")) return await response.json();
    return await response.text();
  }

  function setAlert(container, message, kind) {
    if (!container) return;
    container.classList.remove("d-none");
    container.classList.remove("alert-danger", "alert-success", "alert-warning", "alert-info");
    container.classList.add(kind || "alert-danger");
    container.textContent = message || "";
  }

  function clearAlert(container) {
    if (!container) return;
    container.classList.add("d-none");
    container.textContent = "";
  }

  function renderMiniChart(container, points, onPointClick) {
    if (!container) return;
    const width = container.clientWidth || 320;
    const height = container.clientHeight || 56;

    const data = (points || []).map(p => ({ x: p.date, y: p.count }));
    const max = Math.max(1, ...data.map(d => d.y));

    const pad = 4;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2;

    function x(i) {
      if (data.length <= 1) return pad;
      return pad + (i * innerW) / (data.length - 1);
    }

    function y(v) {
      return pad + innerH - (v * innerH) / max;
    }

    let d = "";
    for (let i = 0; i < data.length; i++) {
      d += (i === 0 ? "M" : "L") + x(i) + " " + y(data[i].y) + " ";
    }

    const area = d.replace(/^M/, "M" + pad + " " + (pad + innerH) + " L") + "L" + (pad + innerW) + " " + (pad + innerH) + " Z";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("class", "mini-chart");

    const areaPath = document.createElementNS(svg.namespaceURI, "path");
    areaPath.setAttribute("d", area);
    areaPath.setAttribute("class", "area");

    const linePath = document.createElementNS(svg.namespaceURI, "path");
    linePath.setAttribute("d", d.trim());
    linePath.setAttribute("class", "line");

    svg.appendChild(areaPath);
    svg.appendChild(linePath);

    for (let i = 0; i < data.length; i++) {
      const circle = document.createElementNS(svg.namespaceURI, "circle");
      circle.setAttribute("cx", x(i));
      circle.setAttribute("cy", y(data[i].y));
      circle.setAttribute("r", 2.5);
      circle.setAttribute("class", "point");
      circle.style.opacity = (i === data.length - 1) ? "1" : "0.6";

      if (onPointClick) {
        circle.style.cursor = "pointer";
        circle.addEventListener("click", (e) => {
          e.stopPropagation();
          onPointClick(data[i]);
        });
      }

      svg.appendChild(circle);
    }

    container.innerHTML = "";
    container.appendChild(svg);
  }

  function connectJobSse(jobId, onLine, onDone) {
    const source = new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/events`);
    source.onmessage = (evt) => { if (onLine) onLine(evt.data); };
    source.onerror = () => {
      source.close();
      if (onDone) onDone();
    };
    return source;
  }

  window.topSaude = {
    apiFetch,
    setAlert,
    clearAlert,
    renderMiniChart,
    connectJobSse,
  };
})();
