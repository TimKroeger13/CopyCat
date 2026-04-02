using Microsoft.AspNetCore.SignalR;

public record Stroke(string Id, float X0, float Y0, float X1, float Y1, string Role, float Length);

public interface IDrawHub
{
    Task DrawLine(float x0, float y0, float x1, float y1, string role);
    Task EraseStrokes(List<string> ids, string role);
    Task ClearMyDrawing(string role);
    Task VoteNewGame(string role);
    Task RequestWords(string role);
    Task LeaveRole(); // <--- Added this
}

public class DrawHub : Hub, IDrawHub
{
    private static readonly List<Stroke> _strokes = [];
    private static readonly HashSet<string> _newGameVotes = [];
    private const float MaxInk = 10000f;
    private static readonly Dictionary<string, string> _roleToConnection = new();
    private static readonly Dictionary<string, string> _selectedWords = new();

    private static readonly string[] _words = File.Exists("Words.txt")
        ? File.ReadAllLines("Words.txt").Select(w => w.Trim()).Where(w => w.Length > 0).ToArray()
        : ["Katze", "Haus", "Auto", "Baum", "Hund"]; // Fallback

    private static float GetUsedInk(string role) =>
        _strokes.Where(s => s.Role == role).Sum(s => s.Length);

    private static string[] GetRandomWords(int count)
    {
        return _words.OrderBy(_ => Guid.NewGuid()).Take(count).ToArray();
    }

    public async Task RequestWords(string role)
    {
        if (role == "guesser") return;
        await Clients.Caller.SendAsync("ReceiveWordOptions", GetRandomWords(3));
    }

    public async Task ConfirmWordSelected(string role)
    {
        _selectedWords[role] = role; // nur tracken dass gewählt wurde

        if (_selectedWords.ContainsKey("player1") && _selectedWords.ContainsKey("player2"))
        {
            _selectedWords.Clear();
            // Countdown starten – Client zählt selbst runter
            await Clients.All.SendAsync("StartCountdown", 3);
        }
        else
        {
            await Clients.Caller.SendAsync("WaitingForWord");
        }
    }

    public async Task DrawLine(float x0, float y0, float x1, float y1, string role)
    {
        float used = GetUsedInk(role);
        if (used >= MaxInk) return;

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
            _selectedWords.Clear();
            await Clients.All.SendAsync("FullRedraw", _strokes);
            await Clients.All.SendAsync("GameReset"); // ← Clients holen sich Wörter
        }

        await Clients.All.SendAsync("NewGameVoteUpdate", _newGameVotes.ToList());
    }

    public async Task JoinRole(string role)
    {
        // 1. "Actions have consequences": If someone (even you) enters the role, clear it
        _strokes.RemoveAll(s => s.Role == role);

        // 2. Kick the previous occupant if it's someone else
        if (_roleToConnection.TryGetValue(role, out var oldConnectionId))
        {
            if (oldConnectionId != Context.ConnectionId)
            {
                await Clients.Client(oldConnectionId).SendAsync("Kicked");
            }
        }

        // 3. Update the mapping (Remove user from any old roles first)
        var existingEntry = _roleToConnection.FirstOrDefault(x => x.Value == Context.ConnectionId);
        if (existingEntry.Key != null) _roleToConnection.Remove(existingEntry.Key);
        
        if (role != "guesser") 
        {
            _roleToConnection[role] = Context.ConnectionId;
        }

        // 4. Sync everything
        await Clients.All.SendAsync("FullRedraw", _strokes);
        await Clients.All.SendAsync("UpdateOccupiedRoles", _roleToConnection.Keys.ToList());
        await Clients.Caller.SendAsync("RoleAccepted", role);
    }

    public async Task LeaveRole()
    {
        var existingEntry = _roleToConnection.FirstOrDefault(x => x.Value == Context.ConnectionId);
        if (existingEntry.Key != null)
        {
            _roleToConnection.Remove(existingEntry.Key);
            // Notify all clients that a role is now free
            await Clients.All.SendAsync("UpdateOccupiedRoles", _roleToConnection.Keys.ToList());
        }
    }

    // Clean up roles when someone leaves
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var roleEntry = _roleToConnection.FirstOrDefault(x => x.Value == Context.ConnectionId);
        if (roleEntry.Key != null)
        {
            _roleToConnection.Remove(roleEntry.Key);
            await Clients.All.SendAsync("UpdateOccupiedRoles", _roleToConnection.Keys.ToList());
        }
        await base.OnDisconnectedAsync(exception);
    }

    public override async Task OnConnectedAsync()
    {
        // Send the current list of occupied roles only to the new caller
        await Clients.Caller.SendAsync("UpdateOccupiedRoles", _roleToConnection.Keys.ToList());
        
        // Also send the current strokes so the canvas isn't empty if a game is in progress
        await Clients.Caller.SendAsync("FullRedraw", _strokes);

        await base.OnConnectedAsync();
    }
}