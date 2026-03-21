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

    public async Task<CodexDiagnosticResult> TestConfigurationAsync(CancellationToken cancellationToken)
    {
        var workspaceRoot = _workspace.GetWorkspaceRoot();
        var executablePath = ResolveCodexExecutablePath();
        var auth = GetCodexAuthFromEnv(workspaceRoot);
        var version = await GetCodexVersionAsync(executablePath, cancellationToken);

        var authMode = auth.UseOss ? "oss" : "api-key";
        var detail = auth.UseOss
            ? "Provider OSS local configurado no Codex CLI."
            : "OPENAI_API_KEY/CODEX_API_KEY encontrado no ambiente ou no .env.";

        return new CodexDiagnosticResult(executablePath, version, authMode, detail);
    }

    public void OpenCodexApp()
    {
        var appId = ResolveCodexAppId();
        using var process = Process.Start(new ProcessStartInfo
        {
            FileName = "explorer.exe",
            Arguments = $"shell:AppsFolder\\{appId}",
            UseShellExecute = true,
        });

        if (process is null)
            throw new InvalidOperationException("Falha ao abrir o aplicativo do Codex.");
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

        var auth = GetCodexAuthFromEnv(workspaceRoot);

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

        if (auth.UseOss)
            args.Add("--oss");

        args.Add("-");

        var codexExecutable = ResolveCodexExecutablePath();

        var psi = new ProcessStartInfo
        {
            FileName = codexExecutable,
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

        if (!string.IsNullOrWhiteSpace(auth.ApiKey))
            psi.Environment["OPENAI_API_KEY"] = auth.ApiKey;

        _jobs.Append(jobId, $"> {codexExecutable} {psi.Arguments}");

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

    private sealed record CodexAuth(string? ApiKey, bool UseOss);

    private static CodexAuth GetCodexAuthFromEnv(string workspaceRoot)
    {
        string? apiKey = null;

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

        if (!string.IsNullOrWhiteSpace(apiKey))
            return new CodexAuth(apiKey, UseOss: false);

        if (HasOssProviderConfigured())
            return new CodexAuth(ApiKey: null, UseOss: true);

        throw new InvalidOperationException(
            "Codex sem autenticacao configurada.\n" +
            "Defina OPENAI_API_KEY (ou CODEX_API_KEY) no ambiente ou no arquivo .env da raiz do repo.\n" +
            "Se quiser usar --oss, configure antes um provider local no Codex CLI, como 'lmstudio' ou 'ollama'.");
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

    private static string ResolveCodexExecutablePath()
    {
        var candidates = new List<string>();

        var envCandidates = new[]
        {
            Environment.GetEnvironmentVariable("CODEX_PATH"),
            Environment.GetEnvironmentVariable("CODEX_EXE"),
        };

        foreach (var candidate in envCandidates)
        {
            if (!string.IsNullOrWhiteSpace(candidate))
                candidates.Add(candidate.Trim());
        }

        candidates.AddRange(FindExecutablesViaWhere("codex.exe"));
        candidates.AddRange(FindExecutablesViaWhere("codex"));

        var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (!string.IsNullOrWhiteSpace(userProfile))
        {
            var extensionsRoot = Path.Combine(userProfile, ".vscode", "extensions");
            if (Directory.Exists(extensionsRoot))
            {
                try
                {
                    var glob = Directory.GetFiles(extensionsRoot, "codex.exe", SearchOption.AllDirectories)
                        .Where(p => p.Contains($"{Path.DirectorySeparatorChar}openai.chatgpt-", StringComparison.OrdinalIgnoreCase))
                        .OrderByDescending(p => p, StringComparer.OrdinalIgnoreCase);
                    candidates.AddRange(glob);
                }
                catch
                {
                }
            }
        }

        foreach (var candidate in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(candidate))
                continue;

            if (File.Exists(candidate))
                return candidate;
        }

        throw new InvalidOperationException(
            "Nao foi possivel localizar o executavel do Codex CLI.\n" +
            "Defina CODEX_PATH/CODEX_EXE apontando para codex.exe ou instale o Codex CLI no ambiente.\n" +
            "No seu ambiente, um caminho tipico e algo como %USERPROFILE%\\.vscode\\extensions\\openai.chatgpt-*\\bin\\windows-x86_64\\codex.exe.");
    }

    private static IEnumerable<string> FindExecutablesViaWhere(string command)
    {
        var results = new List<string>();

        try
        {
            using var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "where.exe",
                    Arguments = command,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8,
                }
            };

            if (!process.Start())
                return results;

            while (!process.StandardOutput.EndOfStream)
            {
                var line = process.StandardOutput.ReadLine();
                if (!string.IsNullOrWhiteSpace(line))
                    results.Add(line.Trim());
            }

            process.WaitForExit(3000);
        }
        catch
        {
        }

        return results;
    }

    private static bool HasOssProviderConfigured()
    {
        var envProvider = Environment.GetEnvironmentVariable("CODEX_OSS_PROVIDER")
                          ?? Environment.GetEnvironmentVariable("OSS_PROVIDER");
        if (!string.IsNullOrWhiteSpace(envProvider))
            return true;

        var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (string.IsNullOrWhiteSpace(userProfile))
            return false;

        var configPath = Path.Combine(userProfile, ".codex", "config.toml");
        if (!File.Exists(configPath))
            return false;

        try
        {
            foreach (var rawLine in File.ReadAllLines(configPath))
            {
                var line = rawLine.Trim();
                if (line.Length == 0 || line.StartsWith('#'))
                    continue;

                if (!line.StartsWith("oss_provider", StringComparison.OrdinalIgnoreCase))
                    continue;

                var idx = line.IndexOf('=');
                if (idx <= 0)
                    continue;

                var value = line[(idx + 1)..].Trim().Trim('"', '\'');
                if (!string.IsNullOrWhiteSpace(value))
                    return true;
            }
        }
        catch
        {
        }

        return false;
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

    private static async Task<string> GetCodexVersionAsync(string executablePath, CancellationToken cancellationToken)
    {
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = executablePath,
                Arguments = "--version",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
            }
        };

        if (!process.Start())
            throw new InvalidOperationException("Falha ao iniciar o Codex CLI para verificar a versao.");

        var stdout = process.StandardOutput.ReadToEndAsync(cancellationToken);
        var stderr = process.StandardError.ReadToEndAsync(cancellationToken);
        await Task.WhenAll(stdout, stderr, process.WaitForExitAsync(cancellationToken));

        if (process.ExitCode != 0)
        {
            var detail = string.IsNullOrWhiteSpace(stderr.Result) ? stdout.Result : stderr.Result;
            throw new InvalidOperationException($"Falha ao consultar a versao do Codex CLI.\n{detail.Trim()}");
        }

        var version = stdout.Result.Trim();
        return string.IsNullOrWhiteSpace(version) ? "(versao nao informada)" : version;
    }

    private static string ResolveCodexAppId()
    {
        const string fallbackAppId = "OpenAI.Codex_2p2nqsd0c76g0!App";

        foreach (var appId in FindCodexAppIds())
        {
            if (!string.IsNullOrWhiteSpace(appId))
                return appId;
        }

        return fallbackAppId;
    }

    private static IEnumerable<string> FindCodexAppIds()
    {
        var results = new List<string>();

        try
        {
            using var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = "-NoProfile -Command \"Get-StartApps | Where-Object { $_.Name -match 'Codex|OpenAI' } | Select-Object -ExpandProperty AppID\"",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8,
                }
            };

            if (!process.Start())
                return results;

            while (!process.StandardOutput.EndOfStream)
            {
                var line = process.StandardOutput.ReadLine();
                if (string.IsNullOrWhiteSpace(line))
                    continue;

                results.Add(line.Trim());
            }

            process.WaitForExit(3000);
        }
        catch
        {
        }

        return results;
    }

    public sealed record CodexDiagnosticResult(string ExecutablePath, string Version, string AuthMode, string Detail);
}
