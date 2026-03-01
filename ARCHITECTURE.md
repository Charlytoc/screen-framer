# screen-use — Architecture

## Vision

A private, LAN-local remote desktop system where a phone can:

- View any monitor of the host PC as a live video stream.
- Create **Observation Frames** — named sub-regions of the screen that can be opened and
  closed independently on the phone (e.g. "Terminal", "Docker Dashboard", "Browser").
- Interact with any frame: send text, keyboard shortcuts, or mouse clicks targeted to the
  region that frame represents on the desktop.
- Switch the active full-screen view between multiple monitors.
  
The system never leaves the local network. No cloud relay, no public ports.

---

## Core Concepts

### Observation Frame

An Observation Frame is a named, persisted rectangle on the desktop screen:

```
{ id, name, monitor_id, x, y, width, height }
```

- Defined once (e.g. "Terminal" → top-left quadrant of monitor 1).
- Stored server-side so they survive phone reconnects.
- On the phone, each open frame is a card showing a **cropped region of the live video
  stream** for that monitor, plus an action toolbar.

### Action

An action targets a specific frame and carries an intent:

| Type            | Payload example                            |
|-----------------|--------------------------------------------|
| `key_combo`     | `{ keys: ["ctrl", "c"] }`                 |
| `type_text`     | `{ text: "docker ps\n" }`                 |
| `mouse_click`   | `{ button: "left", rel_x: 0.5, rel_y: 0.5 }` |
| `scroll`        | `{ delta_y: -3 }`                         |

The desktop agent translates frame-relative coordinates to absolute screen coordinates
before injecting input.

---

## System Components

```
┌──────────────────────────────────────────────────────────────────┐
│  LOCAL NETWORK (LAN)                                             │
│                                                                  │
│  ┌─────────────────────────────┐    ┌────────────────────────┐  │
│  │  Phone (browser)            │    │  Host PC               │  │
│  │  Next.js web app            │◄──►│  ┌──────────────────┐  │  │
│  │                             │    │  │  Desktop Agent   │  │  │
│  │  • Full-screen viewer       │    │  │  (Python, host)  │  │  │
│  │  • Frame cards UI           │    │  │                  │  │  │
│  │  • Action toolbar           │    │  │  mss / dxcam     │  │  │
│  │  • Monitor selector         │    │  │  aiortc          │  │  │
│  └──────────┬──────────────────┘    │  │  pyautogui       │  │  │
│             │  WebSocket /          │  │  pynput          │  │  │
│             │  WebRTC               │  └──────┬───────────┘  │  │
│             │                       │         │              │  │
│             ▼                       │         │ local RPC    │  │
│  ┌──────────────────────────┐       │         │              │  │
│  │  Signaling + API Server  │◄──────┘         │              │  │
│  │  FastAPI  (Docker)       │                 │              │  │
│  │                          │◄────────────────┘              │  │
│  │  • WebRTC signaling WS   │                                │  │
│  │  • Frame registry REST   │                                │  │
│  │  • Action relay WS       │                                │  │
│  └──────────────────────────┘                                │  │
│                                                              │  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Components in Detail

### 1. Desktop Agent (Python — runs on host, NOT in Docker)

Must run on the host OS to access the screen and inject input.

**Responsibilities:**
- Capture the currently active monitor as a continuous video stream.
- Send that stream to the phone via WebRTC (one peer connection per phone client).
- Receive action messages and inject them into the OS.
- Report available monitors to the server.
- Switch active monitor on command.

**Key libraries:**
| Purpose | Library |
|---|---|
| Screen capture | `mss` (cross-platform) or `dxcam` (Windows, faster) |
| WebRTC | `aiortc` |
| Keyboard input | `pynput` |
| Mouse + general | `pyautogui` |
| Server communication | `httpx` + `websockets` |
| Video encoding | `av` (PyAV, bundled with aiortc) |

**Start-up flow:**
1. Registers itself with the API server (POST `/agent/register`).
2. Opens a persistent WebSocket to receive commands from the server.
3. Waits for WebRTC offer from a phone client, responds with answer.
4. Streams active monitor. Switches source when commanded.

---

### 2. Signaling + API Server (FastAPI — in Docker)

Acts as the hub. It never touches video frames; it only routes signaling and actions.

**Docker Compose services:**
```
services:
  api:        # FastAPI app
  redis:      # optional, for frame/state persistence across restarts
```

**REST endpoints:**
```
GET  /monitors              → list of monitors reported by agent
GET  /frames                → list of saved Observation Frames
POST /frames                → create a new frame
PUT  /frames/{id}           → update frame region / name
DEL  /frames/{id}           → delete frame

POST /agent/register        → agent announces itself on startup
```

**WebSocket endpoints:**
```
WS /ws/signal               → WebRTC signaling (phone ↔ agent via server relay)
WS /ws/actions              → phone sends actions; server forwards to agent
WS /ws/agent                → agent's command channel
```

---

### 3. Next.js Web App (phone browser)

Accessed by opening `http://<host-ip>:3000` in the phone browser. No installation.

**Pages / views:**

```
/              → Home: list of monitors + saved frames
/monitor/:id   → Full-screen live view of a monitor
                  → Frame card overlay (draggable/resizable boxes per frame)
                  → "+" button to define a new frame by drawing a selection
/frame/:id     → Isolated view of one frame + action toolbar
```

**Video display strategy (cropping):**
- Receive full-monitor WebRTC stream as a `<video>` element.
- CSS `clip-path` + `transform: scale()` on the video to show only the frame's region.
- No extra stream or server processing needed for cropping — it's all client-side.

