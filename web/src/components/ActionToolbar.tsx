"use client";
/**
 * ActionToolbar
 * Sends input actions to the selected Observation Frame via the agent.
 */
import { useState } from "react";
import { Box, Button, Group, SimpleGrid, Tabs, Text, TextInput } from "@mantine/core";
import type { ObservationFrame } from "@/lib/types";

interface Props {
  frame:      ObservationFrame;
  sendAction: (action: Record<string, unknown>) => void;
}

export function ActionToolbar({ frame, sendAction }: Props) {
  const [text,      setText]      = useState("");
  const [comboKeys, setComboKeys] = useState("");
  const [tab,       setTab]       = useState<"text" | "combo" | "click">("text");

  function doTypeText() {
    if (!text.trim()) return;
    sendAction({ frame_id: frame.id, type: "type_text", text });
    setText("");
  }

  function doKeyCombo() {
    if (!comboKeys.trim()) return;
    // "ctrl+c" → ["ctrl","c"]
    const keys = comboKeys.toLowerCase().split("+").map((k) => k.trim());
    sendAction({ frame_id: frame.id, type: "key_combo", keys });
    setComboKeys("");
  }

  function doClick(rel_x: number, rel_y: number) {
    sendAction({ frame_id: frame.id, type: "mouse_click", button: "left", rel_x, rel_y });
  }

  return (
    <Box style={{ background: "#141414", borderTop: "1px solid #2a2a2a", padding: "12px 16px" }}>
      <Text size="xs" c="dimmed" mb={10}>
        Action {"->"} <Text span c="blue.4">{frame.name}</Text>
      </Text>

      <Tabs
        value={tab}
        onChange={(value) => setTab((value as "text" | "combo" | "click") ?? "text")}
      >
        <Tabs.List mb={10}>
          <Tabs.Tab value="text">Type Text</Tabs.Tab>
          <Tabs.Tab value="combo">Key Combo</Tabs.Tab>
          <Tabs.Tab value="click">Click</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="text">
          <Group gap={8} wrap="nowrap">
            <TextInput
              style={{ flex: 1 }}
              placeholder={"Text to type... (\\n for Enter)"}
              value={text}
              onChange={(e) => setText(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  doTypeText();
                }
              }}
            />
            <Button onClick={doTypeText}>Send</Button>
          </Group>
        </Tabs.Panel>

        <Tabs.Panel value="combo">
          <Group gap={8} wrap="nowrap">
            <TextInput
              style={{ flex: 1 }}
              placeholder="e.g. ctrl+c or alt+tab"
              value={comboKeys}
              onChange={(e) => setComboKeys(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  doKeyCombo();
                }
              }}
            />
            <Button onClick={doKeyCombo}>Send</Button>
          </Group>
        </Tabs.Panel>

        <Tabs.Panel value="click">
          <Text size="xs" c="dimmed" mb={8}>
            Tap a zone to click at that position in the frame:
          </Text>
          <ClickGrid onClick={doClick} />
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}

/** 3×3 grid for quick click targeting */
function ClickGrid({ onClick }: { onClick: (rx: number, ry: number) => void }) {
  const cells = [
    [0.1, 0.1], [0.5, 0.1], [0.9, 0.1],
    [0.1, 0.5], [0.5, 0.5], [0.9, 0.5],
    [0.1, 0.9], [0.5, 0.9], [0.9, 0.9],
  ];
  const labels = ["↖", "↑", "↗", "←", "●", "→", "↙", "↓", "↘"];

  return (
    <SimpleGrid cols={3} spacing={4} style={{ maxWidth: 160 }}>
      {cells.map(([rx, ry], i) => (
        <Button
          key={i}
          onClick={() => onClick(rx, ry)}
          variant="default"
          style={{ aspectRatio: "1", paddingInline: 0 }}
        >
          {labels[i]}
        </Button>
      ))}
    </SimpleGrid>
  );
}
