using System.Collections.Concurrent;
using System.Text.Json;
using TopSaudeDashboard.Models;

namespace TopSaudeDashboard.Services;

public sealed class TestRepository
{
    private readonly WorkspaceLocator _workspace;

    public TestRepository(WorkspaceLocator workspace)
    {
        _workspace = workspace;
    }

    public IReadOnlyList<TestSpecItem> ListSpecs(DateTimeOffset? from, DateTimeOffset? to, string? sac, string? unidade, string? statusContrato)
    {
        var root = _workspace.GetWorkspaceRoot();
        var testsDir = Path.Combine(root, "tests");

        var metadataBySac = LoadSacMetadata(root);

        var specs = new List<TestSpecItem>();
        foreach (var file in EnumerateFilesSafe(testsDir, "*.spec.*"))
        {
            var info = new FileInfo(file);
            var rel = _workspace.ToWorkspaceRelativePath(info.FullName);
            var inferredSac = InferSacFromPath(rel);

            metadataBySac.TryGetValue(inferredSac, out var meta);

            var item = new TestSpecItem(
                Path: rel,
                Sac: inferredSac,
                FileName: info.Name,
                LastWriteTime: info.LastWriteTimeUtc,
                Unidade: meta?.Unidade,
                StatusContrato: meta?.StatusContrato);

            if (from is not null && item.LastWriteTime < from.Value)
                continue;
            if (to is not null && item.LastWriteTime > to.Value)
                continue;
            if (!string.IsNullOrWhiteSpace(sac) && !item.Sac.Contains(sac, StringComparison.OrdinalIgnoreCase))
                continue;
            if (!string.IsNullOrWhiteSpace(unidade) && (item.Unidade is null || !item.Unidade.Contains(unidade, StringComparison.OrdinalIgnoreCase)))
                continue;
            if (!string.IsNullOrWhiteSpace(statusContrato) && (item.StatusContrato is null || !item.StatusContrato.Contains(statusContrato, StringComparison.OrdinalIgnoreCase)))
                continue;

            specs.Add(item);
        }

        return specs
            .OrderByDescending(s => s.LastWriteTime)
            .ToList();
    }

    public IReadOnlyList<VideoItem> ListVideos(DateTimeOffset? from, DateTimeOffset? to, string? sac)
    {
        var root = _workspace.GetWorkspaceRoot();
        var testsDir = Path.Combine(root, "tests");

        var videos = new List<VideoItem>();
        foreach (var file in EnumerateFilesSafe(testsDir, "*.webm"))
        {
            if (!file.Contains(Path.DirectorySeparatorChar + "videos" + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                continue;

            var info = new FileInfo(file);
            var rel = _workspace.ToWorkspaceRelativePath(info.FullName);
            var inferredSac = InferSacFromPath(rel);

            var item = new VideoItem(
                Path: rel,
                Sac: inferredSac,
                FileName: info.Name,
                LastWriteTime: info.LastWriteTimeUtc);

            if (from is not null && item.LastWriteTime < from.Value)
                continue;
            if (to is not null && item.LastWriteTime > to.Value)
                continue;
            if (!string.IsNullOrWhiteSpace(sac) && !item.Sac.Contains(sac, StringComparison.OrdinalIgnoreCase))
                continue;

            videos.Add(item);
        }

        return videos
            .OrderByDescending(v => v.LastWriteTime)
            .ToList();
    }

    public DashboardSummary GetSummary(int days = 30)
    {
        var specs = ListSpecs(null, null, null, null, null);
        var videos = ListVideos(null, null, null);

        var sacs = specs
            .Select(s => s.Sac)
            .Where(s => s.StartsWith("SAC_", StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Count();

        var fromDate = DateTimeOffset.UtcNow.Date.AddDays(-Math.Abs(days) + 1);

        var specsByDay = ToDailySeries(specs.Select(s => s.LastWriteTime), fromDate);
        var videosByDay = ToDailySeries(videos.Select(v => v.LastWriteTime), fromDate);

        return new DashboardSummary(
            TotalSpecs: specs.Count,
            TotalSacs: sacs,
            TotalVideos: videos.Count,
            SpecsByDay: specsByDay,
            VideosByDay: videosByDay);
    }

    private static IReadOnlyList<TimeSeriesPoint> ToDailySeries(IEnumerable<DateTimeOffset> dates, DateTimeOffset from)
    {
        var buckets = new Dictionary<string, int>(StringComparer.Ordinal);

        foreach (var d in dates)
        {
            if (d < from)
                continue;

            var day = d.UtcDateTime.ToString("yyyy-MM-dd");
            buckets.TryGetValue(day, out var count);
            buckets[day] = count + 1;
        }

        var result = new List<TimeSeriesPoint>();
        for (var day = from.UtcDateTime.Date; day <= DateTime.UtcNow.Date; day = day.AddDays(1))
        {
            var key = day.ToString("yyyy-MM-dd");
            buckets.TryGetValue(key, out var count);
            result.Add(new TimeSeriesPoint(key, count));
        }

        return result;
    }

    private sealed record SacMetadata(string? Unidade, string? StatusContrato);

    private static ConcurrentDictionary<string, SacMetadata> LoadSacMetadata(string workspaceRoot)
    {
        var dict = new ConcurrentDictionary<string, SacMetadata>(StringComparer.OrdinalIgnoreCase);
        var requestsDir = Path.Combine(workspaceRoot, "requests_ia");

        if (!Directory.Exists(requestsDir))
            return dict;

        foreach (var sacDir in Directory.EnumerateDirectories(requestsDir, "SAC_*", SearchOption.TopDirectoryOnly))
        {
            var sac = Path.GetFileName(sacDir);

            var requestPath = Path.Combine(sacDir, $"request_{sac}.json");
            if (!File.Exists(requestPath))
            {
                // fallback: qualquer request_*.json na pasta
                requestPath = Directory.EnumerateFiles(sacDir, "request_*.json", SearchOption.TopDirectoryOnly).FirstOrDefault() ?? requestPath;
            }

            if (!File.Exists(requestPath))
            {
                dict[sac] = new SacMetadata(null, null);
                continue;
            }

            try
            {
                using var stream = File.OpenRead(requestPath);
                using var doc = JsonDocument.Parse(stream);

                string? unidade = null;
                if (doc.RootElement.TryGetProperty("env", out var env) &&
                    env.ValueKind == JsonValueKind.Object &&
                    env.TryGetProperty("base_db_preferida", out var baseDb) &&
                    baseDb.ValueKind == JsonValueKind.String)
                {
                    unidade = baseDb.GetString();
                }

                dict[sac] = new SacMetadata(unidade, null);
            }
            catch
            {
                dict[sac] = new SacMetadata(null, null);
            }
        }

        return dict;
    }

    private static IEnumerable<string> EnumerateFilesSafe(string directory, string pattern)
    {
        if (!Directory.Exists(directory))
            yield break;

        var options = new EnumerationOptions
        {
            RecurseSubdirectories = true,
            IgnoreInaccessible = true,
            ReturnSpecialDirectories = false,
        };

        foreach (var file in Directory.EnumerateFiles(directory, pattern, options))
            yield return file;
    }

    private static string InferSacFromPath(string workspaceRelativePath)
    {
        var parts = workspaceRelativePath.Replace('\\', '/').Split('/', StringSplitOptions.RemoveEmptyEntries);
        foreach (var part in parts)
        {
            if (part.StartsWith("SAC_", StringComparison.OrdinalIgnoreCase))
                return part;
        }

        return "(sem SAC)";
    }
}
