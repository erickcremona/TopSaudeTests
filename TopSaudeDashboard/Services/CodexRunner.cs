using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace TopSaudeDashboard.Services;

public sealed class CodexRunner
{
    private readonly WorkspaceLocator _workspace;
    private readonly TextFileService _textFiles;
    private readonly JobManager _jobs;

    public CodexRunner(WorkspaceLocator workspace, TextFileService textFiles, JobManager jobs)
    {
        _workspace = workspace;
        _textFiles = textFiles;
        _jobs = jobs;
    }

    public Task GenerateTestAsync(string jobId, string sacNumero, string sacNome, string passos, CancellationToken cancellationToken)
    {
        return Task.Run(async () =>
        {
            try
            {
                await GenerateTestCoreAsync(jobId, sacNumero, sacNome, passos, cancellationToken);
                _jobs.Succeed(jobId);
            }
            catch (OperationCanceledException)
            {
                _jobs.Fail(jobId, "Operacao cancelada.");
            }
            catch (Exception ex)
            {
                _jobs.Fail(jobId, ex.Message);
            }
        }, cancellationToken);
    }

    private async Task GenerateTestCoreAsync(string jobId, string sacNumero, string sacNome, string passos, CancellationToken cancellationToken)
    {
        sacNumero = NormalizeSac(sacNumero);
        if (string.IsNullOrWhiteSpace(sacNumero))
            throw new InvalidOperationException("Numero do SAC invalido.");

        var workspaceRoot = _workspace.GetWorkspaceRoot();

        var schemaPath = Path.Combine(Path.GetTempPath(), $"codex-generate-schema-{Guid.NewGuid():n}.json");
        var outputPath = Path.Combine(Path.GetTempPath(), $"codex-generate-output-{Guid.NewGuid():n}.json");

        await File.WriteAllTextAsync(schemaPath, GetOutputSchemaJson(), Encoding.UTF8, cancellationToken);

        var prompt = BuildPrompt(sacNumero, sacNome, passos);

        var (apiKey, useOss) = GetCodexAuthFromEnv(workspaceRoot);

        var args = new List<string>
        {
            "-a", "never",
            "-s", "read-only",
            "exec",
            "--ephemeral",
            "-C", QuoteArg(workspaceRoot),
            "--output-schema", QuoteArg(schemaPath),
            "--output-last-message", QuoteArg(outputPath),
        };

        if (useOss)
            args.Add("--oss");

        args.Add("-");

        var psi = new ProcessStartInfo
        {
            FileName = "codex",
            Arguments = string.Join(' ', args),
            WorkingDirectory = workspaceRoot,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };

        if (!string.IsNullOrWhiteSpace(apiKey))
            psi.Environment["OPENAI_API_KEY"] = apiKey;

        _jobs.Append(jobId, $"> codex {psi.Arguments}");

        using var process = Process.Start(psi);
        if (process is null)
            throw new InvalidOperationException("Falha ao iniciar o Codex CLI.");

        await process.StandardInput.WriteAsync(prompt);
        await process.StandardInput.FlushAsync();
        process.StandardInput.Close();

        var stdoutTask = RelayStreamAsync(process.StandardOutput, line => _jobs.Append(jobId, line), cancellationToken);
        var stderrTask = RelayStreamAsync(process.StandardError, line => _jobs.Append(jobId, $"[stderr] {line}"), cancellationToken);

        await Task.WhenAll(stdoutTask, stderrTask, process.WaitForExitAsync(cancellationToken));

        if (process.ExitCode != 0)
            throw new InvalidOperationException($"Codex terminou com exit code {process.ExitCode}. Veja os logs do job.");

        if (!File.Exists(outputPath))
            throw new InvalidOperationException("Codex nao gerou arquivo de saida (--output-last-message).");

        var outputJson = await File.ReadAllTextAsync(outputPath, Encoding.UTF8, cancellationToken);
        var result = ParseOutput(outputJson);

        var written = 0;
        foreach (var file in result.Files)
        {
            var rel = NormalizeRelPath(file.Path);
            ValidateGeneratedPath(rel);

            var abs = _workspace.ToAbsolutePath(rel);
            _textFiles.WriteText(abs, file.Content, Encoding.UTF8);
            written++;
            _jobs.Append(jobId, $"[OK] escrito: {rel}");
        }

        if (written == 0)
            throw new InvalidOperationException("Codex respondeu, mas nao retornou nenhum arquivo em files[].");

        foreach (var cmd in result.RunCommands)
            _jobs.Append(jobId, $"[RUN] {cmd}");

        if (!string.IsNullOrWhiteSpace(result.Notes))
            _jobs.Append(jobId, $"[NOTES] {result.Notes}");

        try
        {
            File.Delete(schemaPath);
            File.Delete(outputPath);
        }
        catch
        {
        }
    }

