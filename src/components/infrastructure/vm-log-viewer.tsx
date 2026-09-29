"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { LogSeverityBadge } from "@/components/infrastructure/log-severity-badge";
import { ExpandToggleButton, ResizeHandle, useExpandablePanel } from "@/components/infrastructure/expandable-panel";
import { Button } from "@/components/ui/button";
import { type VMAgentLogsInboundFrame, type LogSeverity } from "@/lib/api";

type ViewerState = "connecting" | "connected" | "error" | "closed";

type ViewerLine = { text: string; severity: LogSeverity; category?: string; suggestion?: string };

// Live-tail for the VM Agent's OS-level (journald) logs -- structural
// mirror of DockerLogViewer, just fed from vm-agent/logs/stream instead
// of a Docker container's stream. Live-only: nothing is stored server-side
// or in this component's own state beyond what's currently rendered.
export function VMLogViewer({ streamUrl, vmName }: { streamUrl: string; vmName: string }) {
  const [state, setState] = useState<ViewerState>("connecting");
  const [message, setMessage] = useState<string | null>(null);
  const [lines, setLines] = useState<ViewerLine[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);
  const { fullscreen, toggleFullscreen, contentStyle, contentClassName, panelClassName, resizeHandleProps } = useExpandablePanel(550);
  // Bumping this forces the connect effect below to tear down whatever
  // WebSocket it has (open, closed, or stuck) and open a fresh one --
  // the manual "Reconnect" escape hatch for "I'm connected but not
  // seeing any log output" (a live-tail genuinely has nothing to show
  // until a new line is written, so seeing none isn't itself an error;
  // this is for when a viewer wants to force a clean retry anyway).
  const [reconnectKey, setReconnectKey] = useState(0);

  useEffect(() => {
    // Resets stale state from a previously viewed VM before opening the
    // new one's stream.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines([]);
    setState("connecting");
    setMessage(null);

    // See DockerLogViewer's identical guard for why this is needed:
    // React StrictMode (dev only, which is how this app is currently
    // being served) double-invokes this effect on mount, and the first
    // WebSocket's late, stale close event can otherwise land after the
    // second (real) connection has already opened, stomping "connected"
    // back to "closed" even though the live connection is fine.
    let cancelled = false;
    const ws = new WebSocket(streamUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (cancelled) return;
      setState("connected");
    };
    ws.onmessage = (ev) => {
      if (cancelled) return;
      let frame: VMAgentLogsInboundFrame;
      try {
        frame = JSON.parse(ev.data as string) as VMAgentLogsInboundFrame;
      } catch {
        return;
      }
      if (frame.type === "log") {
        const entry: ViewerLine = { text: frame.line, severity: frame.severity, category: frame.category, suggestion: frame.suggestion };
        setLines((prev) => (prev.length > 2000 ? [...prev.slice(prev.length - 2000), entry] : [...prev, entry]));
      } else if (frame.type === "error") {
        setState("error");
        setMessage(frame.message);
      } else if (frame.type === "closed") {
        setState("closed");
      }
    };
    ws.onclose = () => {
      if (cancelled) return;
      setState((prev) => (prev === "error" ? prev : "closed"));
    };
    ws.onerror = () => {
      // No usable detail on this event by design -- onclose (which
      // always follows) is what actually updates state.
    };

    return () => {
      cancelled = true;
      ws.close();
      wsRef.current = null;
    };
  }, [streamUrl, reconnectKey]);

  useEffect(() => {
    if (autoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [lines]);

  function handleDisconnect() {
    wsRef.current?.close();
  }

  function handleReconnect() {
    setReconnectKey((k) => k + 1);
  }

  return (
    <div className={`flex flex-col gap-2 ${panelClassName}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`h-2 w-2 rounded-full ${
              state === "connected" ? "bg-emerald-500" : state === "connecting" ? "bg-amber-400" : "bg-slate-400"
            }`}
          />
          <span className="text-slate-600">
            {state === "connecting" && "Connecting…"}
            {state === "connected" && `Streaming logs from ${vmName}`}
            {state === "closed" && "Disconnected"}
            {state === "error" && (message ?? "Connection error")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReconnect} title="Force a fresh reconnect -- use this if you expect log output but aren't seeing any">
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Reconnect
          </Button>
          <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={state !== "connected"}>
            Disconnect
          </Button>
          <ExpandToggleButton fullscreen={fullscreen} onToggle={toggleFullscreen} />
        </div>
      </div>
      <div
        style={contentStyle}
        className={`w-full overflow-y-auto rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-slate-200 ${contentClassName}`}
        onScroll={(e) => {
          const el = e.currentTarget;
          autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {lines.length === 0 ? (
          <p className="text-slate-500">{state === "connected" ? "Waiting for log output…" : ""}</p>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="border-b border-slate-800/60 py-1 last:border-0">
              <div className="flex flex-wrap items-start gap-2 whitespace-pre-wrap break-all">
                <LogSeverityBadge severity={line.severity} />
                <span>{line.text}</span>
              </div>
              {line.suggestion && (
                <p className="ml-1 mt-1 text-[11px] font-sans text-amber-300/90">Suggested next step: {line.suggestion}</p>
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <ResizeHandle hidden={fullscreen} {...resizeHandleProps} />
    </div>
  );
}
