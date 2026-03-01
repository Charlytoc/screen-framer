"use client";
/**
 * FrameCard
 * Shows a cropped section of the live stream for one Observation Frame.
 *
 * CSS crop trick:
 *   The <video> is sized as if the full monitor were displayed at some scale,
 *   then positioned so only the frame's region is visible through the overflow:hidden container.
 */
import { useEffect, useRef } from "react";
import { ActionIcon, Card, Group, Text } from "@mantine/core";
import type { MonitorInfo, ObservationFrame } from "@/lib/types";

interface Props {
  frame:    ObservationFrame;
  monitor:  MonitorInfo;
  stream:   MediaStream | null;
  onSelect: () => void;
  onDelete: () => void;
}

export function FrameCard({ frame, monitor, stream, onSelect, onDelete }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Card display size (fixed width, proportional height)
  const cardW   = 280;
  const aspect  = frame.height / frame.width;
  const cardH   = Math.round(cardW * aspect);

  // Scale the full monitor to fit the frame region into the card
  const scaleX  = cardW / frame.width;
  // Use scaleX (lock width), accept slight height distortion for very extreme regions
  const scale   = scaleX;

  const videoW  = Math.round(monitor.width  * scale);
  const videoH  = Math.round(monitor.height * scale);
  const offsetX = -Math.round(frame.x * scale);
  const offsetY = -Math.round(frame.y * scale);

  return (
    <Card
      onClick={onSelect}
      style={{
        overflow:      "hidden",
        cursor:        "pointer",
        flexShrink:    0,
        background:    "#111111",
        position:      "relative",
        width:         cardW,
        border:        "2px solid #333",
      }}
      p={0}
      radius="md"
    >
      {/* Cropped video viewport */}
      <div style={{ width: cardW, height: cardH, overflow: "hidden", position: "relative" }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            position:  "absolute",
            width:     videoW,
            height:    videoH,
            left:      offsetX,
            top:       offsetY,
            display:   "block",
          }}
        />
      </div>

      {/* Footer */}
      <Group justify="space-between" align="center" px={10} py={6} style={{ background: "#1a1a1a" }}>
        <Text size="sm" c="#ddd">
          {frame.name}
        </Text>
        <ActionIcon
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete frame"
          variant="subtle"
          color="gray"
          size="sm"
        >
          ×
        </ActionIcon>
      </Group>
    </Card>
  );
}
