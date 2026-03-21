using System.Collections.Concurrent;
using System.Threading.Channels;

namespace TopSaudeDashboard.Services;

public enum JobState
{
    Running = 0,
    Succeeded = 1,
    Failed = 2,
}

public sealed record JobInfo(
    string Id,
    string Name,
    string Type,
    DateTimeOffset StartedAt,
    DateTimeOffset? FinishedAt,
    JobState State,
    string? Error);

public sealed class JobManager
{
    private sealed class Job
    {
        public required string Id { get; init; }
        public required string Name { get; init; }
        public required string Type { get; init; }
        public required DateTimeOffset StartedAt { get; init; }
        public DateTimeOffset? FinishedAt { get; set; }
        public JobState State { get; set; }
        public string? Error { get; set; }

        public Channel<string> Output { get; } = System.Threading.Channels.Channel.CreateUnbounded<string>(new UnboundedChannelOptions
        {
            SingleReader = false,
            SingleWriter = false,
            AllowSynchronousContinuations = false,
        });

        public ConcurrentQueue<string> Lines { get; } = new();
    }

    private readonly ConcurrentDictionary<string, Job> _jobs = new(StringComparer.Ordinal);

    public JobInfo Create(string name, string type)
    {
        var id = Guid.NewGuid().ToString("n");
        var job = new Job
        {
            Id = id,
            Name = name,
            Type = type,
            StartedAt = DateTimeOffset.UtcNow,
            State = JobState.Running,
        };

        _jobs[id] = job;
        return ToInfo(job);
    }

    public JobInfo Get(string id)
    {
        if (!_jobs.TryGetValue(id, out var job))
            throw new KeyNotFoundException("Job nao encontrado.");

        return ToInfo(job);
    }

    public void Append(string id, string line)
    {
        if (!_jobs.TryGetValue(id, out var job))
            return;

        line ??= string.Empty;
        job.Lines.Enqueue(line);
        while (job.Lines.Count > 5000 && job.Lines.TryDequeue(out _))
        {
        }

        job.Output.Writer.TryWrite(line);
    }

    public void Succeed(string id)
    {
        if (!_jobs.TryGetValue(id, out var job))
            return;

        job.State = JobState.Succeeded;
        job.FinishedAt = DateTimeOffset.UtcNow;
        job.Output.Writer.TryComplete();
    }

    public void Fail(string id, string error)
    {
        if (!_jobs.TryGetValue(id, out var job))
            return;

        job.State = JobState.Failed;
        job.Error = error;
        job.FinishedAt = DateTimeOffset.UtcNow;
        job.Output.Writer.TryWrite($"[ERRO] {error}");
        job.Output.Writer.TryComplete();
    }

    public IReadOnlyList<string> GetLines(string id)
    {
        if (!_jobs.TryGetValue(id, out var job))
            throw new KeyNotFoundException("Job nao encontrado.");

        return job.Lines.ToArray();
    }

    public IAsyncEnumerable<string> Stream(string id, CancellationToken cancellationToken)
    {
        if (!_jobs.TryGetValue(id, out var job))
            throw new KeyNotFoundException("Job nao encontrado.");

        return job.Output.Reader.ReadAllAsync(cancellationToken);
    }

    private static JobInfo ToInfo(Job job) => new(
        job.Id,
        job.Name,
        job.Type,
        job.StartedAt,
        job.FinishedAt,
        job.State,
        job.Error);
}

