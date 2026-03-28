using Microsoft.AspNetCore.SignalR;

public record Stroke(float X0, float Y0, float X1, float Y1, string Role, bool IsEraser);

public interface IDrawHub
{
    Task DrawLine(float x0, float y0, float x1, float y1, string role, bool isEraser);
    Task ClearMyDrawing(string role);
    Task VoteNewGame(string role);
}

public class DrawHub : Hub, IDrawHub
{
    private static readonly List<Stroke> _strokes = [];
    private static readonly HashSet<string> _newGameVotes = [];

    public async Task DrawLine(float x0, float y0, float x1, float y1, string role, bool isEraser)
    {
        _strokes.Add(new Stroke(x0, y0, x1, y1, role, isEraser));
        await Clients.All.SendAsync("ReceiveLine", x0, y0, x1, y1, role, isEraser);
    }

    public async Task ClearMyDrawing(string role)
    {
        _strokes.RemoveAll(s => s.Role == role);
        await Clients.All.SendAsync("FullRedraw", _strokes);
    }

    public async Task VoteNewGame(string role)
    {
        _newGameVotes.Add(role);

        if (_newGameVotes.Contains("player1") && _newGameVotes.Contains("player2"))
        {
            _strokes.Clear();
            _newGameVotes.Clear();
            await Clients.All.SendAsync("FullRedraw", _strokes);
        }
        else
        {
            // Anderen informieren dass jemand gewählt hat
            await Clients.All.SendAsync("NewGameVoteUpdate", _newGameVotes.ToList());
        }
    }

    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.SendAsync("FullRedraw", _strokes);
        await Clients.Caller.SendAsync("NewGameVoteUpdate", _newGameVotes.ToList());
        await base.OnConnectedAsync();
    }
}