const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// Canvas Pixel-Größe = echte Größe des Elements
function resizeCanvas() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// --- SignalR ---
const serverUrl = window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
    ? "http://localhost:5142"
    : "https://tkroeger.com/button";

const connection = new signalR.HubConnectionBuilder()
    .withUrl(`${serverUrl}/drawHub`)
    .build();

// Linie empfangen (relative Koordinaten → absolute Pixel)
connection.on("ReceiveLine", (x0, y0, x1, y1) => {
    drawLine(
        x0 * canvas.width,
        y0 * canvas.height,
        x1 * canvas.width,
        y1 * canvas.height
    );
});

connection.on("CanvasCleared", () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

connection.start().catch(err => console.error(err));

// --- Zeichnen ---
function drawLine(x0, y0, x1, y1) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.stroke();
}

let isDrawing = false;
let lastX = 0;
let lastY = 0;

function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    // Touch oder Mouse
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

function startDraw(e) {
    isDrawing = true;
    const pos = getPos(e);
    lastX = pos.x;
    lastY = pos.y;
}

function draw(e) {
    if (!isDrawing) return;
    const pos = getPos(e);

    // Absolut → relativ (0-1) damit es auf allen Screens gleich aussieht
    const x0 = lastX / canvas.width;
    const y0 = lastY / canvas.height;
    const x1 = pos.x / canvas.width;
    const y1 = pos.y / canvas.height;

    connection.invoke("DrawLine", x0, y0, x1, y1);

    lastX = pos.x;
    lastY = pos.y;
}

function stopDraw() {
    isDrawing = false;
}

// Mouse Events (Desktop)
canvas.addEventListener("mousedown", startDraw);
canvas.addEventListener("mousemove", draw);
canvas.addEventListener("mouseup", stopDraw);
canvas.addEventListener("mouseleave", stopDraw);

// Touch Events (Mobile)
canvas.addEventListener("touchstart", startDraw);
canvas.addEventListener("touchmove", draw);
canvas.addEventListener("touchend", stopDraw);

function clearCanvas() {
    connection.invoke("ClearCanvas");
}