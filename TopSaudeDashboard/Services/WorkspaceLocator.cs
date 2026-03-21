using System.Diagnostics;

namespace TopSaudeDashboard.Services;

public sealed class WorkspaceLocator
{
    private readonly IWebHostEnvironment _env;
    private string? _cachedRoot;

    public WorkspaceLocator(IWebHostEnvironment env)
    {
        _env = env;
    }

    public string GetWorkspaceRoot()
    {
        if (_cachedRoot is not null)
            return _cachedRoot;

        var candidates = new List<string>();

        var cwd = Directory.GetCurrentDirectory();
        candidates.Add(cwd);

        var contentRoot = _env.ContentRootPath;
        candidates.Add(contentRoot);

        foreach (var candidate in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var found = FindRepoRootUpwards(candidate);
            if (found is not null)
            {
                _cachedRoot = found;
                return _cachedRoot;
            }
        }

        throw new InvalidOperationException(
            "Nao foi possivel localizar a raiz do workspace. Rode a aplicacao a partir do repo (onde existem tests/, requests_ia/ e config-app.json).");
    }

    public string ToAbsolutePath(string workspaceRelativePath)
    {
        if (string.IsNullOrWhiteSpace(workspaceRelativePath))
            throw new ArgumentException("Path vazio.", nameof(workspaceRelativePath));

        if (workspaceRelativePath.Contains('\\'))
            workspaceRelativePath = workspaceRelativePath.Replace('\\', '/');

        if (workspaceRelativePath.StartsWith("/", StringComparison.Ordinal))
            workspaceRelativePath = workspaceRelativePath.TrimStart('/');

        if (workspaceRelativePath.Contains("..", StringComparison.Ordinal))
            throw new InvalidOperationException("Path invalido (path traversal).");

        var root = GetWorkspaceRoot();
        var combined = Path.GetFullPath(Path.Combine(root, workspaceRelativePath));
        var fullRoot = Path.GetFullPath(root);

        if (!combined.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Path fora do workspace.");

        return combined;
    }

    public string ToWorkspaceRelativePath(string absolutePath)
    {
        var root = GetWorkspaceRoot();
        var fullRoot = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var full = Path.GetFullPath(absolutePath);

        if (!full.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Path fora do workspace.");

        var relative = full[fullRoot.Length..];
        return relative.Replace('\\', '/');
    }

    private static string? FindRepoRootUpwards(string start)
    {
        var current = new DirectoryInfo(start);
        for (var i = 0; i < 8 && current is not null; i++)
        {
            var hasTests = Directory.Exists(Path.Combine(current.FullName, "tests"));
            var hasRequests = Directory.Exists(Path.Combine(current.FullName, "requests_ia"));
            var hasConfig = File.Exists(Path.Combine(current.FullName, "config-app.json"));
            var hasPackage = File.Exists(Path.Combine(current.FullName, "package.json"));

            if (hasTests && hasRequests && hasConfig && hasPackage)
                return current.FullName;

            current = current.Parent;
        }

        return null;
    }
}
