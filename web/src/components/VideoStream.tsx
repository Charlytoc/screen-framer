"use client";
/**
 * VideoStream
 * Shows the live WebRTC feed. In "draw" mode the user can click-drag
 * to select a rectangle → becomes a new Observation Frame.
 */
import { useEffect, useRef, useState } from "react";
import type { MonitorInfo } from "@/lib/types";

interface DrawRect { x: number; y: number; w: number; h: number }

interface Props {
  stream:      MediaStream | null;
  monitor:     MonitorInfo | null;
  drawMode:    boolean;
  onFrameDraw: (rect: { x: number; y: number; width: number; height: number }) => void;
}

export function VideoStream({ stream, monitor, drawMode, onFrameDraw }: Props) {
  const videoRef     = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragOrigin   = useRef<{ rx: number; ry: number } | null>(null);
  const [selection, setSelection] = useState<DrawRect | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  function clientPos(clientX: number, clientY: number) {
    const r = containerRef.current!.getBoundingClientRect();
    return {
      rx: (clientX - r.left) / r.width,
      ry: (clientY - r.top)  / r.height,
    };
  }

  function startDrag(clientX: number, clientY: number) {
    if (!drawMode) return;
    dragOrigin.current = clientPos(clientX, clientY);
    setSelection(null);
  }

  function moveDrag(clientX: number, clientY: number) {
    if (!drawMode || !dragOrigin.current) return;
    const { rx, ry } = clientPos(clientX, clientY);
    const ox = dragOrigin.current.rx;
    const oy = dragOrigin.current.ry;
    setSelection({
      x: Math.min(ox, rx), y: Math.min(oy, ry),
      w: Math.abs(rx - ox), h: Math.abs(ry - oy),
    });
  }

  function endDrag() {
    if (!drawMode || !dragOrigin.current || !selection || !monitor) return;
    if (selection.w < 0.02 || selection.h < 0.02) {
      setSelection(null);
      dragOrigin.current = null;
      return;
    }

    // The video uses objectFit:"contain", so it may have letterbox bars.
    // Compute the actual painted-video rect as fractions of the container.
    const { width: cw, height: ch } = containerRef.current!.getBoundingClientRect();
    const monAspect = monitor.width / monitor.height;
    const conAspect = cw / ch;
    let lx = 0, ly = 0, lw = 1, lh = 1; // letterbox region [0..1] in container space
    if (conAspect > monAspect) {
      // container wider than monitor → bars on left & right
      lw = monAspect / conAspect;
      lx = (1 - lw) / 2;
    } else {
      // container taller than monitor → bars on top & bottom
      lh = conAspect / monAspect;
      ly = (1 - lh) / 2;
    }

    // Remap selection corners from container-space to monitor-space [0..1]
    const toMon = (rx: number, ry: number) => ({
      mx: Math.max(0, Math.min(1, (rx - lx) / lw)),
      my: Math.max(0, Math.min(1, (ry - ly) / lh)),
    });
    const { mx: mx1, my: my1 } = toMon(selection.x, selection.y);
    const { mx: mx2, my: my2 } = toMon(selection.x + selection.w, selection.y + selection.h);

    onFrameDraw({
      x:      Math.round(mx1 * monitor.width),
      y:      Math.round(my1 * monitor.height),
      width:  Math.round((mx2 - mx1) * monitor.width),
      height: Math.round((my2 - my1) * monitor.height),
    });
    dragOrigin.current = null;
    setSelection(null);
  }

  // Mouse
  function onMouseDown(e: React.MouseEvent) { e.preventDefault(); startDrag(e.clientX, e.clientY); }
  function onMouseMove(e: React.MouseEvent) { moveDrag(e.clientX, e.clientY); }
  function onMouseUp(e:   React.MouseEvent) { e.preventDefault(); endDrag(); }

  // Touch
  function onTouchStart(e: React.TouchEvent) { if (drawMode) e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY); }
  function onTouchMove(e:  React.TouchEvent) { if (drawMode) e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY); }
  function onTouchEnd(e:   React.TouchEvent) { if (drawMode) e.preventDefault(); endDrag(); }

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        position:   "relative",
        width:      "100%",
        height:     "100%",
        background: "#000",
        overflow:   "hidden",
        cursor:     drawMode ? "crosshair" : "default",
        userSelect: "none",
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
      />

      {!stream && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#666", fontSize: 14,
        }}>
          Waiting for stream…
        </div>
      )}

      {drawMode && selection && (
        <div style={{
          position:        "absolute",
          left:            `${selection.x * 100}%`,
          top:             `${selection.y * 100}%`,
          width:           `${selection.w * 100}%`,
          height:          `${selection.h * 100}%`,
          border:          "2px solid #3b82f6",
          background:      "rgba(59,130,246,0.12)",
          pointerEvents:   "none",
          boxSizing:       "border-box",
        }} />
      )}

      {drawMode && (
        <div style={{
          position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)",
          background: "rgba(59,130,246,0.9)", color: "#fff",
          padding: "4px 12px", borderRadius: 20, fontSize: 12, pointerEvents: "none",
        }}>
          Drag to define a frame
        </div>
      )}
    </div>
  );
}
