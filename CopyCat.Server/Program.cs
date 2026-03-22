var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSignalR();
builder.Services.AddTransient<IButtonHub, ButtonHub>();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins("http://localhost:5500", "http://127.0.0.1:5500", "https://tkroeger.com", "http://tkroeger.com")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials());
});

var app = builder.Build();
app.UseCors();
app.MapHub<ButtonHub>("/buttonHub");
app.Run();