**Frame card interaction:**
- Each open frame is a floating card with the cropped video.
- Toolbar actions: `Type text`, `Key combo`, `Click (tap to click)`, `Scroll`.
- "Send" dispatches an action message via the actions WebSocket.

**Key libraries:**
| Purpose | Library |
|---|---|
| Framework | Next.js 14 (App Router) |
| WebRTC | Browser native `RTCPeerConnection` |
| State | Zustand |
| Gestures / drag | `@use-gesture/react` |
| UI | Tailwind CSS + shadcn/ui |

---

## Data Flow: Watching a Screen

```
Phone browser                  API Server             Desktop Agent
     │                              │                       │
     │── GET /monitors ────────────►│                       │
     │◄─ [{ id:0, name:"Main" }] ──│                       │
     │                              │                       │
     │── WS /ws/signal (connect) ──►│                       │
     │── { type: "offer", sdp } ───►│── forward to agent ──►│
     │                              │◄── { type: "answer" } │
     │◄── { type: "answer", sdp } ─│                       │
     │                              │                       │
     │◄══════════ WebRTC video stream (P2P or relayed) ═════│
```

> Note: WebRTC on a LAN will typically go peer-to-peer (ICE host candidates) without
> needing a TURN relay. The signaling server only bootstraps the connection.

---

## Data Flow: Sending an Action

```
Phone browser                  API Server             Desktop Agent
     │                              │                       │
     │ (user taps "Ctrl+C"          │                       │
     │  on Terminal frame)          │                       │
     │                              │                       │
     │── WS /ws/actions ───────────►│                       │
     │   { frame_id: "terminal",    │                       │
     │     type: "key_combo",       │                       │
     │     keys: ["ctrl","c"] }     │                       │
     │                              │── WS /ws/agent ──────►│
     │                              │   (forwarded)         │
     │                              │                       │ resolve frame coords
     │                              │                       │ inject OS key event
```

---

## Observation Frame: Coordinate System

Frames are stored in **absolute screen pixels** of the monitor they belong to:

```json
{
  "id": "terminal-1",
  "name": "Terminal",
  "monitor_id": 0,
  "x": 0,
  "y": 600,
  "width": 960,
  "height": 480
}
```

The phone client uses `(x / monitor_width, y / monitor_height)` ratios to position the
CSS crop on the video element, making it resolution-independent.

When an action targets `frame_id: "terminal-1"` with `rel_x: 0.5, rel_y: 0.5`, the agent
computes:

```
abs_x = frame.x + rel_x * frame.width   → 480
abs_y = frame.y + rel_y * frame.height  → 840
```

and injects the click at `(480, 840)` on the OS.

---

## Project Structure (planned)

```
screen-use/
├── ARCHITECTURE.md
├── docker-compose.yml
│
├── agent/                  # Desktop Python agent (runs on host)
│   ├── main.py
│   ├── capture.py          # mss / dxcam screen capture
│   ├── webrtc.py           # aiortc peer connection + streaming
│   ├── input.py            # keyboard + mouse injection
│   ├── frames.py           # frame registry client + coord math
│   └── requirements.txt
│
├── server/                 # FastAPI signaling + API (Docker)
│   ├── main.py
│   ├── routes/
│   │   ├── frames.py
│   │   ├── monitors.py
│   │   └── websockets.py
│   ├── models.py
│   ├── state.py            # in-memory or Redis state
│   ├── Dockerfile
│   └── requirements.txt
│
└── web/                    # Next.js phone client
    ├── app/
    │   ├── page.tsx                # home: monitors + frames list
    │   ├── monitor/[id]/page.tsx   # full monitor view
    │   └── frame/[id]/page.tsx     # isolated frame view
    ├── components/
    │   ├── VideoStream.tsx
    │   ├── FrameCard.tsx
    │   ├── ActionToolbar.tsx
    │   └── MonitorSelector.tsx
    ├── lib/
    │   ├── webrtc.ts
    │   └── api.ts
    └── package.json
```

---

## Scope: MVP vs Future

### MVP (Phase 1)
- [ ] Desktop agent streams one monitor via WebRTC
- [ ] Phone browser shows live stream
- [ ] Monitor switching (if multi-monitor)
- [ ] Create/save Observation Frames (draw selection on stream)
- [ ] Frame cards UI (cropped video)
- [ ] Send text to a frame
- [ ] Send key combos to a frame
- [ ] Click within a frame (tap → click)

### Future (Phase 2+)
- [ ] Zoom / scale a frame independently
- [ ] Multiple simultaneous frame cards in a grid layout
- [ ] Frame templates (save and restore frame sets)
- [ ] Scroll input per frame
- [ ] Clipboard sync (phone → desktop paste)
- [ ] Audio capture from desktop
- [ ] Basic auth (PIN) to protect LAN access
- [ ] PWA support (add to home screen on phone)

---

## Technology Decisions Summary

| Decision | Choice | Reason |
|---|---|---|
| Phone client | Next.js (web app) | No install, WebRTC in browser, React for frame UI |
| Backend framework | FastAPI | Async, WebSocket-native, minimal overhead |
| Screen capture | `mss` / `dxcam` | `dxcam` is faster on Windows; `mss` as fallback |
| Streaming protocol | WebRTC | Low-latency, encrypted (DTLS+SRTP), P2P on LAN |
| Input injection | `pyautogui` + `pynput` | Simple, cross-platform |
| Containerization | Docker (server only) | Agent must run on host for screen/input access |
| Networking | LAN only (local IP) | Simple, private, no external exposure needed |
| State persistence | In-memory + optional Redis | Frames survive server restarts with Redis |
