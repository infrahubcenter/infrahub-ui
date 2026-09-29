"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MIN_HEIGHT_PX = 200;
const MAX_HEIGHT_PX = 1400;

// Shared by VM Console and the VM/Docker/K8s log viewers -- one full
// screen toggle (a fixed, full-viewport overlay covering header+content
// together, not just the content box, so Disconnect/Reconnect/Exit stay
// reachable) plus one manual drag-to-resize handle on the panel's bottom
// edge. Manual height and fullscreen don't conflict: toggling fullscreen
// never discards the manually-dragged height, it's just restored on exit.
export function useExpandablePanel(defaultHeightPx: number) {
  const [heightPx, setHeightPx] = useState(defaultHeightPx);
  const [fullscreen, setFullscreen] = useState(false);
  const dragState = useRef<{ startY: number; startHeight: number } | null>(null);

  const toggleFullscreen = useCallback(() => setFullscreen((v) => !v), []);

  // Escape exits fullscreen, and the page behind it can't be scrolled
  // while it's up -- same conventions a native fullscreen/modal view
  // already carries, so this doesn't feel like a one-off custom widget.
  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen]);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (fullscreen) return;
      e.preventDefault();
      dragState.current = { startY: e.clientY, startHeight: heightPx };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [fullscreen, heightPx]
  );
  const onResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const delta = e.clientY - dragState.current.startY;
    setHeightPx(Math.min(MAX_HEIGHT_PX, Math.max(MIN_HEIGHT_PX, dragState.current.startHeight + delta)));
  }, []);
  const onResizePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragState.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  return {
    fullscreen,
    toggleFullscreen,
    heightPx,
    /** Apply to the outermost wrapper (the one containing both the header row and the content box). */
    panelClassName: cn(fullscreen && "fixed inset-0 z-50 flex flex-col bg-background p-4"),
    /** Apply to the content box in place of a fixed h-[Xvh] class. */
    contentStyle: fullscreen ? undefined : { height: heightPx },
    contentClassName: cn(fullscreen && "min-h-0 flex-1"),
    resizeHandleProps: { onPointerDown: onResizePointerDown, onPointerMove: onResizePointerMove, onPointerUp: onResizePointerUp },
  };
}

export function ExpandToggleButton({ fullscreen, onToggle }: { fullscreen: boolean; onToggle: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onToggle} title={fullscreen ? "Exit full screen" : "Expand to full screen"}>
      {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
    </Button>
  );
}

export function ResizeHandle({
  hidden,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  hidden?: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  if (hidden) return null;
  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      title="Drag to resize"
      className="group flex h-3 w-full shrink-0 touch-none items-center justify-center rounded-b-lg"
      style={{ cursor: "row-resize" }}
    >
      <div className="h-1 w-10 rounded-full bg-border group-hover:bg-muted-foreground/50" />
    </div>
  );
}
