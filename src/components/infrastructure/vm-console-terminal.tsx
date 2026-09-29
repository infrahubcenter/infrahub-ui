"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { KeyRound, Upload } from "lucide-react";
import { ExpandToggleButton, ResizeHandle, useExpandablePanel } from "@/components/infrastructure/expandable-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { vmConsoleUrl, type VMConsoleInboundFrame } from "@/lib/api";

type ConsoleState = "connecting" | "connected" | "error" | "closed";

// bytesToBase64/base64ToBytes: the browser has no built-in Uint8Array<->
// base64 conversion available across all supported browsers yet, so this
// goes through btoa/atob's "binary string" convention -- matching exactly
// what the Go backend does with encoding/base64 on the raw PTY bytes, so a
// multi-byte UTF-8 keystroke (or output containing one) round-trips
// correctly instead of being mangled by btoa's own Latin1 assumption.
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// One choice made in the pre-connect chooser below. "saved" uses the VM's
// already-attached named credential (fast path -- the backend connects
// immediately, no first-frame wait); "ephemeral" reads a key file straight
// from the browser and sends it once, on this session's first WebSocket
// frame, never persisted anywhere (see vm_console.go's doc comment on the
// backend). Every reconnect starts back at the chooser -- a key (saved or
// ephemeral) must be actively chosen again each time, matching "offline
// unless actively connected."
type ConnectChoice = { mode: "saved" } | { mode: "ephemeral"; privateKey: string };

// The actual interactive terminal: opens the authenticated WebSocket
// (GET /api/vms/:id/console), wires xterm.js's input/output/resize
// straight onto it, and never handles a saved SSH credential's own bytes
// -- the Go backend owns the SSH session exclusively; an ephemeral key
// chosen here is sent once, over this same WebSocket, and never touches
// any other endpoint. Architecture: Browser --(this WebSocket)--> Go
// backend --(authorized SSH)--> VM.
export function VMConsoleTerminal({ vmId, vmName, hasSavedKey }: { vmId: string; vmName: string; hasSavedKey: boolean }) {
  const [choice, setChoice] = useState<ConnectChoice | null>(null);
  // A fresh session number per choice, so ConnectedTerminal always fully
  // remounts (new Terminal instance, new WebSocket) rather than an effect
  // re-running in place -- simplest way to guarantee a clean slate every
  // time the chooser is used again after Disconnect.
  const [session, setSession] = useState(0);

  if (!choice) {
    return (
      <ConnectChooser
        vmName={vmName}
        hasSavedKey={hasSavedKey}
        onChoose={(c) => {
          setSession((n) => n + 1);
          setChoice(c);
        }}
      />
    );
  }
  return <ConnectedTerminal key={session} vmId={vmId} vmName={vmName} choice={choice} onDisconnect={() => setChoice(null)} />;
}

function ConnectChooser({
  vmName,
  hasSavedKey,
  onChoose,
}: {
  vmName: string;
  hasSavedKey: boolean;
  onChoose: (choice: ConnectChoice) => void;
}) {
  return (
    <div className="flex h-[70vh] w-full flex-col items-center justify-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
      <p className="text-sm text-slate-600">
        {hasSavedKey ? <>Ready to connect to <strong>{vmName}</strong>.</> : <><strong>{vmName}</strong> has no saved SSH key -- provide one for this session.</>}
      </p>
      <div className="flex flex-col items-center gap-3">
        {hasSavedKey && (
          <Button onClick={() => onChoose({ mode: "saved" })}>
            <KeyRound className="h-4 w-4" /> Use Saved Key
          </Button>
        )}
        <div className="flex flex-col items-center gap-1.5">
          <label htmlFor="console-ephemeral-key" className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900">
            <Upload className="h-4 w-4" /> Provide a Key for This Session
          </label>
          <Input
            id="console-ephemeral-key"
            type="file"
            accept=".pem,.key,text/plain,application/x-pem-file"
            className="max-w-xs"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              onChoose({ mode: "ephemeral", privateKey: text });
            }}
          />
          <p className="text-xs text-slate-400">Read from your device, never uploaded or saved -- used only for this session.</p>
        </div>
      </div>
    </div>
  );
}

