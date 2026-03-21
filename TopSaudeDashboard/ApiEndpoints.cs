using System.Globalization;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using TopSaudeDashboard.Models;
using TopSaudeDashboard.Services;

namespace TopSaudeDashboard;

public static class ApiEndpoints
{
    public static void Map(WebApplication app)
    {
        var api = app.MapGroup("/api");

        api.MapGet("/summary", ([FromServices] TestRepository repo) => repo.GetSummary());

        api.MapGet("/specs", (
            [FromServices] TestRepository repo,
            [FromQuery] string? sac,
            [FromQuery] string? unidade,
            [FromQuery] string? statusContrato,
            [FromQuery] DateTimeOffset? from,
            [FromQuery] DateTimeOffset? to) =>
        {
            var specs = repo.ListSpecs(from, to, sac, unidade, statusContrato);
            return Results.Ok(specs);
        });

        api.MapGet("/videos", (
            [FromServices] TestRepository repo,
            [FromQuery] string? sac,
            [FromQuery] DateTimeOffset? from,
            [FromQuery] DateTimeOffset? to) =>
        {
            var videos = repo.ListVideos(from, to, sac);
            return Results.Ok(videos);
        });

        api.MapGet("/videos/stream", (
            [FromServices] WorkspaceLocator workspace,
            [FromQuery] string path) =>
        {
            if (string.IsNullOrWhiteSpace(path))
                return Results.BadRequest(new { error = "Parametro 'path' e obrigatorio." });

            path = path.Replace('\\', '/');
            if (!path.EndsWith(".webm", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "Arquivo invalido (esperado .webm)." });

            if (!path.StartsWith("tests/", StringComparison.OrdinalIgnoreCase) || !path.Contains("/videos/", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "Arquivo fora do diretorio tests/*/videos." });

            var abs = workspace.ToAbsolutePath(path);
            if (!File.Exists(abs))
                return Results.NotFound(new { error = "Video nao encontrado." });

            return Results.File(abs, "video/webm", enableRangeProcessing: true);
        });

        api.MapPost("/specs/run", async (
            [FromServices] WorkspaceLocator workspace,
            [FromServices] JobManager jobs,
            [FromServices] ProcessRunner runner,
            [FromBody] RunSpecRequest request,
            CancellationToken cancellationToken) =>
        {
            if (string.IsNullOrWhiteSpace(request.Path))
                return Results.BadRequest(new { error = "Campo 'path' e obrigatorio." });

            var rel = request.Path.Replace('\\', '/').TrimStart('/');
            if (!rel.StartsWith("tests/", StringComparison.OrdinalIgnoreCase) || !rel.EndsWith(".spec.ts", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "Informe um arquivo .spec.ts dentro de tests/." });

            var abs = workspace.ToAbsolutePath(rel);
            if (!File.Exists(abs))
                return Results.NotFound(new { error = "Spec nao encontrado." });

            var job = jobs.Create($"Run {Path.GetFileName(rel)}", "playwright");

            _ = Task.Run(async () =>
            {
                try
                {
                    await runner.RunPlaywrightSpecAsync(job.Id, workspace.GetWorkspaceRoot(), rel, request.Mode ?? "headed", cancellationToken);
                    jobs.Succeed(job.Id);
                }
                catch (Exception ex)
                {
                    jobs.Fail(job.Id, ex.Message);
                }
            }, cancellationToken);

            return Results.Ok(job);
        });

        api.MapPost("/generate", (
            [FromServices] JobManager jobs,
            [FromServices] CodexRunner codex,
            [FromBody] GenerateTestRequest request,
            CancellationToken cancellationToken) =>
        {
            if (string.IsNullOrWhiteSpace(request.SacNumero))
                return Results.BadRequest(new { error = "Campo 'sacNumero' e obrigatorio." });
            if (string.IsNullOrWhiteSpace(request.SacNome))
                return Results.BadRequest(new { error = "Campo 'sacNome' e obrigatorio." });
            if (string.IsNullOrWhiteSpace(request.Passos))
                return Results.BadRequest(new { error = "Campo 'passos' e obrigatorio." });

            var job = jobs.Create($"Gerar {request.SacNumero}", "codex");
            jobs.Append(job.Id, "Iniciando solicitacao ao Codex via skills do repo...");

            _ = codex.GenerateTestAsync(job.Id, request.SacNumero, request.SacNome, request.Passos, cancellationToken);

            return Results.Ok(job);
        });

        api.MapGet("/jobs/{id}", (
            [FromServices] JobManager jobs,
            [FromRoute] string id) =>
        {
            var info = jobs.Get(id);
            return Results.Ok(new
            {
                info,
                lines = jobs.GetLines(id)
            });
        });

        api.MapGet("/jobs/{id}/events", async (
            HttpContext context,
            [FromServices] JobManager jobs,
            [FromRoute] string id,
            CancellationToken cancellationToken) =>
        {
            context.Response.Headers.CacheControl = "no-cache";
            context.Response.Headers.Connection = "keep-alive";
            context.Response.ContentType = "text/event-stream";


            await foreach (var line in jobs.Stream(id, cancellationToken))
            {
                await WriteSseAsync(context, line, cancellationToken);
            }
        });

        api.MapGet("/config/env", ([FromServices] WorkspaceLocator workspace, [FromServices] TextFileService files) =>
        {
            var abs = workspace.ToAbsolutePath(".env");
            if (!File.Exists(abs))
                return Results.NotFound(new { error = ".env nao encontrado na raiz do repo." });

            var (content, encoding) = files.ReadTextAuto(abs);
            return Results.Ok(new { path = ".env", encoding = encoding.WebName, content });
        });

        api.MapPut("/config/env", (
            [FromServices] WorkspaceLocator workspace,
            [FromServices] TextFileService files,
            [FromBody] SaveFileRequest request) =>
        {
            if (request.Content is null)
                return Results.BadRequest(new { error = "Campo 'content' e obrigatorio." });

            var abs = workspace.ToAbsolutePath(".env");
            files.WriteTextPreservingEncoding(abs, request.Content);
            return Results.Ok(new { ok = true });
        });

        api.MapGet("/config/app", ([FromServices] WorkspaceLocator workspace, [FromServices] TextFileService files) =>
        {
            var abs = workspace.ToAbsolutePath("config-app.json");
            if (!File.Exists(abs))
                return Results.NotFound(new { error = "config-app.json nao encontrado." });

            var (content, encoding) = files.ReadTextAuto(abs);
            return Results.Ok(new { path = "config-app.json", encoding = encoding.WebName, content });
        });

        api.MapPut("/config/app", (
            [FromServices] WorkspaceLocator workspace,
            [FromServices] TextFileService files,
            [FromBody] SaveFileRequest request) =>
        {
            if (request.Content is null)
                return Results.BadRequest(new { error = "Campo 'content' e obrigatorio." });

            var abs = workspace.ToAbsolutePath("config-app.json");
            files.WriteTextPreservingEncoding(abs, request.Content);
            return Results.Ok(new { ok = true });
        });

        api.MapGet("/docs/como-solicitar", ([FromServices] WorkspaceLocator workspace, [FromServices] TextFileService files) =>
        {
            var abs = workspace.ToAbsolutePath("como-solicitar.md");
            if (!File.Exists(abs))
                return Results.NotFound(new { error = "como-solicitar.md nao encontrado." });

            var (content, encoding) = files.ReadTextAuto(abs);
            return Results.Ok(new { path = "como-solicitar.md", encoding = encoding.WebName, content });
        });

        api.MapGet("/specs/export", (
            [FromServices] TestRepository repo,
            [FromQuery] string? sac,
            [FromQuery] string? unidade,
            [FromQuery] string? statusContrato,
            [FromQuery] DateTimeOffset? from,
            [FromQuery] DateTimeOffset? to) =>
        {
            var specs = repo.ListSpecs(from, to, sac, unidade, statusContrato);
            var xml = SpreadsheetXml(
                "Specs",
                new[] { "SAC", "Arquivo", "Path", "UltimaAtualizacaoUtc", "Unidade" },
                specs.Select(s => new[] { s.Sac, s.FileName, s.Path, s.LastWriteTime.ToString("O"), s.Unidade ?? string.Empty }));

            return Results.File(Encoding.UTF8.GetBytes(xml), "application/vnd.ms-excel", $"specs-{DateTime.UtcNow:yyyyMMdd-HHmmss}.xls");
        });

        api.MapGet("/videos/export", (
            [FromServices] TestRepository repo,
            [FromQuery] string? sac,
            [FromQuery] DateTimeOffset? from,
            [FromQuery] DateTimeOffset? to) =>
        {
            var videos = repo.ListVideos(from, to, sac);
            var xml = SpreadsheetXml(
                "Videos",
                new[] { "SAC", "Arquivo", "Path", "UltimaAtualizacaoUtc" },
                videos.Select(v => new[] { v.Sac, v.FileName, v.Path, v.LastWriteTime.ToString("O") }));

            return Results.File(Encoding.UTF8.GetBytes(xml), "application/vnd.ms-excel", $"videos-{DateTime.UtcNow:yyyyMMdd-HHmmss}.xls");
        });
    }

