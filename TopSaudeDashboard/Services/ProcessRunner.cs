using System.Diagnostics;
using System.Text;

namespace TopSaudeDashboard.Services;

public sealed class ProcessRunner
{
    private readonly JobManager _jobs;

    public ProcessRunner(JobManager jobs)
    {
        _jobs = jobs;
    }

    public Task RunPlaywrightSpecAsync(string jobId, string workspaceRoot, string specWorkspaceRelativePath, string mode, CancellationToken cancellationToken)
    {
        EnsurePlaywrightInstalled(workspaceRoot);

        mode = string.IsNullOrWhiteSpace(mode) ? "headed" : mode.Trim().ToLowerInvariant();

        var specPathWindows = specWorkspaceRelativePath.Replace('/', '\\');
        var quotedSpec = QuoteArg(specPathWindows);

        // Preferir o runner local para nao cair no cache do npx.
        var cliPath = ".\\node_modules\\@playwright\\test\\cli.js";
        var quotedCli = QuoteArg(cliPath);

        var args = new List<string> { "/c", "node", quotedCli, "test", quotedSpec };

        if (mode is "ui")
            args.Add("--ui");
        else
            args.Add("--headed");

        args.Add("--workers=1");
        args.Add("--reporter=line");

        return RunProcessAsync(jobId, workspaceRoot, "cmd.exe", string.Join(' ', args), cancellationToken);
    }

    public async Task RunProcessAsync(string jobId, string workingDirectory, string fileName, string arguments, CancellationToken cancellationToken)
    {
        var psi = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            WorkingDirectory = workingDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };

        using var process = new Process { StartInfo = psi, EnableRaisingEvents = true };

        process.OutputDataReceived += (_, e) =>
        {
            if (e.Data is not null)
                _jobs.Append(jobId, e.Data);
        };

        process.ErrorDataReceived += (_, e) =>
        {
            if (e.Data is not null)
                _jobs.Append(jobId, $"[stderr] {e.Data}");
        };

        _jobs.Append(jobId, $"> {fileName} {arguments}");

        if (!process.Start())
            throw new InvalidOperationException("Falha ao iniciar processo.");

        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        try
        {
            await process.WaitForExitAsync(cancellationToken);
        }
        catch (OperationCanceledException)
        {
            try
            {
                if (!process.HasExited)
                    process.Kill(entireProcessTree: true);
            }
            catch
            {
            }

            throw;
        }

        if (process.ExitCode != 0)
            throw new InvalidOperationException($"Processo terminou com exit code {process.ExitCode}." +
                                                "\nDica: verifique o log do job (stderr) para o erro exato.");
    }

    private static void EnsurePlaywrightInstalled(string workspaceRoot)
    {
        var nodeModules = Path.Combine(workspaceRoot, "node_modules");
        var pwTestPkg = Path.Combine(nodeModules, "@playwright", "test", "package.json");
        var pwCli = Path.Combine(nodeModules, "@playwright", "test", "cli.js");

        if (File.Exists(pwCli) && File.Exists(pwTestPkg))
            return;

        throw new InvalidOperationException(
            "Dependencias do Playwright nao estao instaladas neste repo.\n" +
            "Execute na raiz do projeto (onde existe package.json):\n" +
            "- npm install\n" +
            "- npx playwright install\n" +
            "Depois tente rodar o spec novamente.");
    }

    private static string QuoteArg(string arg)
    {
        if (string.IsNullOrEmpty(arg))
            return "\"\"";

        if (!arg.Contains(' ') && !arg.Contains('"'))
            return arg;

        return '"' + arg.Replace("\"", "\\\"") + '"';
    }
}
