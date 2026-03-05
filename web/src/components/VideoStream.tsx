"use client";
/**
 * VideoStream
 * Shows the live WebRTC feed. In "draw" mode the user adjusts 4 edge handles
 * (iOS-style crop UI) to define a frame region, then taps "Save region".
 */
import { useEffect, useRef, useState } from "react";
import type { MonitorInfo } from "@/lib/types";

type Edge = "top" | "bottom" | "left" | "right";
interface Crop { x1: number; y1: number; x2: number; y2: number }

interface Props {
  stream:      MediaStream | null;
  monitor:     MonitorInfo | null;
  drawMode:    boolean;
  onFrameDraw: (rect: { x: number; y: number; width: number; height: number }) => void;
  sendAction?: (action: Record<string, unknown>) => void;
}

const HANDLE = 36; // px — touch target size for each edge handle

export function VideoStream({ stream, monitor, drawMode, onFrameDraw, sendAction }: Props) {
  const videoRef     = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeEdge   = useRef<Edge | null>(null);
  const [crop, setCrop] = useState<Crop>({ x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.9 });

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  // Reset crop to a centered default whenever draw mode is entered
  useEffect(() => {
    if (drawMode) setCrop({ x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.9 });
  }, [drawMode]);

  function clientFrac(clientX: number, clientY: number) {
    const r = containerRef.current!.getBoundingClientRect();
    return {
      rx: Math.max(0, Math.min(1, (clientX - r.left) / r.width)),
      ry: Math.max(0, Math.min(1, (clientY - r.top)  / r.height)),
    };
  }

  function moveEdge(clientX: number, clientY: number) {
    const edge = activeEdge.current;
    if (!edge) return;
    const { rx, ry } = clientFrac(clientX, clientY);
    const MIN = 0.05;
    setCrop(prev => {
      switch (edge) {
        case "top":    return { ...prev, y1: Math.min(prev.y2 - MIN, Math.max(0, ry)) };
        case "bottom": return { ...prev, y2: Math.max(prev.y1 + MIN, Math.min(1, ry)) };
        case "left":   return { ...prev, x1: Math.min(prev.x2 - MIN, Math.max(0, rx)) };
        case "right":  return { ...prev, x2: Math.max(prev.x1 + MIN, Math.min(1, rx)) };
      }
    });
  }

  function confirmCrop() {
    if (!monitor) return;
    const { width: cw, height: ch } = containerRef.current!.getBoundingClientRect();
    const monAspect = monitor.width / monitor.height;
    const conAspect = cw / ch;
    let lx = 0, ly = 0, lw = 1, lh = 1;
    if (conAspect > monAspect) { lw = monAspect / conAspect; lx = (1 - lw) / 2; }
    else                       { lh = conAspect / monAspect; ly = (1 - lh) / 2; }

    const toMon = (rx: number, ry: number) => ({
      mx: Math.max(0, Math.min(1, (rx - lx) / lw)),
      my: Math.max(0, Math.min(1, (ry - ly) / lh)),
    });
    const { mx: mx1, my: my1 } = toMon(crop.x1, crop.y1);
    const { mx: mx2, my: my2 } = toMon(crop.x2, crop.y2);

    onFrameDraw({
      x:      Math.round(mx1 * monitor.width),
      y:      Math.round(my1 * monitor.height),
      width:  Math.round((mx2 - mx1) * monitor.width),
      height: Math.round((my2 - my1) * monitor.height),
    });
  }

  // ── Tap-to-click (normal mode) ──────────────────────────────────────────────

  function handleTap(e: React.MouseEvent<HTMLDivElement>) {
    if (drawMode || !sendAction || !monitor) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const tapX = e.clientX - rect.left;
    const tapY = e.clientY - rect.top;

    // Letterbox offsets (same logic as confirmCrop)
    const monAspect = monitor.width / monitor.height;
    const conAspect = rect.width / rect.height;
    let lx = 0, ly = 0, lw = 1, lh = 1;
    if (conAspect > monAspect) { lw = monAspect / conAspect; lx = (1 - lw) / 2; }
    else                       { lh = conAspect / monAspect; ly = (1 - lh) / 2; }

    const rel_x = Math.max(0, Math.min(1, (tapX / rect.width  - lx) / lw));
    const rel_y = Math.max(0, Math.min(1, (tapY / rect.height - ly) / lh));

    sendAction({
      type: "mouse_click", rel_x, rel_y, button: "left", clicks: 1,
      monitor_width: monitor.width, monitor_height: monitor.height,
    });
  }

  // ── Edge handle helpers ─────────────────────────────────────────────────────

  function edgeHandleProps(edge: Edge) {
    return {
      onMouseDown: (e: React.MouseEvent)  => { e.preventDefault(); e.stopPropagation(); activeEdge.current = edge; },
      onTouchStart:(e: React.TouchEvent)  => { e.preventDefault(); e.stopPropagation(); activeEdge.current = edge; },
    };
  }

  const { x1, y1, x2, y2 } = crop;
  const cw = `${(x2 - x1) * 100}%`;
  const ch = `${(y2 - y1) * 100}%`;

  return (
    <div
      ref={containerRef}
      onClick={handleTap}
      onMouseMove={(e) => { if (drawMode && activeEdge.current) moveEdge(e.clientX, e.clientY); }}
      onMouseUp={() => { activeEdge.current = null; }}
      onMouseLeave={() => { activeEdge.current = null; }}
      onTouchMove={(e) => { if (drawMode && activeEdge.current) { e.preventDefault(); moveEdge(e.touches[0].clientX, e.touches[0].clientY); } }}
      onTouchEnd={() => { activeEdge.current = null; }}
      style={{
        position: "relative", width: "100%", height: "100%",
        background: "#000", overflow: "hidden",
        userSelect: "none", WebkitUserSelect: "none",
      }}
    >
      <video
        ref={videoRef}
        autoPlay playsInline muted
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

      {drawMode && (
        <>
          {/* ── Darkened overlay outside the crop ─────────────────────────── */}
          {/* top */}
          <div style={{ position: "absolute", inset: 0, bottom: `${(1 - y1) * 100}%`, background: "rgba(0,0,0,0.55)", pointerEvents: "none" }} />
          {/* bottom */}
          <div style={{ position: "absolute", inset: 0, top: `${y2 * 100}%`, background: "rgba(0,0,0,0.55)", pointerEvents: "none" }} />
          {/* left */}
          <div style={{ position: "absolute", top: `${y1 * 100}%`, bottom: `${(1 - y2) * 100}%`, left: 0, width: `${x1 * 100}%`, background: "rgba(0,0,0,0.55)", pointerEvents: "none" }} />
          {/* right */}
          <div style={{ position: "absolute", top: `${y1 * 100}%`, bottom: `${(1 - y2) * 100}%`, right: 0, width: `${(1 - x2) * 100}%`, background: "rgba(0,0,0,0.55)", pointerEvents: "none" }} />

          {/* ── Crop border ─────────────────────────────────────────────────── */}
          <div style={{
            position: "absolute",
            left: `${x1 * 100}%`, top: `${y1 * 100}%`,
            width: cw, height: ch,
            border: "1.5px solid rgba(255,255,255,0.85)",
            boxSizing: "border-box", pointerEvents: "none",
          }} />

          {/* ── Rule-of-thirds grid (subtle) ─────────────────────────────── */}
          {[1, 2].map(i => (
            <div key={`gv${i}`} style={{
              position: "absolute",
              left: `${(x1 + (x2 - x1) * i / 3) * 100}%`,
              top: `${y1 * 100}%`, width: 1, height: ch,
              background: "rgba(255,255,255,0.15)", pointerEvents: "none",
            }} />
          ))}
          {[1, 2].map(i => (
            <div key={`gh${i}`} style={{
              position: "absolute",
              top: `${(y1 + (y2 - y1) * i / 3) * 100}%`,
              left: `${x1 * 100}%`, height: 1, width: cw,
              background: "rgba(255,255,255,0.15)", pointerEvents: "none",
            }} />
          ))}

          {/* ── Edge handles ────────────────────────────────────────────────── */}

          {/* Top */}
          <div {...edgeHandleProps("top")} style={{
            position: "absolute", cursor: "ns-resize",
            left: `${x1 * 100}%`, top: `${y1 * 100}%`,
            width: cw, height: HANDLE,
            transform: "translateY(-50%)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ width: 44, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.9)" }} />
          </div>

          {/* Bottom */}
          <div {...edgeHandleProps("bottom")} style={{
            position: "absolute", cursor: "ns-resize",
            left: `${x1 * 100}%`, top: `${y2 * 100}%`,
            width: cw, height: HANDLE,
            transform: "translateY(-50%)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ width: 44, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.9)" }} />
          </div>

          {/* Left */}
          <div {...edgeHandleProps("left")} style={{
            position: "absolute", cursor: "ew-resize",
            left: `${x1 * 100}%`, top: `${y1 * 100}%`,
            width: HANDLE, height: ch,
            transform: "translateX(-50%)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ width: 4, height: 44, borderRadius: 2, background: "rgba(255,255,255,0.9)" }} />
          </div>

          {/* Right */}
          <div {...edgeHandleProps("right")} style={{
            position: "absolute", cursor: "ew-resize",
            left: `${x2 * 100}%`, top: `${y1 * 100}%`,
            width: HANDLE, height: ch,
            transform: "translateX(-50%)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ width: 4, height: 44, borderRadius: 2, background: "rgba(255,255,255,0.9)" }} />
          </div>

          {/* ── Confirm button ───────────────────────────────────────────────── */}
          <button
            onClick={confirmCrop}
            style={{
              position: "absolute", bottom: 20, left: "50%",
              transform: "translateX(-50%)",
              padding: "10px 28px", borderRadius: 24,
              border: "none", background: "#3b82f6", color: "#fff",
              fontSize: 15, fontWeight: 600, cursor: "pointer",
              boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
              zIndex: 10,
            }}
          >
            Save region
          </button>
        </>
      )}
    </div>
  );
}
