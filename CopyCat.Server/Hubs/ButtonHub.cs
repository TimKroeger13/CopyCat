using Microsoft.AspNetCore.SignalR;

public class ButtonHub : Hub
{
    // Statisch = geteilt zwischen allen Verbindungen
    private static bool _isGreen = false;

    public async Task ToggleButton(bool isGreen)
    {
        _isGreen = isGreen;
        await Clients.All.SendAsync("ButtonToggled", _isGreen);
    }

    // Wird automatisch aufgerufen wenn jemand verbindet
    public override async Task OnConnectedAsync()
    {
        // Neuen Client sofort auf aktuellen Stand bringen
        await Clients.Caller.SendAsync("ButtonToggled", _isGreen);
        await base.OnConnectedAsync();
    }
}