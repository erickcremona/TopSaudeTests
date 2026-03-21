namespace TopSaudeDashboard.Models;

public sealed record VideoItem(
    string Path,
    string Sac,
    string FileName,
    DateTimeOffset LastWriteTime);
