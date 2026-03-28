using Microsoft.AspNetCore.SignalR;

public interface IDrawHub
{
    Task DrawLine(float x0, float y0, float x1, float y1);
    Task ClearCanvas();
}

public class DrawHub : Hub, IDrawHub
{
    // Jeder Strich = 4 Koordinaten (relativ 0-1, damit es auf allen Screens passt)
    private static readonly List<(float x0, float y0, float x1, float y1)> _strokes = [];

    public async Task DrawLine(float x0, float y0, float x1, float y1)
    {
        _strokes.Add((x0, y0, x1, y1));
        await Clients.All.SendAsync("ReceiveLine", x0, y0, x1, y1);
    }

    public async Task ClearCanvas()
    {
        _strokes.Clear();
        await Clients.All.SendAsync("CanvasCleared");
    }

    public override async Task OnConnectedAsync()
    {
        // Neuer Spieler bekommt alle bisherigen Striche
        foreach (var s in _strokes)
            await Clients.Caller.SendAsync("ReceiveLine", s.x0, s.y0, s.x1, s.y1);

        await base.OnConnectedAsync();
    }
}