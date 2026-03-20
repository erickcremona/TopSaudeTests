import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

type RequestApiSaude = {
  sac: { numero: string; nome: string };
  env: { base_url: string; usuario: string; senha: string; base_db_preferida?: string };
  entrada: {
    contratos?: string[];
    request_login: string;
    request_consulta_contrato: string;
  };
  execucao?: {
    delay_entre_passos_ms?: number;
    timeout_por_passo_ms?: number;
    modo_visual?: boolean;
    sempre_mostrar_cliques?: boolean;
    sempre_logar_clique_fill_read?: boolean;
  };
  passos?: string[];
  sucesso_quando?: string;
};

function requestPathFromSpec(): string {
  return path.resolve(__dirname, '..', '..', 'requests_ia', 'SAC_100002', 'request_api_saude_SAC_100002.json');
}

function loadRequest(): RequestApiSaude {
  const raw = fs.readFileSync(requestPathFromSpec(), { encoding: 'utf-8' });
  return JSON.parse(raw) as RequestApiSaude;
}

function inferApiBaseUrl(swaggerIndexUrl: string): string {
  const url = new URL(swaggerIndexUrl);
  const cleanedPath = url.pathname
    .replace(/\/swagger\/index\.html$/i, '')
    .replace(/\/swagger\/?$/i, '')
    .replace(/\/+$/g, '');

  url.pathname = cleanedPath || '/';
  url.hash = '';
  url.search = '';

  return url.toString().replace(/\/+$/g, '');
}

function joinUrl(baseUrl: string, endpointPath: string): string {
  const base = baseUrl.replace(/\/+$/g, '');
  const p = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  return `${base}${p}`;
}

function replacePathParams(template: string, params: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(new RegExp(`\\{${k.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\}`, 'g'), v);
  }
  return out;
}

function shouldLogSteps(req: RequestApiSaude): boolean {
  return req.execucao?.sempre_logar_clique_fill_read ?? true;
}

function logStep(req: RequestApiSaude, label: string): void {
  if (!shouldLogSteps(req)) return;
  // eslint-disable-next-line no-console
  console.log(`[STEP] ${label}`);
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function redactSecrets(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    // Redact JWT-like strings and long bearer-like tokens.
    const s = value.trim();
    const looksJwt = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s);
    if (looksJwt) return '<REDACTED_JWT>';
    if (s.length > 80) return `${s.slice(0, 12)}…<REDACTED>…${s.slice(-8)}`;
    return value;
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const key = k.toLowerCase();
      if (['token', 'accesstoken', 'access_token', 'jwt', 'id_token', 'authorization'].includes(key)) {
        out[k] = '<REDACTED_TOKEN>';
      } else {
        out[k] = redactSecrets(v);
      }
    }
    return out;
  }
  return value;
}

function formatResponseForLog(bodyText: string, maxLen = 0): string {
  const parsed = tryParseJson(bodyText);
  if (parsed) {
    const redacted = redactSecrets(parsed);
    const pretty = JSON.stringify(redacted, null, 2);
    if (!maxLen || maxLen <= 0) return pretty;
    return pretty.length > maxLen ? `${pretty.slice(0, maxLen)}\n…(truncado)…` : pretty;
  }
  const raw = (bodyText ?? '').toString();
  const redactedRaw = raw.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer <REDACTED_TOKEN>');
  if (!maxLen || maxLen <= 0) return redactedRaw;
  return redactedRaw.length > maxLen ? `${redactedRaw.slice(0, maxLen)}\n…(truncado)…` : redactedRaw;
}

