const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let myRole = null;
let currentTool = "pen"; // "pen" | "eraser"

// --- Canvas Resize ---
function resizeCanvas() {
    // Striche merken, Größe ändern, neu zeichnen
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    redrawAll();
}
window.addEventListener("resize", resizeCanvas);

// --- SignalR ---
const serverUrl = window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
    ? "http://localhost:5142"
    : "https://tkroeger.com/button";

const connection = new signalR.HubConnectionBuilder()
    .withUrl(`${serverUrl}/drawHub`)
    .build();

connection.on("ReceiveLine", (x0, y0, x1, y1, role, isEraser) => {
    allStrokes.push({ x0, y0, x1, y1, role, isEraser });
    renderStroke({ x0, y0, x1, y1, role, isEraser });
});

connection.on("FullRedraw", (strokes) => {
    allStrokes = strokes;
    redrawAll();
});

connection.on("NewGameVoteUpdate", (votes) => {
    const hint = document.getElementById("newGameHint");
    if (votes.length === 0) {
        hint.textContent = "";
    } else {
        hint.textContent = `⏳ Waiting for ${votes.includes("player1") ? "Player 2" : "Player 1"}...`;
    }
});

connection.start().catch(err => console.error(err));

// --- Stroke Storage ---
let allStrokes = [];

function getColor(strokeRole, isEraser) {
    if (isEraser) return "white";
    if (!myRole || myRole === "guesser") return "black";
    if (strokeRole === myRole) return "black";
    return "red";
}

function renderStroke(s) {
    ctx.beginPath();
    ctx.moveTo(s.x0 * canvas.width,  s.y0 * canvas.height);
    ctx.lineTo(s.x1 * canvas.width,  s.y1 * canvas.height);
    ctx.strokeStyle = getColor(s.role, s.isEraser);
    ctx.lineWidth   = s.isEraser ? 20 : 3;
    ctx.lineCap     = "round";
    ctx.stroke();
}

function redrawAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    allStrokes.forEach(renderStroke);
}

// --- Role Selection ---
function selectRole(role) {
    myRole = role;
    document.getElementById("roleScreen").style.display = "none";
    document.getElementById("roleLabel").textContent =
        role === "player1" ? "✏️ Player 1" :
        role === "player2" ? "✏️ Player 2" : "🔍 Guesser";

    // Guesser kann nicht zeichnen
    canvas.style.pointerEvents = role === "guesser" ? "none" : "auto";

    // Farben neu rendern basierend auf neuer Rolle
    resizeCanvas();
}

function changeRole() {
    document.getElementById("roleScreen").style.display = "flex";
}

// --- Tools ---
function setTool(tool) {
    currentTool = tool;
    canvas.className = tool;
    document.getElementById("btnPen").classList.toggle("active", tool === "pen");
    document.getElementById("btnEraser").classList.toggle("active", tool === "eraser");
}

function clearMine() {
    if (!myRole || myRole === "guesser") return;
    connection.invoke("ClearMyDrawing", myRole);
}

function voteNewGame() {
    if (!myRole || myRole === "guesser") return;
    connection.invoke("VoteNewGame", myRole);
}

// --- Drawing ---
let isDrawing = false;
let lastX = 0, lastY = 0;

function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

function startDraw(e) {
    if (!myRole || myRole === "guesser") return;
    isDrawing = true;
    const pos = getPos(e);
    lastX = pos.x;
    lastY = pos.y;
}

function draw(e) {
    if (!isDrawing) return;
    const pos = getPos(e);

    const x0 = lastX / canvas.width;
    const y0 = lastY / canvas.height;
    const x1 = pos.x  / canvas.width;
    const y1 = pos.y  / canvas.height;

    connection.invoke("DrawLine", x0, y0, x1, y1, myRole, currentTool === "eraser");

    lastX = pos.x;
    lastY = pos.y;
}

function stopDraw() { isDrawing = false; }

canvas.addEventListener("mousedown",  startDraw);
canvas.addEventListener("mousemove",  draw);
canvas.addEventListener("mouseup",    stopDraw);
canvas.addEventListener("mouseleave", stopDraw);
canvas.addEventListener("touchstart", startDraw);
canvas.addEventListener("touchmove",  draw);
canvas.addEventListener("touchend",   stopDraw);