export interface MonitorInfo {
  id: number;
  name: string;
  width: number;
  height: number;
}

export interface KeyCombo {
  id: string;
  name: string;
  keys: string[];  // e.g. ["ctrl", "alt", "b"]
}

export interface ObservationFrame {
  id: string;
  name: string;
  monitor_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