function ConnectedTerminal({
  vmId,
  vmName,
  choice,
  onDisconnect,
}: {
  vmId: string;
  vmName: string;
  choice: ConnectChoice;
  onDisconnect: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastSizeRef = useRef<{ rows: number; cols: number } | null>(null);
  const [state, setState] = useState<ConsoleState>("connecting");
  const [message, setMessage] = useState<string | null>(null);
  const { fullscreen, toggleFullscreen, contentStyle, contentClassName, panelClassName, resizeHandleProps } = useExpandablePanel(600);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      lineHeight: 1.2,
      fontFamily: "var(--font-mono, ui-monospace, monospace)",
      // A background-only theme leaves every ANSI color slot on xterm.js's
      // own built-in default palette, which is tuned for a pure-black
      // background -- washed out and low-contrast against this app's navy
      // (#0f172a). Defining the full 16-color ANSI set explicitly (a
      // standard, high-contrast palette matching common terminal emulators
      // like MobaXterm/iTerm) is what actually makes colored output --
      // `ls --color`, a git prompt, red/green success-or-failure text --
      // render distinctly instead of all blending into one washed-out hue.
      theme: {
        background: "#0f172a",
        foreground: "#e2e8f0",
        cursor: "#e2e8f0",
        cursorAccent: "#0f172a",
        selectionBackground: "#334155",
        black: "#1e293b",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#fbbf24",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#e2e8f0",
        brightBlack: "#64748b",
        brightRed: "#fca5a5",
        brightGreen: "#86efac",
        brightYellow: "#fde047",
        brightBlue: "#93c5fd",
        brightMagenta: "#d8b4fe",
        brightCyan: "#67e8f9",
        brightWhite: "#f8fafc",
      },
      scrollback: 5000,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    termRef.current = term;

    let cancelled = false;
    let ws: WebSocket | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let dataDisposable: { dispose(): void } | null = null;

    // The PTY's initial size (sent as ?rows=&cols= on connect, before the
    // remote shell prints its MOTD/prompt) has to reflect the terminal's
    // REAL on-screen size -- fitAddon.fit() measures character width using
    // whatever font is currently active, and measures the container's box
    // using whatever layout has been committed so far. Calling it
    // synchronously right after term.open() races both: the mono webfont
    // (next/font) may not have swapped in yet, and the surrounding flex
    // layout (h-[70vh] etc.) may not have settled its box size yet. Either
    // race silently produces a too-small rows/cols, and everything the
    // remote shell prints before the first resize event lands (including
    // the whole login banner) gets wrapped for that wrong width --
    // exactly the "compressed/garbled" look real console tools never
    // have, since they always measure after layout+fonts are ready.
    async function start() {
      try {
        await document.fonts.ready;
      } catch {
        // Font-loading readiness isn't available/relevant in every
        // environment (e.g. some test runners) -- fall through and fit
        // with whatever's active rather than blocking the console forever.
      }
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      if (cancelled) return;

      fitAddon.fit();
      term.focus();

      const useEphemeral = choice.mode === "ephemeral";
      const socket = new WebSocket(vmConsoleUrl(vmId, term.rows, term.cols, useEphemeral));
      ws = socket;
      wsRef.current = socket;
      lastSizeRef.current = { rows: term.rows, cols: term.cols };

      socket.onopen = () => {
        setState("connected");
        // Only send this frame when the backend is actually waiting for
        // one (useEphemeral, i.e. ?use_ephemeral_key=1 above -- a keyless
        // VM always sets that internally via hasSavedKey gating the
        // chooser). On the fast "use the VM's saved key" path the backend
        // never reads an inbound frame before either opening the SSH
        // session or failing -- an unread frame left sitting in the
        // socket's receive buffer at that point can make the OS send an
        // RST instead of a clean FIN when the connection is closed right
        // after, which can silently drop the very "error" message this
        // component is relying on to explain the failure.
        if (useEphemeral) {
          socket.send(JSON.stringify({ type: "connect", private_key: choice.privateKey }));
        }
      };

      socket.onmessage = (ev) => {
        let frame: VMConsoleInboundFrame;
        try {
          frame = JSON.parse(ev.data as string) as VMConsoleInboundFrame;
        } catch {
          return;
        }
        if (frame.type === "output") {
          term.write(base64ToBytes(frame.data));
        } else if (frame.type === "error") {
          term.write(`\r\n\x1b[31m${frame.message}\x1b[0m\r\n`);
          setState("error");
          setMessage(frame.message);
        } else if (frame.type === "closed") {
          setState("closed");
        }
      };

      socket.onclose = () => {
        setState((prev) => (prev === "error" ? prev : "closed"));
      };
      socket.onerror = () => {
        // The browser's WebSocket error event carries no usable detail by
        // design -- onclose (which always follows) is what actually
        // updates state; this only avoids an unhandled-error console entry.
      };

      dataDisposable = term.onData((data) => {
        if (socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({ type: "input", data: bytesToBase64(new TextEncoder().encode(data)) }));
      });

      resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
        const { rows, cols } = term;
        const last = lastSizeRef.current;
        if (last && last.rows === rows && last.cols === cols) return;
        lastSizeRef.current = { rows, cols };
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "resize", rows, cols }));
        }
      });
      // container is guaranteed non-null past the early return above, but
      // TypeScript doesn't carry that narrowing into this nested async
      // function's closure.
      resizeObserver.observe(container as HTMLDivElement);
    }

    void start();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      dataDisposable?.dispose();
      ws?.close();
      wsRef.current = null;
      term.dispose();
      termRef.current = null;
    };
    // choice is intentionally excluded: ConnectedTerminal is remounted
    // (via VMConsoleTerminal's `key`) for every new choice rather than
    // re-running this effect in place -- see that component's render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vmId]);

  function handleDisconnect() {
    wsRef.current?.close();
    onDisconnect();
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
            {state === "connected" && `Connected to ${vmName}`}
            {state === "closed" && "Disconnected"}
            {state === "error" && (message ?? "Connection error")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDisconnect}>
            Disconnect
          </Button>
          <ExpandToggleButton fullscreen={fullscreen} onToggle={toggleFullscreen} />
        </div>
      </div>
      <div
        ref={containerRef}
        style={contentStyle}
        className={`w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-950 p-2 ${contentClassName}`}
      />
      <ResizeHandle hidden={fullscreen} {...resizeHandleProps} />
    </div>
  );
}
