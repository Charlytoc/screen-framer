# Coordinate System & Framing Pipeline

## Spaces

There are four coordinate spaces in play:

| Space | Unit | Origin | Used in |
|---|---|---|---|
| **Monitor pixels** | px | top-left of the captured monitor | `frame.x/y/width/height`, `resolve_coords()` |
| **Container CSS px** | CSS px | top-left of the HTML container element | tap events (`e.clientX/Y`), ResizeObserver |
| **Relative [0, 1]** | fraction | top-left of the frame region | `rel_x/rel_y` sent over WebSocket |
| **Absolute screen px** | px | top-left of the global Windows desktop | `pyautogui.click(x, y)` |

---

## 1. Frame Definition (VideoStream → drag)

The user drags a rectangle on the full-monitor video preview.

```
container CSS px  →  container fraction  →  monitor pixels
```

**Important**: the video uses `objectFit: contain`, which adds letterbox bars when
the container and monitor aspect ratios differ. `endDrag()` corrects for this:

```
letterbox region (container fractions):
  if container is wider:  lx = (1 - monAspect/conAspect) / 2,  lw = monAspect/conAspect
  if container is taller: ly = (1 - conAspect/monAspect) / 2,  lh = conAspect/monAspect

monitor fraction = (container fraction - letterbox offset) / letterbox size
monitor pixel    = monitor fraction × monitor.width (or height)
```

The saved `ObservationFrame` stores absolute **monitor-local** pixel coordinates:
`x, y` = top-left corner within the captured monitor, `width, height` in pixels.

---

## 2. Crop Display (FrameModal / FrameCard)

To show only the frame region in the UI, the full-monitor `<video>` is sized to fill
the container as if the entire monitor were shown at `scale`, then offset so the
frame region is visible.

```
scale   = min(containerW / frame.width,  containerH / frame.height)

videoW  = monitor.width  × scale         ← full-monitor video CSS size
videoH  = monitor.height × scale

offsetX = −frame.x × scale + (containerW − frame.width  × scale) / 2
offsetY = −frame.y × scale + (containerH − frame.height × scale) / 2
```

The video is `position:absolute; left:offsetX; top:offsetY; width:videoW; height:videoH`.
The container is `overflow:hidden`, so only the frame region shows through.

`offsetX` breaks down as:
- `−frame.x × scale` → shift video left so frame left-edge is at container left
- `+ (containerW − frame.width × scale) / 2` → center the frame region in the container

---

## 3. Tap-to-Click (FrameModal → agent)

The user taps the cropped video. The tap must be mapped back to a monitor-relative
fraction `[0, 1]` which the agent then converts to absolute pixels.

```
tapX, tapY  = e.clientX/Y − container.getBoundingClientRect().left/top

# Position within the frame region (in scaled pixels):
framePixelX = (tapX − offsetX) − frame.x × scale
            = tapX − (containerW − frame.width × scale) / 2

framePixelY = (tapY − offsetY) − frame.y × scale
            = tapY − (containerH − frame.height × scale) / 2

rel_x = clamp(framePixelX / (frame.width  × scale), 0, 1)
rel_y = clamp(framePixelY / (frame.height × scale), 0, 1)
```

The `<video>` in FrameModal uses **explicit CSS width/height** (not `objectFit:contain`),
so there is no letterboxing — the entire video box corresponds 1:1 to the monitor.
The math above is exact.

---

## 4. Agent Click Resolution

The agent receives `{frame_id, rel_x, rel_y}` and converts to absolute screen pixels:

```python
abs_x = frame["x"] + rel_x * frame["width"]
abs_y = frame["y"] + rel_y * frame["height"]
pyautogui.click(abs_x, abs_y)
```

`frame.x/y` are **monitor-local** pixels (from mss capture). For the primary monitor
this equals the global Windows desktop coordinate. For secondary monitors, mss captures
from the monitor's own origin, so `frame.x/y` already account for the monitor offset
(mss `monitors[i]` includes `left/top` fields that describe the monitor in global space,
and the capture starts from there).

> **Note**: pyautogui uses **logical** (DPI-scaled) coordinates on Windows. If mss is
> run in a process with a different DPI-awareness level, there can be a systematic
> offset on HiDPI monitors. Both mss and pyautogui should agree on the coordinate space.

---

## Known Limitations / Future Work

- **HiDPI / display scaling**: If Windows display scaling > 100%, mss may return
  physical pixels while pyautogui expects logical pixels. Symptom: clicks are off by
  a consistent scale factor. Fix: set DPI-awareness in the agent process or scale
  coordinates explicitly.

- **Multi-monitor**: The coordinate pipeline is correct as long as `frame.x/y` are
  in the same space as pyautogui's coordinate system. Test by defining a frame near
  the monitor origin and verifying clicks land accurately.
