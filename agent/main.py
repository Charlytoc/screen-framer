"""
screen-use — Desktop Agent
Captures the screen, streams it via WebRTC, and injects input actions.

Run this on the HOST machine (not in Docker).
"""
import asyncio
import fractions
import json
import time
import threading
import tkinter as tk
import httpx
import mss
import numpy as np
import pyautogui
import websockets
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack
from av import VideoFrame

# ── Configuration ──────────────────────────────────────────────────────────────
SERVER_URL = "http://localhost:8000"
SERVER_WS  = "ws://localhost:8000/ws/agent"
FPS        = 8
CLOCK_RATE = 90000  # standard RTP clock rate for video


# ── Screen capture track ────────────────────────────────────────────────────────

class ScreenTrack(VideoStreamTrack):
    kind = "video"

    def __init__(self, monitor_index: int = 1):
        super().__init__()
        self._sct = mss.mss()
        self._monitor = self._sct.monitors[monitor_index]
        self._start = time.monotonic()
        self._timestamp = 0

    def set_monitor(self, monitor_index: int):
        self._monitor = self._sct.monitors[monitor_index]

    async def recv(self) -> VideoFrame:
        # Advance timestamp by one frame worth of clock ticks
        self._timestamp += int(CLOCK_RATE / FPS)

        # Pace ourselves to maintain target FPS
        elapsed  = time.monotonic() - self._start
        expected = self._timestamp / CLOCK_RATE
        if expected > elapsed:
            await asyncio.sleep(expected - elapsed)

        # Capture screen (BGRA → BGR)
        img = self._sct.grab(self._monitor)
        bgr = np.array(img)[:, :, :3]

        frame = VideoFrame.from_ndarray(bgr, format="bgr24")
        frame.pts       = self._timestamp
        frame.time_base = fractions.Fraction(1, CLOCK_RATE)
        return frame


# ── Click visual feedback ──────────────────────────────────────────────────────

def flash_click(x: int, y: int, radius: int = 18, ms: int = 500):
    """Show a brief red circle on screen at the click position (runs in background thread)."""
    def _run():
        root = tk.Tk()
        root.overrideredirect(True)
        root.attributes("-topmost", True)
        root.attributes("-transparentcolor", "white")
        root.wm_attributes("-alpha", 0.85)
        size = radius * 2
        root.geometry(f"{size}x{size}+{x - radius}+{y - radius}")
        canvas = tk.Canvas(root, width=size, height=size, bg="white", highlightthickness=0)
        canvas.pack()
        canvas.create_oval(2, 2, size - 2, size - 2, fill="#ef4444", outline="white", width=2)
        root.after(ms, root.destroy)
        root.mainloop()
    threading.Thread(target=_run, daemon=True).start()


# ── Input injection ────────────────────────────────────────────────────────────

def effective_button(button: str) -> str:
    """Respect Windows 'swap primary/secondary buttons' setting."""
    try:
        import ctypes
        if ctypes.windll.user32.GetSystemMetrics(23):  # SM_SWAPBUTTON
            return "right" if button == "left" else "left"
    except Exception:
        pass
    return button


def resolve_coords(frame: dict, rel_x: float, rel_y: float):
    """Convert frame-relative [0,1] coords to absolute screen pixels."""
    abs_x = frame["x"] + rel_x * frame["width"]
    abs_y = frame["y"] + rel_y * frame["height"]
    return int(abs_x), int(abs_y)


def handle_action(msg: dict, saved_frames: dict):
    action_type = msg.get("action")  # envelope: {type:"action", action:"mouse_click", ...}
    frame_id    = msg.get("frame_id")
    frame       = saved_frames.get(frame_id, {}) if frame_id else {}

    if action_type == "type_text":
        text = msg.get("text", "")
        print(f"[agent] type_text: {repr(text)}")
        # Use pyperclip+paste for reliability with special chars when available,
        # fall back to pyautogui.write for simple ASCII.
        pyautogui.write(text, interval=0.02)

    elif action_type == "key_combo":
        keys = msg.get("keys", [])
        print(f"[agent] key_combo: {keys}")
        pyautogui.hotkey(*keys)

    elif action_type == "mouse_click":
        if frame:
            rel_x  = msg.get("rel_x", 0.5)
            rel_y  = msg.get("rel_y", 0.5)
            button = effective_button(msg.get("button", "left"))
            clicks = msg.get("clicks", 1)
            x, y   = resolve_coords(frame, rel_x, rel_y)
            print(f"[agent] mouse_click at ({x}, {y}) button={button} clicks={clicks}")
            pyautogui.click(x, y, button=button, clicks=clicks, interval=0.1)
            flash_click(x, y)

    elif action_type == "scroll":
        if frame:
            rel_x   = msg.get("rel_x", 0.5)
            rel_y   = msg.get("rel_y", 0.5)
            delta_y = msg.get("delta_y", 0)
            x, y    = resolve_coords(frame, rel_x, rel_y)
            pyautogui.scroll(int(delta_y), x=x, y=y)


