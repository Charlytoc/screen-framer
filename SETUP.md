# Setup — screen-use MVP

Open **3 terminals**.

---

## Terminal 1 — Server (FastAPI)

```bash
cd server
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

---

## Terminal 2 — Desktop Agent (Python)

```bash
cd agent
pip install -r requirements.txt
python main.py
```

> Must run on the HOST machine (not in Docker).
> On first run, if `aiortc` install fails, install Visual C++ Build Tools first.

---

## Terminal 3 — Web Client (Next.js)

```bash
cd web
npm run dev
```

Then open **http://localhost:3000** on your PC,
or **http://<your-PC-local-IP>:3000** from your phone/tablet on the same Wi-Fi.

---

## How to use

1. The video stream appears automatically when the agent connects.
2. Click **+ Frame** then click-drag on the video to define an Observation Frame.
3. Name it (e.g. "Terminal") and save.
4. The frame appears as a card at the bottom — click it to select.
5. Use the **Action Toolbar** to type text, send key combos, or click inside the frame.

---

## Find your local IP (Windows)

```powershell
ipconfig | findstr "IPv4"
```

---

## Remote access via Tailscale

Tailscale creates a private encrypted mesh between your devices — no public ports, no cloud relay.

**One-time setup:**
1. Install Tailscale on your Windows PC: https://tailscale.com/download/windows
2. Install Tailscale on your phone (iOS/Android app store).
3. Sign in to both with the same account (Google / GitHub / Microsoft).
4. Confirm both devices appear in your Tailscale admin panel.

**Get your PC's Tailscale IP:**
```powershell
tailscale ip -4
```
It will look like `100.x.y.z`.

**Run the app exactly as above** (no changes). Then open on your phone:
```
http://100.x.y.z:3000
```

That's it. The web app auto-detects the host IP, so API and WebSocket will automatically point to `100.x.y.z:8000`.
