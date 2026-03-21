namespace TopSaudeDashboard.Models;

public sealed record TestSpecItem(
    string Path,
    string Sac,
    string FileName,
    DateTimeOffset LastWriteTime,
    string? Unidade,
    string? StatusContrato);