    private static async Task RelayStreamAsync(StreamReader reader, Action<string> onLine, CancellationToken cancellationToken)
    {
        while (!reader.EndOfStream)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var line = await reader.ReadLineAsync(cancellationToken);
            if (line is null)
                break;
            onLine(line);
        }
    }

    private sealed record CodexFile(string Path, string Content);
    private sealed record CodexOutput(IReadOnlyList<CodexFile> Files, IReadOnlyList<string> RunCommands, string? Notes);

    private static CodexOutput ParseOutput(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            var files = new List<CodexFile>();
            if (root.TryGetProperty("files", out var filesEl) && filesEl.ValueKind == JsonValueKind.Array)
            {
                foreach (var f in filesEl.EnumerateArray())
                {
                    if (f.ValueKind != JsonValueKind.Object)
                        continue;

                    var path = f.TryGetProperty("path", out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
                    var content = f.TryGetProperty("content", out var c) && c.ValueKind == JsonValueKind.String ? c.GetString() : null;

                    if (!string.IsNullOrWhiteSpace(path) && content is not null)
                        files.Add(new CodexFile(path!, content));
                }
            }

            var commands = new List<string>();
            if (root.TryGetProperty("runCommands", out var cmdsEl) && cmdsEl.ValueKind == JsonValueKind.Array)
            {
                foreach (var cmd in cmdsEl.EnumerateArray())
                {
                    if (cmd.ValueKind == JsonValueKind.String)
                        commands.Add(cmd.GetString() ?? string.Empty);
                }
            }

            string? notes = null;
            if (root.TryGetProperty("notes", out var notesEl) && notesEl.ValueKind == JsonValueKind.String)
                notes = notesEl.GetString();

            return new CodexOutput(files, commands, notes);
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException($"Falha ao parsear JSON de saida do Codex: {ex.Message}");
        }
    }

    private static (string? ApiKey, bool UseOss) GetCodexAuthFromEnv(string workspaceRoot)
    {
        string? apiKey = null;
        bool useOss = false;

        // Prioridade: variavel de ambiente do processo
        apiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY")
                 ?? Environment.GetEnvironmentVariable("CODEX_API_KEY");

        // Fallback: ler .env do workspace
        var envPath = Path.Combine(workspaceRoot, ".env");
        if (string.IsNullOrWhiteSpace(apiKey) && File.Exists(envPath))
        {
            foreach (var rawLine in File.ReadAllLines(envPath))
            {
                var line = rawLine.Trim();
                if (line.Length == 0 || line.StartsWith('#'))
                    continue;

                var idx = line.IndexOf('=');
                if (idx <= 0)
                    continue;

                var key = line[..idx].Trim();
                var value = line[(idx + 1)..].Trim();

                if (key.Equals("OPENAI_API_KEY", StringComparison.OrdinalIgnoreCase) || key.Equals("CODEX_API_KEY", StringComparison.OrdinalIgnoreCase))
                {
                    apiKey = value.Trim('"');
                    break;
                }
            }
        }

        if (string.IsNullOrWhiteSpace(apiKey))
            useOss = true;

        return (apiKey, useOss);
    }

    private static string NormalizeSac(string sacNumero)
    {
        sacNumero ??= string.Empty;
        sacNumero = sacNumero.Trim();

        if (sacNumero.Length == 0)
            return sacNumero;

        if (!sacNumero.StartsWith("SAC_", StringComparison.OrdinalIgnoreCase))
            sacNumero = "SAC_" + sacNumero;

        return sacNumero.ToUpperInvariant();
    }

    private static string NormalizeRelPath(string rel)
    {
        rel = (rel ?? string.Empty).Trim();
        rel = rel.Replace('\\', '/').TrimStart('/');
        return rel;
    }

    private static void ValidateGeneratedPath(string rel)
    {
        if (string.IsNullOrWhiteSpace(rel))
            throw new InvalidOperationException("Path gerado vazio.");

        if (rel.Contains("..", StringComparison.Ordinal))
            throw new InvalidOperationException("Path gerado invalido (..).");

        if (!(rel.StartsWith("tests/", StringComparison.OrdinalIgnoreCase) || rel.StartsWith("requests_ia/", StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"Path gerado fora do permitido: {rel}");

        var ext = Path.GetExtension(rel).ToLowerInvariant();
        if (ext is not ".ts" and not ".json" and not ".md")
            throw new InvalidOperationException($"Extensao nao permitida: {ext}");
    }

    private static string QuoteArg(string arg)
    {
        if (string.IsNullOrEmpty(arg))
            return "\"\"";

        if (!arg.Contains(' ') && !arg.Contains('"'))
            return arg;

        return '"' + arg.Replace("\"", "\\\"") + '"';
    }

    private static string BuildPrompt(string sacNumero, string sacNome, string passos)
    {
        var sb = new StringBuilder();
        sb.AppendLine("$prompt-router");
        sb.AppendLine();
        sb.AppendLine("Objetivo: gerar/atualizar testes Playwright (TypeScript) neste repo.");
        sb.AppendLine("Regras IMPORTANTES:");
        sb.AppendLine("- Sempre use os skills/agentes do repo (prompt-router -> skill dono).");
        sb.AppendLine("- Nao execute comandos e nao aplique patches automaticamente: apenas gere o JSON final no schema.");
        sb.AppendLine("- Nao invente detalhes; se faltar algo critico, devolva isso em notes.");
        sb.AppendLine();
        sb.AppendLine($"SAC: {sacNumero}");
        sb.AppendLine($"Nome: {sacNome}");
        sb.AppendLine();
        sb.AppendLine("Passo a passo (do usuario):");
        sb.AppendLine(passos);
        sb.AppendLine();
        sb.AppendLine("Fonte de verdade (paths do repo):");
        sb.AppendLine("- como-solicitar.md");
        sb.AppendLine("- config-app.json");
        sb.AppendLine("- skills/*/SKILL.md");
        sb.AppendLine("- tests/SAC_166839/*.spec.ts (referencia)");
        sb.AppendLine();
        sb.AppendLine("Entrega (obrigatorio):");
        sb.AppendLine("1) Criar um request JSON em requests_ia/{SAC}/request_{SAC}.json (ou request_api_*.json se for API)");
        sb.AppendLine("2) Criar um spec em tests/{SAC}/ com extensao .spec.ts seguindo os padroes do repo");
        sb.AppendLine("3) Incluir runCommands com o comando para rodar o spec em modo visual (headed ou ui)");
        sb.AppendLine();
        sb.AppendLine("Responda SOMENTE com o JSON valido que atende ao schema de output.");
        return sb.ToString();
    }

    private static string GetOutputSchemaJson() => """
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "files": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "path": { "type": "string" },
          "content": { "type": "string" }
        },
        "required": ["path", "content"]
      }
    },
    "runCommands": {
      "type": "array",
      "items": { "type": "string" }
    },
    "notes": { "type": ["string", "null"] }
  },
  "required": ["files", "runCommands", "notes"]
}
""";
}
