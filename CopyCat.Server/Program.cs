var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSignalR();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins("http://localhost:5500", "http://127.0.0.1:5500")// Live Server Port
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials());
});

var app = builder.Build();
app.UseCors();
app.MapHub<ButtonHub>("/buttonHub"); // URL des Hubs
app.Run();