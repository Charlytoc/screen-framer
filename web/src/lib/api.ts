import type { MonitorInfo, ObservationFrame, KeyCombo } from "./types";

// Automatically uses the same host the browser loaded from.
// When opening from phone: http://192.168.x.x:3000 → points to :8000 on same IP.
const HOST = typeof window !== "undefined" ? window.location.hostname : "localhost";
export const API  = `http://${HOST}:8000`;
export const WS   = `ws://${HOST}:8000/ws/client`;

export async function getMonitors(): Promise<MonitorInfo[]> {
  const r = await fetch(`${API}/monitors`);
  return r.ok ? r.json() : [];
}

export async function getFrames(): Promise<ObservationFrame[]> {
  const r = await fetch(`${API}/frames`);
  return r.ok ? r.json() : [];
}

export async function saveFrame(
  frame: Omit<ObservationFrame, "id">
): Promise<ObservationFrame> {
  const r = await fetch(`${API}/frames`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(frame),
  });
  return r.json();
}

export async function deleteFrame(id: string): Promise<void> {
  await fetch(`${API}/frames/${id}`, { method: "DELETE" });
}

export async function getCombos(): Promise<KeyCombo[]> {
  const r = await fetch(`${API}/combos`);
  return r.ok ? r.json() : [];
}

export async function saveCombo(combo: Omit<KeyCombo, "id">): Promise<KeyCombo> {
  const r = await fetch(`${API}/combos`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(combo),
  });
  return r.json();
}

export async function deleteCombo(id: string): Promise<void> {
  await fetch(`${API}/combos/${id}`, { method: "DELETE" });
}
