namespace TopSaudeDashboard.Models;

public sealed record TimeSeriesPoint(string Date, int Count);

public sealed record DashboardSummary(
    int TotalSpecs,
    int TotalSacs,
    int TotalVideos,
    IReadOnlyList<TimeSeriesPoint> SpecsByDay,
    IReadOnlyList<TimeSeriesPoint> VideosByDay);
