"""
screen-use — Signaling + API Server
Relays WebRTC signaling between the browser client and the desktop agent.
Stores Observation Frames in memory; Combos persisted to combos.json.
"""
import json
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="screen-use API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory state ────────────────────────────────────────────────────────────
agent_ws: Optional[WebSocket] = None
client_ws: Optional[WebSocket] = None
monitors: list = []
frames: dict = {}  # id → frame dict

# ── Combo persistence ───────────────────────────────────────────────────────────
COMBOS_FILE = Path(__file__).parent / "combos.json"

def load_combos() -> dict:
    if COMBOS_FILE.exists():
        return {c["id"]: c for c in json.loads(COMBOS_FILE.read_text())}
    return {}

def save_combos(combos: dict):
    COMBOS_FILE.write_text(json.dumps(list(combos.values()), indent=2))

combos: dict = load_combos()


# ── REST ───────────────────────────────────────────────────────────────────────

@app.post("/agent/register")
async def agent_register(data: dict):
    global monitors
    monitors = data.get("monitors", [])
    print(f"[server] Agent registered. Monitors: {monitors}")
    return {"status": "ok"}


@app.get("/monitors")
async def get_monitors():
    return monitors


@app.get("/frames")
async def get_frames():
    return list(frames.values())


@app.post("/frames")
async def create_frame(frame: dict):
    if "id" not in frame:
        frame["id"] = str(uuid.uuid4())[:8]
    frames[frame["id"]] = frame
    print(f"[server] Frame saved: {frame}")
    return frame


@app.put("/frames/{frame_id}")
async def update_frame(frame_id: str, frame: dict):
    frame["id"] = frame_id
    frames[frame_id] = frame
    return frame


@app.delete("/frames/{frame_id}")
async def delete_frame(frame_id: str):
    frames.pop(frame_id, None)
    return {"status": "ok"}


# ── Combos ─────────────────────────────────────────────────────────────────────

@app.get("/combos")
async def get_combos():
    return list(combos.values())

@app.post("/combos")
async def create_combo(combo: dict):
    combo["id"] = str(uuid.uuid4())[:8]
    combos[combo["id"]] = combo
    save_combos(combos)
    return combo

@app.delete("/combos/{combo_id}")
async def delete_combo(combo_id: str):
    combos.pop(combo_id, None)
    save_combos(combos)
    return {"status": "ok"}


# ── WebSockets ─────────────────────────────────────────────────────────────────

@app.websocket("/ws/agent")
async def agent_endpoint(websocket: WebSocket):
    """Persistent channel from the desktop agent."""
    global agent_ws
    await websocket.accept()
    agent_ws = websocket
    print("[server] Agent connected via WS")
    try:
        while True:
            data = await websocket.receive_text()
            # Forward anything from the agent → client (SDP answer, ICE candidates)
            if client_ws:
                await client_ws.send_text(data)
    except WebSocketDisconnect:
        print("[server] Agent disconnected")
        agent_ws = None


@app.websocket("/ws/client")
async def client_endpoint(websocket: WebSocket):
    """Channel from the browser client."""
    global client_ws
    await websocket.accept()
    client_ws = websocket
    print("[server] Browser client connected via WS")
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            # Route: signaling (offer/ICE) and actions both go to the agent
            if agent_ws:
                await agent_ws.send_text(data)
            else:
                print(f"[server] Agent not connected, dropped: {msg.get('type')}")
    except WebSocketDisconnect:
        print("[server] Browser client disconnected")
        client_ws = None
