"use client";
/**
 * Manages the WebSocket + WebRTC peer connection.
 *
 * ICE strategy: "gather-complete before send"
 * Auto-reconnects: when the WebSocket closes, retries after RECONNECT_DELAY ms.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { WS } from "./api";

export type ConnState = "idle" | "connecting" | "connected" | "error";

const RECONNECT_DELAY = 3000;

export function useSignaling() {
  const wsRef      = useRef<WebSocket | null>(null);
  const pcRef      = useRef<RTCPeerConnection | null>(null);
  const cancelRef  = useRef(false);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<ConnState>("idle");

  const sendWs = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  /** Send an action to the agent (type_text, key_combo, mouse_click, scroll). */
  const sendAction = useCallback(
    ({ type: action, ...rest }: Record<string, unknown>) =>
      sendWs({ type: "action", action, ...rest }),
    [sendWs]
  );

  useEffect(() => {
    cancelRef.current = false;

    function connect() {
      if (cancelRef.current) return;
      setStatus("connecting");
      setStream(null);

      const ws = new WebSocket(WS);
      wsRef.current = ws;

      ws.onopen = async () => {
        if (cancelRef.current) { ws.close(); return; }

        pcRef.current?.close();
        const pc = new RTCPeerConnection();
        pcRef.current = pc;

        pc.ontrack = (ev) => {
          if (ev.streams[0] && !cancelRef.current) {
            setStream(ev.streams[0]);
            setStatus("connected");
          }
        };

        pc.addTransceiver("video", { direction: "recvonly" });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await gatherComplete(pc);

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: pc.localDescription!.type,
            sdp:  pc.localDescription!.sdp,
          }));
        }
      };

      ws.onmessage = async (ev) => {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === "answer" && pcRef.current) {
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription({ type: "answer", sdp: msg.sdp })
          );
        }
      };

      ws.onerror = () => { if (!cancelRef.current) setStatus("error"); };

      ws.onclose = () => {
        if (cancelRef.current) return;
        setStatus("idle");
        setStream(null);
        timerRef.current = setTimeout(connect, RECONNECT_DELAY);
      };
    }

    connect();

    return () => {
      cancelRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
      pcRef.current?.close();
    };
  }, []);

  return { stream, status, sendAction };
}

function gatherComplete(pc: RTCPeerConnection, timeout = 5000): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") { resolve(); return; }
    const t = setTimeout(resolve, timeout);
    const check = () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(t);
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", check);
  });
}
