"use client";
/**
 * FrameModal — full-screen expanded view of one Observation Frame.
 *
 * • The cropped video fills as much of the screen as possible.
 * • Tapping the video sends a mouse_click at that relative position.
 * • Bottom toolbar: unified textarea with inline <KEY>...</KEY> syntax + key chips.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Menu,
  SegmentedControl,
  TextInput,
  Textarea,
} from "@mantine/core";
import type { MonitorInfo, ObservationFrame, KeyCombo } from "@/lib/types";
import { getCombos, saveCombo, deleteCombo } from "@/lib/api";

interface Props {
  frame:        ObservationFrame;
  allFrames:    ObservationFrame[];
  monitor:      MonitorInfo;
  stream:       MediaStream | null;
  sendAction:   (action: Record<string, unknown>) => void;
  onSwitch:     (frame: ObservationFrame) => void;
  onDelete:     (id: string) => void;
  onClose:      () => void;
}

type ClickMode = "click" | "double" | "right";

const QUICK_KEYS = ["enter", "backspace", "shift"];
const ALL_KEY_GROUPS = [
  ["ctrl", "alt", "shift", "win"],
  ["enter", "tab", "esc", "backspace", "delete", "space"],
  ["up", "down", "left", "right", "home", "end", "pageup", "pagedown"],
  ["f1","f2","f3","f4","f5","f6","f7","f8","f9","f10","f11","f12"],
];

export function FrameModal({ frame, allFrames, monitor, stream, sendAction, onSwitch, onDelete, onClose }: Props) {
  const videoElRef   = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const [dim, setDim]             = useState({ w: 0, h: 0 });
  const [clickMode, setClickMode] = useState<ClickMode>("click");
  const [text, setText]           = useState("");
  const [showAllKeys, setShowAllKeys] = useState(false);
  const [pillMenuOpen, setPillMenuOpen] = useState(false);
  const [combos, setCombos]           = useState<KeyCombo[]>([]);
  const [addingCombo, setAddingCombo] = useState(false);
  const [newComboName, setNewComboName] = useState("");
  const [newComboKeys, setNewComboKeys] = useState("");
  const [clickFeedback, setClickFeedback] = useState<{ x: number; y: number } | null>(null);

  const videoRef = useCallback((el: HTMLVideoElement | null) => {
    videoElRef.current = el;
    if (el && stream) el.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    if (videoElRef.current && stream) videoElRef.current.srcObject = stream;
  }, [stream]);

  useEffect(() => { getCombos().then(setCombos); }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      setDim({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ── Crop math ──────────────────────────────────────────────────────────────
  const scale  = dim.w > 0 && dim.h > 0
    ? Math.min(dim.w / frame.width, dim.h / frame.height)
    : 1;
  const videoW  = monitor.width  * scale;
  const videoH  = monitor.height * scale;
  const offsetX = -frame.x * scale + (dim.w - frame.width  * scale) / 2;
  const offsetY = -frame.y * scale + (dim.h - frame.height * scale) / 2;

  // ── Tap-to-click ───────────────────────────────────────────────────────────
  function handleVideoTap(e: React.MouseEvent<HTMLDivElement>) {
    const rect = containerRef.current!.getBoundingClientRect();
    const tapX  = e.clientX - rect.left;
    const tapY  = e.clientY - rect.top;
    const framePixelX = (tapX - offsetX) - frame.x * scale;
    const framePixelY = (tapY - offsetY) - frame.y * scale;
    const rel_x = Math.max(0, Math.min(1, framePixelX / (frame.width  * scale)));
    const rel_y = Math.max(0, Math.min(1, framePixelY / (frame.height * scale)));
    const button = clickMode === "right" ? "right" : "left";
    const clicks = clickMode === "double" ? 2 : 1;
    sendAction({ frame_id: frame.id, type: "mouse_click", button, clicks, rel_x, rel_y,
      monitor_width: monitor.width, monitor_height: monitor.height });
    setClickFeedback({ x: tapX, y: tapY });
    setTimeout(() => setClickFeedback(null), 600);
  }

  // ── Text input actions ─────────────────────────────────────────────────────
  /** Insert <KEY>NAME</KEY> at cursor position, keep keyboard open. */
  function insertKey(key: string) {
    const el  = textareaRef.current;
    const tag = `<KEY>${key.toUpperCase()}</KEY>`;
    if (el) {
      const start = el.selectionStart ?? text.length;
      const end   = el.selectionEnd   ?? text.length;
      const next  = text.slice(0, start) + tag + text.slice(end);
      setText(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + tag.length, start + tag.length);
      });
    } else {
      setText((prev) => prev + tag);
    }
  }

  async function handleSaveCombo() {
    const name = newComboName.trim();
    const keys = newComboKeys.toLowerCase().split("+").map((k) => k.trim()).filter(Boolean);
    if (!name || keys.length === 0) return;
    const created = await saveCombo({ name, keys });
    setCombos((prev) => [...prev, created]);
    setNewComboName("");
    setNewComboKeys("");
    setAddingCombo(false);
  }

  async function handleDeleteCombo(id: string) {
    await deleteCombo(id);
    setCombos((prev) => prev.filter((c) => c.id !== id));
  }

  function doSend() {
    if (!text.trim()) return;
    const re = /<KEY>(.*?)<\/KEY>/gi;
    let last = 0, m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) sendAction({ frame_id: frame.id, type: "type_text", text: text.slice(last, m.index) });
      sendAction({ frame_id: frame.id, type: "key_combo", keys: m[1].toLowerCase().split("+").map((k) => k.trim()) });
      last = re.lastIndex;
    }
    if (last < text.length) sendAction({ frame_id: frame.id, type: "type_text", text: text.slice(last) });
    setText("");
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      display: "flex", flexDirection: "column",
      background: "#080808",
    }}>
      {/* Modal header */}
      <div style={{ borderBottom: "1px solid #1f1f1f", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px 8px" }}>
          <Button variant="default" size="compact-sm" onClick={onClose}>
            ← Back
          </Button>

          <div style={{ flex: 1 }} />

          {/* Click mode */}
          <SegmentedControl
            size="xs"
            value={clickMode}
            onChange={(value) => setClickMode(value as ClickMode)}
            data={[
              { label: "Click", value: "click" },
              { label: "Double", value: "double" },
              { label: "Right", value: "right" },
            ]}
          />

        </div>

        {/* Frame switcher pills */}
        <div style={{ display: "flex", gap: 6, padding: "0 16px 6px", overflowX: "auto" }}>
          {allFrames.map((f) => {
            const isActive = f.id === frame.id;
            return (
              isActive ? (
                <Menu key={f.id} opened={pillMenuOpen} onChange={setPillMenuOpen} position="bottom-start" withinPortal>
                  <Menu.Target>
                    <Button
                      size="compact-xs"
                      radius="xl"
                      variant="filled"
                      onClick={() => setPillMenuOpen((v) => !v)}
                      style={{ flexShrink: 0 }}
                    >
                      {f.name} ▾
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>Frame info</Menu.Label>
                    <Menu.Item disabled>{frame.width} × {frame.height} px</Menu.Item>
                    <Menu.Item disabled>at ({frame.x}, {frame.y})</Menu.Item>
                    <Menu.Divider />
                    <Menu.Item
                      color="red"
                      onClick={() => {
                        setPillMenuOpen(false);
                        onDelete(frame.id);
                        onClose();
                      }}
                    >
                      Delete frame
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              ) : (
                <Button
                  key={f.id}
                  size="compact-xs"
                  radius="xl"
                  variant="default"
                  onClick={() => {
                    onSwitch(f);
                    setPillMenuOpen(false);
                  }}
                  style={{ flexShrink: 0 }}
                >
                  {f.name}
                </Button>
              )
            );
          })}
        </div>
      </div>

      {/* Cropped video — tap to click */}
      <div
        ref={containerRef}
        onClick={handleVideoTap}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          flex: 1, minHeight: 0,
          position: "relative", cursor: "crosshair", background: "#000",
          display: "flex", alignItems: "center", justifyContent: "center",
          userSelect: "none", WebkitUserSelect: "none",
        }}
      >
        {/* Inner viewport — clips exactly to the frame region, no more */}
        <div style={{
          position: "relative",
          width: frame.width * scale,
          height: frame.height * scale,
          overflow: "hidden",
          flexShrink: 0,
        }}>
          <video
            ref={videoRef}
            autoPlay playsInline muted
            style={{
              position: "absolute",
              width: videoW, height: videoH,
              left: -frame.x * scale,
              top:  -frame.y * scale,
              display: "block",
            }}
          />
        </div>
        {clickFeedback && (
          <div style={{
            position: "absolute", left: clickFeedback.x - 12, top: clickFeedback.y - 12,
            width: 24, height: 24, borderRadius: "50%",
            background: "rgba(59,130,246,0.5)", border: "2px solid #3b82f6",
            pointerEvents: "none",
          }} />
        )}
      </div>

      {/* Action toolbar */}
      <div style={{ flexShrink: 0, borderTop: "1px solid #1f1f1f", background: "#0e0e0e", padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8 }}>

        {/* Desktop switcher */}
        <div style={{ display: "flex", gap: 6 }}>
          <ActionIcon variant="default" onMouseDown={(e) => e.preventDefault()} onClick={() => sendAction({ type: "key_combo", keys: ["win", "ctrl", "left"] })} title="Previous desktop">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M15 10l-4 4-4-4"/>
            </svg>
          </ActionIcon>
          <ActionIcon variant="default" onMouseDown={(e) => e.preventDefault()} onClick={() => sendAction({ type: "key_combo", keys: ["win", "ctrl", "right"] })} title="Next desktop">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M11 10l4 4-4 4"/>
            </svg>
          </ActionIcon>
        </div>

        {/* Saved combos */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {combos.map((c) => (
            <Button.Group key={c.id}>
              <Button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => sendAction({ type: "key_combo", keys: c.keys })}
                title={(c.keys ?? []).join("+")}
                size="compact-xs"
                variant="default"
              >
                {c.name}
              </Button>
              <Button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleDeleteCombo(c.id)}
                size="compact-xs"
                variant="default"
                color="gray"
              >
                ×
              </Button>
            </Button.Group>
          ))}
          <Button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setAddingCombo((v) => !v)}
            size="compact-xs"
            variant={addingCombo ? "filled" : "light"}
          >
            {addingCombo ? "Cancel" : "+ Combo"}
          </Button>
        </div>

        {/* New combo form */}
        {addingCombo && (
          <Group gap={6} wrap="wrap" align="center">
            <TextInput
              placeholder="Name (e.g. Cursor Chat)"
              value={newComboName}
              onChange={(e) => setNewComboName(e.currentTarget.value)}
              size="xs"
              w={170}
            />
            <TextInput
              placeholder="Keys e.g. ctrl+alt+b"
              value={newComboKeys}
              onChange={(e) => setNewComboKeys(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveCombo(); }}
              size="xs"
              w={170}
            />
            <Button
              onClick={handleSaveCombo}
              size="compact-xs"
            >
              Save
            </Button>
          </Group>
        )}

        {/* Key chips */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {(showAllKeys ? ALL_KEY_GROUPS.flat() : QUICK_KEYS).map((key) => (
            <Button key={key}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertKey(key)}
              size="compact-xs"
              radius="xl"
              variant="default"
            >
              {key}
            </Button>
          ))}
          <Button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowAllKeys((v) => !v)}
            size="compact-xs"
            radius="xl"
            variant="light"
          >
            {showAllKeys ? "Less" : "More..."}
          </Button>
        </div>

        {/* Unified textarea + send */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <Textarea
            ref={textareaRef}
            rows={3}
            autosize={false}
            style={{ flex: 1 }}
            placeholder={"Type text… or tap a key chip to insert <KEY>ENTER</KEY>"}
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); } }}
          />
          <Button
            style={{ flexShrink: 0 }}
            onClick={doSend}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
