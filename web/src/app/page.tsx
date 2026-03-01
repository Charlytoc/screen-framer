"use client";
import { useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  NativeSelect,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { getMonitors, getFrames, saveFrame, deleteFrame } from "@/lib/api";
import { useSignaling } from "@/lib/useSignaling";
import { VideoStream }  from "@/components/VideoStream";
import { FrameCard }    from "@/components/FrameCard";
import { FrameModal }   from "@/components/FrameModal";
import type { MonitorInfo, ObservationFrame } from "@/lib/types";

export default function Home() {
  const { stream, status, sendAction } = useSignaling();

  const [monitors,      setMonitors]      = useState<MonitorInfo[]>([]);
  const [activeMonitor, setActiveMonitor] = useState<MonitorInfo | null>(null);
  const [frames,        setFrames]        = useState<ObservationFrame[]>([]);
  const [expandedFrame, setExpandedFrame] = useState<ObservationFrame | null>(null);
  const [drawMode,      setDrawMode]      = useState(false);
  const [namingRect,    setNamingRect]    = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [newFrameName,  setNewFrameName]  = useState("");

  useEffect(() => {
    getMonitors().then((m) => {
      setMonitors(m);
      if (m.length > 0) setActiveMonitor(m[0]);
    });
    getFrames().then(setFrames);
  }, []);

  function handleFrameDraw(rect: { x: number; y: number; width: number; height: number }) {
    setNamingRect(rect);
    setDrawMode(false);
    setNewFrameName("");
  }

  async function confirmNewFrame() {
    if (!namingRect || !activeMonitor || !newFrameName.trim()) return;
    const frame = await saveFrame({
      name:       newFrameName.trim(),
      monitor_id: activeMonitor.id,
      ...namingRect,
    });
    setFrames((prev) => [...prev, frame]);
    setNamingRect(null);
  }

  async function handleDeleteFrame(id: string) {
    await deleteFrame(id);
    setFrames((prev) => prev.filter((f) => f.id !== id));
    if (expandedFrame?.id === id) setExpandedFrame(null);
  }

  const dot: Record<string, string> = {
    idle:       "#555",
    connecting: "#f59e0b",
    connected:  "#22c55e",
    error:      "#ef4444",
  };

  return (
    <Box style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "#0a0a0a", color: "#eee" }}>
      {/* Header */}
      <Group
        gap={12}
        px={16}
        py={10}
        wrap="nowrap"
        style={{ borderBottom: "1px solid #1f1f1f", flexShrink: 0 }}
      >
        <Text fw={700} fz={16} style={{ letterSpacing: "-0.5px" }}>
          screen-use
        </Text>

        <Box
          title={status}
          style={{ width: 7, height: 7, borderRadius: "50%", background: dot[status], flexShrink: 0 }}
        />

        <Box style={{ flex: 1 }} />

        {/* Desktop switcher — Win+Ctrl+←/→ */}
        <ActionIcon
          variant="default"
          onClick={() => sendAction({ type: "key_combo", keys: ["win", "ctrl", "left"] })}
          title="Previous desktop"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M15 10l-4 4-4-4"/>
          </svg>
        </ActionIcon>
        <ActionIcon
          variant="default"
          onClick={() => sendAction({ type: "key_combo", keys: ["win", "ctrl", "right"] })}
          title="Next desktop"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M11 10l4 4-4 4"/>
          </svg>
        </ActionIcon>

        {monitors.length > 1 && (
          <NativeSelect
            value={String(activeMonitor?.id ?? "")}
            onChange={(e) => {
              const m = monitors.find((monitorItem) => monitorItem.id === Number(e.currentTarget.value));
              if (m) setActiveMonitor(m);
            }}
            data={monitors.map((m) => ({ value: String(m.id), label: m.name }))}
            size="xs"
            w={170}
          />
        )}

        <Button
          size="compact-sm"
          variant={drawMode ? "light" : "default"}
          onClick={() => {
            setDrawMode((d) => !d);
            setNamingRect(null);
          }}
        >
          {drawMode ? "✕ Cancel" : "+ Frame"}
        </Button>
      </Group>

      {/* Video */}
      <Box style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <VideoStream
          stream={stream}
          monitor={activeMonitor}
          drawMode={drawMode}
          onFrameDraw={handleFrameDraw}
        />
      </Box>

      {/* Name-frame dialog */}
      <Modal
        opened={Boolean(namingRect)}
        onClose={() => setNamingRect(null)}
        title="Name this frame"
        centered
      >
        {namingRect && (
          <Stack gap={12}>
            <Badge variant="light" color="blue" style={{ width: "fit-content" }}>
              {namingRect.width} × {namingRect.height} px at ({namingRect.x}, {namingRect.y})
            </Badge>
            <TextInput
              autoFocus
              placeholder="e.g. Terminal"
              value={newFrameName}
              onChange={(e) => setNewFrameName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmNewFrame();
                if (e.key === "Escape") setNamingRect(null);
              }}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setNamingRect(null)}>
                Cancel
              </Button>
              <Button onClick={confirmNewFrame}>Save</Button>
            </Group>
          </Stack>
        )}
      </Modal>

      {/* Frames strip */}
      {frames.length > 0 && activeMonitor && (
        <Box style={{ flexShrink: 0, borderTop: "1px solid #1f1f1f", background: "#0e0e0e" }}>
          <ScrollArea type="hover" offsetScrollbars scrollbarSize={8}>
            <Group gap={12} wrap="nowrap" px={16} py={12}>
              {frames.map((f) => (
                <FrameCard
                  key={f.id}
                  frame={f}
                  monitor={activeMonitor}
                  stream={stream}
                  onSelect={() => setExpandedFrame(f)}
                  onDelete={() => handleDeleteFrame(f.id)}
                />
              ))}
            </Group>
          </ScrollArea>
        </Box>
      )}

      {/* Expanded frame modal */}
      {expandedFrame && activeMonitor && (
        <FrameModal
          frame={expandedFrame}
          allFrames={frames}
          monitor={activeMonitor}
          stream={stream}
          sendAction={sendAction}
          onSwitch={setExpandedFrame}
          onDelete={handleDeleteFrame}
          onClose={() => setExpandedFrame(null)}
        />
      )}
    </Box>
  );
}
