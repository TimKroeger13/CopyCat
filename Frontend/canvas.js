const canvas       = document.getElementById("canvas");
const ctx          = canvas.getContext("2d");
const cursorCanvas = document.getElementById("cursorCanvas");
const cursorCtx    = cursorCanvas.getContext("2d");

const MAX_INK      = 10000;
const ERASER_RADIUS = 20;

let myRole      = null;
let currentTool = "pen";
let allStrokes  = [];
let penSize     = 7;      // ← Pen Größe, anpassbar

// --- Canvas Resize ---
function resizeCanvas() {
    canvas.width        = canvas.offsetWidth;
    canvas.height       = canvas.offsetHeight;
    cursorCanvas.width  = cursorCanvas.offsetWidth;
    cursorCanvas.height = cursorCanvas.offsetHeight;
    redrawAll();
}
window.addEventListener("resize", resizeCanvas);

// --- Cursor Overlay ---
function drawCursor(x, y) {
    cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);

    if (currentTool === "eraser") {
        // Kreis zeigt Eraser Radius
        cursorCtx.beginPath();
        cursorCtx.arc(x, y, ERASER_RADIUS, 0, Math.PI * 2);
        cursorCtx.strokeStyle = "rgba(0,0,0,0.6)";
        cursorCtx.lineWidth = 1.5;
        cursorCtx.stroke();
        // Kleines Kreuz in der Mitte
        cursorCtx.beginPath();
        cursorCtx.moveTo(x - 4, y); cursorCtx.lineTo(x + 4, y);
        cursorCtx.moveTo(x, y - 4); cursorCtx.lineTo(x, y + 4);
        cursorCtx.stroke();
    } else {
        // Pen: gefüllter Punkt in Pen-Größe
        cursorCtx.beginPath();
        cursorCtx.arc(x, y, penSize / 2, 0, Math.PI * 2);
        cursorCtx.fillStyle = "rgba(0,0,0,0.7)";
        cursorCtx.fill();
        // Kleiner Ring drum
        cursorCtx.beginPath();
        cursorCtx.arc(x, y, penSize / 2 + 3, 0, Math.PI * 2);
        cursorCtx.strokeStyle = "rgba(0,0,0,0.3)";
        cursorCtx.lineWidth = 1;
        cursorCtx.stroke();
    }
}

function clearCursor() {
    cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
}

// --- SignalR ---
const serverUrl = window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
    ? "http://localhost:5142/drawHub"
    : "https://tkroeger.com/drawHub";

const connection = new signalR.HubConnectionBuilder()
    .withUrl(serverUrl)
    .build();


connection.on("ReceiveLine", (stroke) => {
    allStrokes.push(stroke);
    renderStroke(stroke);
});

connection.on("FullRedraw", (strokes) => {
    allStrokes = strokes;
    redrawAll();
    if (myRole) updateInkFromStrokes();
});

connection.on("InkUpdate", (remaining, maxInk) => {
    updateInkBar(remaining, maxInk);
});

connection.on("NewGameVoteUpdate", (votes) => {
    const myVoteActive = votes.includes(myRole);
    document.getElementById("btnNewGame").classList.toggle("active", myVoteActive);
    const hint = document.getElementById("newGameHint");
    if (votes.length === 0) {
        hint.textContent = "";
    } else if (votes.includes("player1") && !votes.includes("player2")) {
        hint.textContent = "⏳ Waiting for Player 2...";
    } else if (votes.includes("player2") && !votes.includes("player1")) {
        hint.textContent = "⏳ Waiting for Player 1...";
    }
});

connection.start().catch(err => console.error(err));

// --- Ink UI ---
function updateInkBar(remaining, maxInk) {
    const pct = (remaining / maxInk) * 100;
    const bar = document.getElementById("inkBar");
    bar.style.width = Math.max(0, pct) + "%";
    bar.style.background = pct > 50 ? "#27ae60" : pct > 20 ? "#f39c12" : "#e74c3c";
    document.getElementById("inkLabel").textContent =
        `Ink: ${Math.round(remaining)} / ${Math.round(maxInk)}`;
}

function updateInkFromStrokes() {
    const used = allStrokes
        .filter(s => s.role === myRole)
        .reduce((sum, s) => sum + (s.length ?? 0), 0);
    updateInkBar(MAX_INK - used, MAX_INK);
}

// --- Render ---
function getColor(strokeRole) {
    if (!myRole || myRole === "guesser") return "black";
    return strokeRole === myRole ? "black" : "red";
}

