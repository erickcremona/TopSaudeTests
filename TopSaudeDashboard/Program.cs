using TopSaudeDashboard;
using System.Diagnostics;
using TopSaudeDashboard.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorPages();

builder.Services.AddSingleton<WorkspaceLocator>();
builder.Services.AddSingleton<TextFileService>();
builder.Services.AddSingleton<TestRepository>();
builder.Services.AddSingleton<JobManager>();
builder.Services.AddSingleton<ProcessRunner>();
builder.Services.AddSingleton<CodexRunner>();
builder.Services.AddHttpContextAccessor();

var app = builder.Build();

app.UseExceptionHandler(exceptionApp =>
{
    exceptionApp.Run(async context =>
    {
        var exceptionFeature = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerPathFeature>();
        var exception = exceptionFeature?.Error;

        var requestPath = context.Request.Path.Value ?? string.Empty;
        var isApi = requestPath.StartsWith("/api", StringComparison.OrdinalIgnoreCase);

        if (!isApi)
        {
            context.Response.Redirect("/Error");
            return;
        }

        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.ContentType = "application/json; charset=utf-8";
        await context.Response.WriteAsJsonAsync(new
        {
            error = "Erro inesperado no servidor.",
            detail = exception?.Message,
            traceId = Activity.Current?.Id ?? context.TraceIdentifier,
        });
    });
});

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();

app.MapRazorPages();
ApiEndpoints.Map(app);

app.Run();