    private static async Task WriteSseAsync(HttpContext context, string line, CancellationToken cancellationToken)
    {
        // SSE format: data: ...\n\n
        line = line.Replace("\r", string.Empty, StringComparison.Ordinal);
        await context.Response.WriteAsync($"data: {line}\n\n", cancellationToken);
        await context.Response.Body.FlushAsync(cancellationToken);
    }

    private static string SpreadsheetXml(string worksheetName, IEnumerable<string> headers, IEnumerable<string[]> rows)
    {
        static string Esc(string s) => System.Security.SecurityElement.Escape(s) ?? string.Empty;

        var sb = new StringBuilder();
        sb.Append("<?xml version=\"1.0\"?>");
        sb.Append("<Workbook xmlns=\"urn:schemas-microsoft-com:office:spreadsheet\" xmlns:ss=\"urn:schemas-microsoft-com:office:spreadsheet\">");
        sb.Append($"<Worksheet ss:Name=\"{Esc(worksheetName)}\"><Table>");

        sb.Append("<Row>");
        foreach (var h in headers)
            sb.Append($"<Cell><Data ss:Type=\"String\">{Esc(h)}</Data></Cell>");
        sb.Append("</Row>");

        foreach (var row in rows)
        {
            sb.Append("<Row>");
            foreach (var cell in row)
                sb.Append($"<Cell><Data ss:Type=\"String\">{Esc(cell ?? string.Empty)}</Data></Cell>");
            sb.Append("</Row>");
        }

        sb.Append("</Table></Worksheet></Workbook>");
        return sb.ToString();
    }

    public sealed record RunSpecRequest(string Path, string? Mode);
    public sealed record GenerateTestRequest(string SacNumero, string SacNome, string Passos);
    public sealed record SaveFileRequest(string Content);
}