function renderStroke(s) {
    ctx.beginPath();
    ctx.moveTo(s.x0 * canvas.width,  s.y0 * canvas.height);
    ctx.lineTo(s.x1 * canvas.width,  s.y1 * canvas.height);
    ctx.strokeStyle = getColor(s.role);
    ctx.lineWidth   = penSize;
    ctx.lineCap     = "round";
    ctx.stroke();
}

function redrawAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    allStrokes.forEach(renderStroke);
}

// --- Eraser ---
function findStrokesInRadius(px, py) {
    return allStrokes
        .filter(s => s.role === myRole)
        .filter(s => {
            const mx = ((s.x0 + s.x1) / 2) * canvas.width;
            const my = ((s.y0 + s.y1) / 2) * canvas.height;
            return Math.hypot(mx - px, my - py) < ERASER_RADIUS;
        })
        .map(s => s.id);
}

// --- Role ---
function selectRole(role) {
    myRole = role;
    document.getElementById("roleScreen").style.display = "none";
    document.getElementById("roleLabel").textContent =
        role === "player1" ? "✏️ Player 1" :
        role === "player2" ? "✏️ Player 2" : "🔍 Guesser";

    const isPlayer = role !== "guesser";
    canvas.style.pointerEvents = isPlayer ? "auto" : "none";
    document.getElementById("inkWrapper").style.display    = isPlayer ? "flex" : "none";
    document.getElementById("btnPen").style.display        = isPlayer ? "" : "none";
    document.getElementById("btnEraser").style.display     = isPlayer ? "" : "none";
    document.getElementById("btnClearMine").style.display  = isPlayer ? "" : "none";
    document.getElementById("btnNewGame").style.display    = isPlayer ? "" : "none";

    resizeCanvas();
    updateInkFromStrokes();
}

function changeRole() {
    document.getElementById("roleScreen").style.display = "flex";
}

// --- Tools ---
function setTool(tool) {
    currentTool = tool;
    canvas.className = tool;
    document.getElementById("btnPen").classList.toggle("active",    tool === "pen");
    document.getElementById("btnEraser").classList.toggle("active", tool === "eraser");
}

// Pen Größe ändern – ruf das aus HTML auf oder per Konsole zum Testen
function setPenSize(size) {
    penSize = size;
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
    const rect    = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
}

function startDraw(e) {
    if (!myRole || myRole === "guesser") return;
    if (e.button !== undefined && e.button !== 0) return; // ← Nur Linksklick
    isDrawing = true;
    const pos = getPos(e);
    lastX = pos.x;
    lastY = pos.y;
}

function draw(e) {
    const pos = getPos(e);

    if (myRole && myRole !== "guesser") {
        drawCursor(pos.x, pos.y);
    }

    // Rechte Maustaste gehalten = Eraser unabhängig vom Tool
    if (e.buttons === 2) {
        if (!myRole || myRole === "guesser") return;
        const ids = findStrokesInRadius(pos.x, pos.y);
        if (ids.length > 0) connection.invoke("EraseStrokes", ids, myRole);
        return; // ← Verhindert dass danach Pen-Logik läuft
    }

    if (!isDrawing) return;

    if (currentTool === "eraser") {
        const ids = findStrokesInRadius(pos.x, pos.y);
        if (ids.length > 0) connection.invoke("EraseStrokes", ids, myRole);
    } else {
        const used = allStrokes
            .filter(s => s.role === myRole)
            .reduce((sum, s) => sum + (s.length ?? 0), 0);
        if (used >= MAX_INK) return;

        const x0 = lastX / canvas.width;
        const y0 = lastY / canvas.height;
        const x1 = pos.x  / canvas.width;
        const y1 = pos.y  / canvas.height;
        connection.invoke("DrawLine", x0, y0, x1, y1, myRole);
    }

    lastX = pos.x;
    lastY = pos.y;
}

function stopDraw() { isDrawing = false; }

canvas.addEventListener("mousedown",   startDraw);
canvas.addEventListener("mousemove",   draw);
canvas.addEventListener("mouseup",     stopDraw);
canvas.addEventListener("mouseleave",  (e) => { stopDraw(); clearCursor(); });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener("touchstart", e => { e.preventDefault(); startDraw(e); }, { passive: false });
canvas.addEventListener("touchmove",  e => { e.preventDefault(); draw(e); },      { passive: false });
canvas.addEventListener("touchend",   stopDraw);