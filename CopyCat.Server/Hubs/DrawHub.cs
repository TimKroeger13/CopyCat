using Microsoft.AspNetCore.SignalR;

public record Stroke(string Id, float X0, float Y0, float X1, float Y1, string Role, float Length);

public interface IDrawHub
{
    Task DrawLine(float x0, float y0, float x1, float y1, string role);
    Task EraseStrokes(List<string> ids, string role);
    Task ClearMyDrawing(string role);
    Task VoteNewGame(string role);
}

public class DrawHub : Hub, IDrawHub
{
    private static readonly List<Stroke> _strokes = [];
    private static readonly HashSet<string> _newGameVotes = [];
    private const float MaxInk = 10000f; // Pixel

    private static float GetUsedInk(string role) =>
        _strokes.Where(s => s.Role == role).Sum(s => s.Length);

    public async Task DrawLine(float x0, float y0, float x1, float y1, string role)
    {
        float used = GetUsedInk(role);
        if (used >= MaxInk) return;

        // Länge des Segments in normalisierten Koordinaten → Pixel (nehmen wir 1000x1000 als Referenz)
        float length = MathF.Sqrt(MathF.Pow((x1 - x0) * 1000, 2) + MathF.Pow((y1 - y0) * 1000, 2));

        var stroke = new Stroke(Guid.NewGuid().ToString(), x0, y0, x1, y1, role, length);
        _strokes.Add(stroke);

        await Clients.All.SendAsync("ReceiveLine", stroke);
        await Clients.Caller.SendAsync("InkUpdate", MaxInk - GetUsedInk(role), MaxInk);
    }

    public async Task EraseStrokes(List<string> ids, string role)
    {
        _strokes.RemoveAll(s => ids.Contains(s.Id) && s.Role == role);
        await Clients.All.SendAsync("FullRedraw", _strokes);
        await Clients.Caller.SendAsync("InkUpdate", MaxInk - GetUsedInk(role), MaxInk);
    }

    public async Task ClearMyDrawing(string role)
    {
        _strokes.RemoveAll(s => s.Role == role);
        await Clients.All.SendAsync("FullRedraw", _strokes);
        await Clients.Caller.SendAsync("InkUpdate", MaxInk, MaxInk);
    }

    public async Task VoteNewGame(string role)
    {
        if (_newGameVotes.Contains(role))
            _newGameVotes.Remove(role);
        else
            _newGameVotes.Add(role);

        if (_newGameVotes.Contains("player1") && _newGameVotes.Contains("player2"))
        {
            _strokes.Clear();
            _newGameVotes.Clear();
            await Clients.All.SendAsync("FullRedraw", _strokes);
        }

        await Clients.All.SendAsync("NewGameVoteUpdate", _newGameVotes.ToList());
    }

    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.SendAsync("FullRedraw", _strokes);
        await Clients.Caller.SendAsync("NewGameVoteUpdate", _newGameVotes.ToList());
        await base.OnConnectedAsync();
    }
}