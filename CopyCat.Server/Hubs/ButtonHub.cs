using Microsoft.AspNetCore.SignalR;

public class ButtonHub : Hub
{
    public async Task ToggleButton(bool isGreen)
    {
        // Sendet an ALLE verbundenen Clients (inkl. Sender)
        await Clients.All.SendAsync("ButtonToggled", isGreen);
    }
}