# ── WebRTC helpers ─────────────────────────────────────────────────────────────

async def wait_for_ice(pc: RTCPeerConnection, timeout: float = 5.0):
    """Wait until ICE gathering is complete (all candidates embedded in SDP)."""
    deadline = time.monotonic() + timeout
    while pc.iceGatheringState != "complete":
        if time.monotonic() > deadline:
            print("[agent] ICE gathering timeout — sending anyway")
            break
        await asyncio.sleep(0.1)


# ── Main loop ──────────────────────────────────────────────────────────────────

async def run():
    saved_frames: dict = {}
    pc: RTCPeerConnection | None = None
    track = ScreenTrack(monitor_index=1)

    # 1. Register with the API server
    monitors_info = []
    with mss.mss() as sct:
        for i, m in enumerate(sct.monitors[1:], start=1):
            monitors_info.append({
                "id":     i,
                "name":   f"Monitor {i}",
                "width":  m["width"],
                "height": m["height"],
            })

    async with httpx.AsyncClient() as client:
        try:
            await client.post(f"{SERVER_URL}/agent/register",
                              json={"monitors": monitors_info})
            print(f"[agent] Registered. Monitors: {monitors_info}")
        except Exception as e:
            print(f"[agent] Warning: could not register with server: {e}")

    # 2. Connect to signaling WebSocket and wait for commands
    print(f"[agent] Connecting to {SERVER_WS} …")
    async with websockets.connect(SERVER_WS) as ws:
        print("[agent] Connected. Waiting for browser client …")

        async for raw in ws:
            msg = json.loads(raw)
            kind = msg.get("type")

            # ── WebRTC offer from browser ──────────────────────────────────────
            if kind == "offer":
                print("[agent] Received WebRTC offer")

                # Clean up any previous peer connection
                if pc:
                    await pc.close()

                pc = RTCPeerConnection()
                pc.addTrack(track)

                await pc.setRemoteDescription(
                    RTCSessionDescription(sdp=msg["sdp"], type=msg["type"])
                )
                answer = await pc.createAnswer()
                await pc.setLocalDescription(answer)

                # Wait for ICE gathering so the answer SDP has all candidates
                await wait_for_ice(pc)

                await ws.send(json.dumps({
                    "type": pc.localDescription.type,
                    "sdp":  pc.localDescription.sdp,
                }))
                print("[agent] Answer sent")

            # ── Trickle ICE candidates from browser ────────────────────────────
            elif kind == "ice-candidate":
                if pc and msg.get("candidate"):
                    from aiortc import RTCIceCandidate
                    from aiortc.contrib.signaling import object_from_string
                    try:
                        candidate = object_from_string(json.dumps({
                            "type":      "candidate",
                            "candidate": msg["candidate"],
                        }))
                        await pc.addIceCandidate(candidate)
                    except Exception as e:
                        print(f"[agent] ICE candidate error (non-fatal): {e}")

            # ── Input actions ──────────────────────────────────────────────────
            elif kind == "action":
                # Refresh frames from server before acting
                async with httpx.AsyncClient() as c:
                    try:
                        r = await c.get(f"{SERVER_URL}/frames")
                        saved_frames = {f["id"]: f for f in r.json()}
                    except Exception:
                        pass
                handle_action(msg, saved_frames)

            # ── Monitor switch ─────────────────────────────────────────────────
            elif kind == "set_monitor":
                idx = msg.get("monitor_id", 1)
                track.set_monitor(idx)
                print(f"[agent] Switched to monitor {idx}")

            else:
                print(f"[agent] Unknown message type: {kind}")


if __name__ == "__main__":
    pyautogui.FAILSAFE = False  # Disable corner-move failsafe for remote use
    asyncio.run(run())
