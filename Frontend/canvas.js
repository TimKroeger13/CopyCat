const canvas       = document.getElementById("canvas");
const ctx          = canvas.getContext("2d");
const cursorCanvas = document.getElementById("cursorCanvas");
const cursorCtx    = cursorCanvas.getContext("2d");

const MAX_INK      = 10000;
const ERASER_RADIUS = 30;

let myRole      = null;
let currentTool = "pen";
let allStrokes  = [];
let penSize     = 7;      // ← Pen Größe, anpassbar
let myWord = null;

// CSS Dimensionen für Koordinaten-Berechnung
let canvasWidth = 0, canvasHeight = 0;

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvasWidth  = canvas.offsetWidth;
    canvasHeight = canvas.offsetHeight;

    // Canvas intern größer machen
    canvas.width        = canvasWidth  * dpr;
    canvas.height       = canvasHeight * dpr;
    cursorCanvas.width  = canvasWidth  * dpr;
    cursorCanvas.height = canvasHeight * dpr;

    // Kontext skalieren damit Koordinaten gleich bleiben
    ctx.scale(dpr, dpr);
    cursorCtx.scale(dpr, dpr);

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

// nach clearCursor()
function showMessage(text) {
    document.getElementById("messageBoxText").textContent = text;
    document.getElementById("messageBox").style.display = "flex";
}

function hideMessage() {
    document.getElementById("messageBox").style.display = "none";
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
    // Nur fremde Striche rendern – eigene wurden bereits lokal gezeichnet
    if (stroke.role !== myRole) {
        renderStroke(stroke);
    }
});

connection.on("FullRedraw", (strokes) => {
    allStrokes = strokes;
    debugger;
    redrawAll();
    if (myRole) updateInkFromStrokes();
});

connection.on("GameReset", () => {
    debugger;
    connection.invoke("RequestWords", myRole);
});

connection.on("InkUpdate", (remaining, maxInk) => {
    updateInkBar(remaining, maxInk);
});

connection.on("NewGameVoteUpdate", (votes) => { //here
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

// --- Ink UI ---
function updateInkBar(remaining, maxInk) {
    const pct = (remaining / maxInk) * 100;
    const bar = document.getElementById("inkBar");
    bar.style.width = Math.max(0, pct) + "%";
    bar.style.background = pct > 50 ? "#27ae60" : pct > 20 ? "#f39c12" : "#e74c3c";
    document.getElementById("inkLabel").textContent = `Tinte: ${Math.round(pct)}%`;
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
    ctx.moveTo(s.x0 * canvasWidth,  s.y0 * canvasHeight);
    ctx.lineTo(s.x1 * canvasWidth,  s.y1 * canvasHeight);
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
function pointToSegmentDistance(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x0, py - y0);
    // t = wie weit entlang der Linie der nächste Punkt liegt (0-1)
    let t = ((px - x0) * dx + (py - y0) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}


function findStrokesInRadius(px, py) {
    return allStrokes
        .filter(s => s.role === myRole)
        .filter(s => {
            const ax = s.x0 * canvasWidth,  ay = s.y0 * canvasHeight;
            const bx = s.x1 * canvasWidth,  by = s.y1 * canvasHeight;
            return pointToSegmentDistance(px, py, ax, ay, bx, by) < ERASER_RADIUS;
        })
        .map(s => s.id);
}

connection.on("Kicked", () => {
    isDrawing = false;
    myRole = null;
    document.getElementById("roleScreen").style.display = "flex";
    showMessage("Someone took your place!");
});

connection.on("RoleAccepted", (role) => {
    finalizeRoleSelection(role);
});

connection.on("UpdateOccupiedRoles", (occupiedRoles) => {
    console.log("Occupied roles updated:", occupiedRoles);
    
    const buttons = document.querySelectorAll(".roleBtn");
    buttons.forEach(btn => {
        // Determine role based on class
        let role = "";
        if (btn.classList.contains("player1")) role = "player1";
        else if (btn.classList.contains("player2")) role = "player2";
        else if (btn.classList.contains("guesser")) role = "guesser";

        if (occupiedRoles.includes(role)) {
            btn.classList.add("occupied");
        } else {
            btn.classList.remove("occupied");
        }
    });
});

function finalizeRoleSelection(role) {
    myRole = role;
    document.getElementById("roleScreen").style.display = "none";
    document.getElementById("roleLabel").textContent =
        role === "player1" ? "✏️ Player 1" :
        role === "player2" ? "✏️ Player 2" : "🔍 Guesser";

    const isPlayer = role !== "guesser";
    canvas.style.pointerEvents = isPlayer ? "auto" : "none";
    document.getElementById("inkWrapper").style.display = isPlayer ? "flex" : "none";
    // ... rest of your UI toggles ...
    
    resizeCanvas();
    updateInkFromStrokes();
}

// --- Role ---
function selectRole(role) {
    connection.invoke("JoinRole", role);
}

function changeRole() {
    // Notify server we are leaving the role so others can take it
    if (myRole) {
        connection.invoke("LeaveRole");
    }
    
    myRole = null; // Reset local role
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

connection.on("ReceiveWordOptions", (words) => {
    const screen = document.getElementById("wordScreen");
    const container = document.getElementById("wordOptions");
    container.innerHTML = "";

    words.forEach(word => {
        const btn = document.createElement("button");
        btn.className = "wordBtn";
        btn.textContent = word;
        btn.onclick = () => selectWord(word);
        container.appendChild(btn);
    });

    screen.style.display = "flex";
});

function selectWord(word) {
    myWord = word;
    document.getElementById("wordScreen").style.display = "none";
    // Optional: Wort in der TopBar anzeigen
    document.getElementById("roleLabel").textContent =
        myRole === "player1" ? `✏️ P1: ${word}` : `✏️ P2: ${word}`;
}

function draw(e) {
    const pos = getPos(e);

    if (myRole && myRole !== "guesser") {
        drawCursor(pos.x, pos.y);
    }

    if (e.buttons === 2) {
        if (!myRole || myRole === "guesser") return;
        const ids = findStrokesInRadius(pos.x, pos.y);
        if (ids.length > 0) connection.invoke("EraseStrokes", ids, myRole);
        return;
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

        const x0 = lastX / canvasWidth;
        const y0 = lastY / canvasHeight;
        const x1 = pos.x  / canvasWidth;
        const y1 = pos.y  / canvasHeight;

        // ← SOFORT lokal rendern
        const tempStroke = { x0, y0, x1, y1, role: myRole, length: 0 };
        renderStroke(tempStroke);

        // ← Parallel an Server schicken
        connection.invoke("DrawLine", x0, y0, x1, y1, myRole);
    }

    lastX = pos.x;
    lastY = pos.y;
}

connection.start().then(() => {
    console.log("Connected to Hub");
}).catch(err => console.error(err));

function stopDraw() { isDrawing = false; }

canvas.addEventListener("mousedown",   startDraw);
canvas.addEventListener("mousemove",   draw);
canvas.addEventListener("mouseup",     stopDraw);
canvas.addEventListener("mouseleave",  (e) => { stopDraw(); clearCursor(); });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener("touchstart", e => { e.preventDefault(); startDraw(e); }, { passive: false });
canvas.addEventListener("touchmove",  e => { e.preventDefault(); draw(e); },      { passive: false });
canvas.addEventListener("touchend",   stopDraw);