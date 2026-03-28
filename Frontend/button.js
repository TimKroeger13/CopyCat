let isGreen = false;

// Verbindung zum Hub aufbauen
const serverUrl = window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
    ? "http://localhost:5142"      // lokal
    : "https://tkroeger.com/button";   // production

const connection = new signalR.HubConnectionBuilder()
    .withUrl(`${serverUrl}/buttonHub`)
    .build();

// Event vom Server empfangen
connection.on("ButtonToggled", (green) => {
    debugger;
    const btn = document.getElementById("btn");
    btn.style.background = green ? "green" : "red";
    btn.innerHTML = green ? "Green" : "Red";

    if(btn.style.background == "green") {
        isGreen = true;
    }else {
        isGreen = false;
    }
});

connection.start().catch(err => console.error(err));

// Button gedrückt → an Server schicken
function toggle() {
    debugger;
    isGreen = !isGreen;
    connection.invoke("ToggleButton", isGreen);
}