function safeFileName(s: string): string {
  return (s ?? '')
    .replace(/https?:\/\//gi, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

function writeResponseArtifact(opts: { sac: string; label: string; bodyText: string }): string {
  const outDir = path.resolve(process.cwd(), 'out', 'api-responses', opts.sac);
  fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = `${ts}-${safeFileName(opts.label) || 'response'}.json`;
  const filePath = path.join(outDir, file);

  const parsed = tryParseJson(opts.bodyText);
  const content = parsed ? JSON.stringify(redactSecrets(parsed), null, 2) : formatResponseForLog(opts.bodyText);
  fs.writeFileSync(filePath, `${content}\n`, { encoding: 'utf-8' });
  return filePath;
}

async function delayIfConfigured(req: RequestApiSaude, visualSwagger: boolean): Promise<void> {
  const ms = req.execucao?.delay_entre_passos_ms ?? (visualSwagger ? 2000 : 0);
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

function findTokenDeep(value: unknown): string | null {
  if (!value) return null;

  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;
    if (s.length < 10) return null;
    return s;
  }

  if (Array.isArray(value)) {
    for (const it of value) {
      const tok = findTokenDeep(it);
      if (tok) return tok;
    }
    return null;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const candidates = ['token', 'accessToken', 'access_token', 'jwt', 'bearer', 'bearerToken', 'id_token'];
    for (const key of candidates) {
      if (key in obj) {
        const tok = findTokenDeep(obj[key]);
        if (tok) return tok;
      }
    }

    for (const v of Object.values(obj)) {
      const tok = findTokenDeep(v);
      if (tok) return tok;
    }
  }

  return null;
}

async function postLoginAndExtractToken(
  request: APIRequestContext,
  url: string,
  payload: Record<string, string>,
  timeoutMs: number,
): Promise<string | null> {
  const resp = await request.post(url, { data: payload, timeout: timeoutMs });
  if (!resp.ok()) return null;

  const json = await resp.json().catch(() => null);
  const tokenFromJson = findTokenDeep(json);
  if (tokenFromJson) return tokenFromJson;

  const text = await resp.text().catch(() => '');
  const tokenFromText = findTokenDeep(text);
  if (tokenFromText) return tokenFromText;

  return null;
}

async function obterToken(
  request: APIRequestContext,
  baseApiUrl: string,
  req: RequestApiSaude,
  timeoutMs: number,
): Promise<string> {
  const url = joinUrl(baseApiUrl, req.entrada.request_login);
  const user = process.env.API_TOKEN_USUARIO ?? req.env.usuario ?? '';
  const pass = process.env.API_TOKEN_SENHA ?? req.env.senha ?? '';

  if (!user || !pass) {
    throw new Error('Defina API_TOKEN_USUARIO e API_TOKEN_SENHA no ambiente (ou preencha env.usuario/env.senha no request).');
  }

  const attempts: Array<Record<string, string>> = [
    { login: user, senha: pass },
    { usuario: user, senha: pass },
    { username: user, password: pass },
  ];

  for (const payload of attempts) {
    const token = await postLoginAndExtractToken(request, url, payload, timeoutMs).catch(() => null);
    if (token) return token;
  }

  const debugResp = await request.post(url, { data: attempts[0], timeout: timeoutMs });
  const debugBody = await debugResp.text().catch(() => '');
  throw new Error(
    [
      'Falha ao obter token no endpoint de login.',
      `URL: ${url}`,
      `Status: ${debugResp.status()}`,
      `Body (amostra): ${debugBody.slice(0, 800)}`,
      'Obs: ajuste os payloads em obterToken() se o schema for diferente.',
    ].join('\n'),
  );
}

async function openSwagger(page: Page, swaggerUrl: string, timeoutMs: number): Promise<void> {
  await page.goto(swaggerUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await page.waitForLoadState('domcontentloaded');
  await page.locator('.swagger-ui, #swagger-ui').first().waitFor({ state: 'visible', timeout: timeoutMs }).catch(() => {});
}

async function centerInViewport(locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
  await locator
    .evaluate((el) => {
      try {
        (el as HTMLElement).scrollIntoView({ block: 'center', inline: 'center' });
      } catch {
        // ignore
      }
    })
    .catch(() => {});
}

async function highlightLocator(locator: Locator, color = 'magenta'): Promise<void> {
  await locator
    .evaluate(
      (el, c) => {
        const htmlEl = el as HTMLElement;
        const prev = htmlEl.style.outline;
        const prevOffset = htmlEl.style.outlineOffset;
        htmlEl.style.outline = `3px solid ${c}`;
        htmlEl.style.outlineOffset = '2px';
        window.setTimeout(() => {
          htmlEl.style.outline = prev;
          htmlEl.style.outlineOffset = prevOffset;
        }, 800);
      },
      color,
    )
    .catch(() => {});
}

async function centerAndHighlight(locator: Locator, color = 'magenta'): Promise<void> {
  await centerInViewport(locator);
  await highlightLocator(locator, color);
}

async function swaggerAuthorize(page: Page, token: string, timeoutMs: number): Promise<void> {
  const authBtn = page.getByRole('button', { name: /^Authorize$/i }).first();
  await authBtn.waitFor({ state: 'visible', timeout: timeoutMs });
  await centerAndHighlight(authBtn).catch(() => {});
  await authBtn.click({ timeout: timeoutMs });

  const modal = page.locator('.modal-ux, .dialog-ux, [role="dialog"]').first();
  await modal.waitFor({ state: 'visible', timeout: timeoutMs });

  const bearer = token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
  const inputCandidates = [
    modal.locator('input[type="text"]').first(),
    modal.locator('input').first(),
    page.locator('.auth-container input').first(),
  ];

  let filled = false;
  for (const input of inputCandidates) {
    const count = await input.count().catch(() => 0);
    if (!count) continue;
    try {
      await centerAndHighlight(input.first()).catch(() => {});
      await input.fill(bearer, { timeout: timeoutMs });
      filled = true;
      break;
    } catch {
      // try next
    }
  }
  if (!filled) throw new Error('Não foi possível preencher o token no modal de Authorize do Swagger.');

  const authorizeButtons = modal.getByRole('button', { name: /^Authorize$/i });
  if ((await authorizeButtons.count().catch(() => 0)) > 0) {
    await centerAndHighlight(authorizeButtons.first()).catch(() => {});
    await authorizeButtons.first().click({ timeout: timeoutMs });
  }

  await modal.getByRole('button', { name: /^Close$/i }).first().click({ timeout: timeoutMs }).catch(() => {});
  await modal.locator('button.btn.modal-btn').first().click({ timeout: timeoutMs }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
}

async function swaggerExecute(
  page: Page,
  opts: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    path: string;
    timeoutMs: number;
    pathParams?: Record<string, string>;
    requestBodyJson?: unknown;
    stepDelayMs?: number;
  },
): Promise<{ statusText: string; bodyText: string }> {
  const { method, path: endpointPath, timeoutMs, pathParams, requestBodyJson, stepDelayMs } = opts;
  const pauseMs = stepDelayMs ?? 0;

  const opblocks = page.locator('.opblock');
  const block = opblocks
    .filter({ has: page.locator('.opblock-summary-method', { hasText: method }) })
    .filter({ hasText: endpointPath })
    .first();

  if (!(await block.count().catch(() => 0))) {
    throw new Error(`Swagger: endpoint não encontrado na UI: ${method} ${endpointPath}`);
  }

  // Não "fechar" o endpoint: só abre se ainda não estiver aberto.
  const className = (await block.getAttribute('class').catch(() => '')) ?? '';
  const isOpen = /\bis-open\b/i.test(className);
  if (!isOpen) {
    const summary = block.locator('.opblock-summary').first();
    await centerAndHighlight(summary).catch(() => {});
    await summary.click({ timeout: timeoutMs }).catch(() => {});
    if (pauseMs > 0) await page.waitForTimeout(pauseMs);
  }

  const tryBtn = block.getByRole('button', { name: /Try it out/i }).first();
  if ((await tryBtn.count().catch(() => 0)) > 0) {
    await centerAndHighlight(tryBtn).catch(() => {});
    await tryBtn.click({ timeout: timeoutMs });
    if (pauseMs > 0) await page.waitForTimeout(pauseMs);
  }

  if (requestBodyJson !== undefined) {
    const bodyText = JSON.stringify(requestBodyJson, null, 2);
    const bodyCandidates = [
      block.locator('textarea.body-param__text').first(),
      block.locator('textarea').first(),
      block.locator('.body-param textarea').first(),
    ];

    let bodyFilled = false;
    for (const ta of bodyCandidates) {
      if (!(await ta.count().catch(() => 0))) continue;
      try {
        await centerAndHighlight(ta).catch(() => {});
        await ta.fill(bodyText, { timeout: timeoutMs });
        bodyFilled = true;
        break;
      } catch {
        // try next
      }
    }
    if (!bodyFilled) {
      // Alguns endpoints expõem campos como parâmetros (inputs) em vez de body.
      // Tenta preencher inputs pelo nome das chaves do JSON.
      if (requestBodyJson && typeof requestBodyJson === 'object' && !Array.isArray(requestBodyJson)) {
        const obj = requestBodyJson as Record<string, unknown>;
        for (const [k, v] of Object.entries(obj)) {
          const row = block.locator('tr').filter({ hasText: k }).first();
          const input = row.locator('input, textarea').first();
          if (!(await input.count().catch(() => 0))) continue;
          await centerAndHighlight(input).catch(() => {});
          await input.fill(String(v ?? ''), { timeout: timeoutMs }).catch(() => {});
        }
      }
      // eslint-disable-next-line no-console
      console.log(`[WARN] Swagger: não foi possível preencher request body para ${method} ${endpointPath} (tentado via parâmetros).`);
    }
    if (pauseMs > 0) await page.waitForTimeout(pauseMs);
  }

  if (pathParams && Object.keys(pathParams).length) {
    for (const [paramName, paramValue] of Object.entries(pathParams)) {
      const row = block.locator('tr').filter({ hasText: paramName }).first();
      const inputCandidates = [
        row.locator('input').first(),
        block.locator(`input[placeholder*="${paramName}" i]`).first(),
        block.locator(`input[name="${paramName}"]`).first(),
      ];
      for (const input of inputCandidates) {
        if (!(await input.count().catch(() => 0))) continue;
        await centerAndHighlight(input).catch(() => {});
        await input.fill(paramValue, { timeout: timeoutMs });
        break;
      }
    }
  }
  if (pauseMs > 0) await page.waitForTimeout(pauseMs);

  const execBtn = block.getByRole('button', { name: /^Execute$/i }).first();
  await centerAndHighlight(execBtn).catch(() => {});
  await execBtn.click({ timeout: timeoutMs });
  if (pauseMs > 0) await page.waitForTimeout(pauseMs);

  const responses = block.locator('.responses-wrapper, .responses-inner').first();
  await responses.waitFor({ state: 'visible', timeout: timeoutMs }).catch(() => {});

  const statusLoc = block.locator('.response .response-col_status, .response-col_status').first();
  const bodyLoc = block.locator('.response .response-col_description pre, .response-col_description pre').first();
  const statusText = ((await statusLoc.innerText({ timeout: 5000 }).catch(() => '')) || '').trim();
  const bodyText =
    ((await bodyLoc.innerText({ timeout: 5000 }).catch(() => '')) ||
      (await bodyLoc.textContent({ timeout: 5000 }).catch(() => '')) ||
      '')
      .toString()
      .trim();

  // Em modo visual, rola até o fim do response na UI (quando o elemento for scrollável).
  await centerAndHighlight(bodyLoc).catch(() => {});
  await bodyLoc
    .evaluate((el) => {
      const pre = el as HTMLElement;
      pre.scrollTop = pre.scrollHeight;
      try {
        pre.scrollIntoView({ block: 'end', inline: 'nearest' });
      } catch {
        // ignore
      }
    })
    .catch(() => {});
  await page.waitForTimeout(250).catch(() => {});

  // eslint-disable-next-line no-console
  console.log(`[RESP][SWAGGER_UI] ${method} ${endpointPath} status="${statusText}"`);
  // eslint-disable-next-line no-console
  console.log(formatResponseForLog(bodyText));
  // eslint-disable-next-line no-console
  console.log(
    `[RESP][FILE] ${writeResponseArtifact({ sac: 'SAC_100002', label: `${method}-${endpointPath}-swagger-ui`, bodyText })}`,
  );
  return { statusText, bodyText };
}

test.use({ video: 'on' });

test.describe('SAC_100002 - API (Swagger) - consulta de contrato', () => {
  const req = loadRequest();
  const timeoutMs = req.execucao?.timeout_por_passo_ms ?? 2000;
  const baseApiUrl = inferApiBaseUrl(req.env.base_url);
  const visualSwagger = process.env.SWAGGER_VISUAL ? process.env.SWAGGER_VISUAL === '1' : (req.execucao?.modo_visual ?? true);

  test.describe.configure({ mode: 'serial' });
  test.setTimeout(5 * 60 * 1000);

  test(`${req.sac.numero} - ${req.sac.nome}`, async ({ request, page }) => {
    const stepDelayMs = req.execucao?.delay_entre_passos_ms ?? 2000;
    if (visualSwagger) {
      await test.step('Abrir Swagger', async () => {
        logStep(req, 'Abrir Swagger');
        await openSwagger(page, req.env.base_url, timeoutMs);
        await delayIfConfigured(req, visualSwagger);
      });
    }

    const token = await test.step('Fazer autenticação (API)', async () => {
      logStep(req, 'Abrir endpoint /api/auth/usuarios, Try it out, preencher JSON e Execute (Swagger UI)');

      // Em modo visual, tenta obter token via Swagger UI para o usuário ver o passo a passo.
      if (visualSwagger) {
        const loginPath = req.entrada.request_login.startsWith('/') ? req.entrada.request_login : `/${req.entrada.request_login}`;
        const attempts: Array<Record<string, string>> = [
          { usuario: user, senha: pass },
          { login: user, senha: pass },
          { username: user, password: pass },
        ];

        for (const body of attempts) {
          const ui = await swaggerExecute(page, {
            method: 'POST',
            path: loginPath,
            timeoutMs,
            requestBodyJson: body,
            stepDelayMs,
          }).catch(async (e) => {
            // eslint-disable-next-line no-console
            console.log(`[WARN] Swagger UI login falhou (${loginPath}): ${String(e)}`);
            return { statusText: '', bodyText: '' };
          });

          const tokenFromUi = (() => {
            try {
              const parsed = ui.bodyText ? (JSON.parse(ui.bodyText) as unknown) : null;
              return findTokenDeep(parsed);
            } catch {
              return findTokenDeep(ui.bodyText);
            }
          })();

          if (tokenFromUi) {
            await delayIfConfigured(req, visualSwagger);
            return tokenFromUi;
          }
        }
      }

      // Fallback: autentica via APIRequestContext.
      const t = await obterToken(request, baseApiUrl, req, timeoutMs);
      await delayIfConfigured(req, visualSwagger);
      return t;
    });

    const headers = { Authorization: `Bearer ${token}` };

    if (visualSwagger) {
      await test.step('Authorize (Swagger UI)', async () => {
        logStep(req, 'Authorize (Swagger UI)');
        await swaggerAuthorize(page, token, timeoutMs);
        await delayIfConfigured(req, visualSwagger);
      });
    }

    const numeroContrato = process.env.NUMERO_CONTRATO?.trim() || req.entrada.contratos?.[0] || '19940533';
    const consultaPath = replacePathParams(req.entrada.request_consulta_contrato, { numeroContrato });
    const urlConsulta = joinUrl(baseApiUrl, consultaPath);

    await test.step('Consultar contrato (GET)', async () => {
      logStep(req, `Consultar contrato no endpoint GET ${consultaPath}`);

      if (visualSwagger) {
        await swaggerExecute(page, {
          method: 'GET',
          path: req.entrada.request_consulta_contrato,
          timeoutMs,
          pathParams: { numeroContrato },
          stepDelayMs,
        }).catch(async (e) => {
          // eslint-disable-next-line no-console
          console.log(`[WARN] Swagger UI GET falhou (${consultaPath}): ${String(e)}`);
        });
      }

      const resp = await request.get(urlConsulta, { headers, timeout: timeoutMs });
      const respBody = await resp.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.log(`[RESP][API] GET ${consultaPath} status=${resp.status()}`);
      // eslint-disable-next-line no-console
      console.log(formatResponseForLog(respBody));
      // eslint-disable-next-line no-console
      console.log(`[RESP][FILE] ${writeResponseArtifact({ sac: 'SAC_100002', label: `GET-${consultaPath}-api`, bodyText: respBody })}`);
      expect(resp.status(), 'Sucesso quando response retornar status code 200').toBe(200);
      await delayIfConfigured(req, visualSwagger);
    });
  });
});
