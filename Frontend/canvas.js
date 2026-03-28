const canvas  = document.getElementById("canvas");
const ctx     = canvas.getContext("2d");
const MAX_INK = 10000;
const ERASER_RADIUS = 20; // Pixel Radius des Erasers

let myRole      = null;
let currentTool = "pen";
let allStrokes  = [];

// --- Canvas Resize ---
function resizeCanvas() {
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
    updateInkBar(10000 - used, 10000);
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
    ctx.lineWidth   = 3;
    ctx.lineCap     = "round";
    ctx.stroke();
}

function redrawAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    allStrokes.forEach(renderStroke);
}

// --- Eraser: findet Striche im Radius ---
function findStrokesInRadius(px, py) {
    return allStrokes
        .filter(s => s.role === myRole)
        .filter(s => {
            // Mittelpunkt des Segments prüfen
            const mx = ((s.x0 + s.x1) / 2) * canvas.width;
            const my = ((s.y0 + s.y1) / 2) * canvas.height;
            const dist = Math.hypot(mx - px, my - py);
            return dist < ERASER_RADIUS;
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
    document.getElementById("inkWrapper").style.display = isPlayer ? "flex" : "none";
    document.getElementById("btnPen").style.display       = isPlayer ? "" : "none";
    document.getElementById("btnEraser").style.display    = isPlayer ? "" : "none";
    document.getElementById("btnClearMine").style.display = isPlayer ? "" : "none";
    document.getElementById("btnNewGame").style.display   = isPlayer ? "" : "none";

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
    const rect   = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
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

    if (currentTool === "eraser") {
        // Erase: Striche im Radius finden und entfernen
        const ids = findStrokesInRadius(pos.x, pos.y);
        if (ids.length > 0) {
            connection.invoke("EraseStrokes", ids, myRole);
        }
    } else {
        // Pen: Ink prüfen
        const used = allStrokes
            .filter(s => s.role === myRole)
            .reduce((sum, s) => sum + (s.length ?? 0), 0);
        if (used >= 10000) return;

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

canvas.addEventListener("mousedown",  startDraw);
canvas.addEventListener("mousemove",  draw);
canvas.addEventListener("mouseup",    stopDraw);
canvas.addEventListener("mouseleave", stopDraw);
canvas.addEventListener("touchstart", e => { e.preventDefault(); startDraw(e); }, { passive: false });
canvas.addEventListener("touchmove",  e => { e.preventDefault(); draw(e); },      { passive: false });
canvas.addEventListener("touchend",   stopDraw);

canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault(); // Verhindert das Browser-Kontextmenü

    if (!myRole || myRole === "guesser") return;

    const pos = getPos(e);
    const ids = findStrokesInRadius(pos.x, pos.y);
    if (ids.length > 0) {
        connection.invoke("EraseStrokes", ids, myRole);
    }
});

canvas.addEventListener("mousemove", (e) => {
    if (e.buttons === 2) { // Rechte Maustaste gehalten
        if (!myRole || myRole === "guesser") return;
        const pos = getPos(e);
        const ids = findStrokesInRadius(pos.x, pos.y);
        if (ids.length > 0) connection.invoke("EraseStrokes", ids, myRole);
    }
});