"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { formatAgo } from "@/lib/format";
import { listNotifications, markAllNotificationsRead, markNotificationRead, type Notification } from "@/lib/api";

const POLL_MS = 30_000;

// Header widget -- always scoped to the caller's own notifications (the
// backend keys /api/notifications off the session, never accepts a
// user id). Polls just the unread count in the background; the fuller
// recent list is only fetched once the panel is opened. Reuses the Sheet
// primitive the mobile sidebar already uses rather than introducing a new
// popover/dropdown component.
export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);

  const pollCount = useCallback(() => {
    listNotifications({ unread_only: true, limit: 1 })
      .then((res) => setUnreadCount(res.unread_count))
      .catch(() => {});
  }, []);

  useEffect(() => {
    pollCount();
    const interval = setInterval(pollCount, POLL_MS);
    return () => clearInterval(interval);
  }, [pollCount]);

  const loadList = useCallback(() => {
    listNotifications({ limit: 20 })
      .then((res) => {
        setNotifications(res.notifications);
        setUnreadCount(res.unread_count);
      })
      .catch(() => setNotifications([]));
  }, []);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) loadList();
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead();
      loadList();
    } catch {
      // Best-effort -- the bell count will simply catch up on the next poll.
    }
  }

  function handleNotificationClick(n: Notification) {
    if (n.read_at) return;
    markNotificationRead(n.id).catch(() => {});
    setNotifications((prev) => prev?.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)) ?? prev);
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" aria-label="Notifications" className="relative" />}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-medium text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>Your recent alerts and system events.</SheetDescription>
        </SheetHeader>

        <div className="flex items-center justify-between px-4">
          <Link href="/notifications" className="text-xs text-sky-700 hover:underline" onClick={() => setOpen(false)}>
            See all
          </Link>
          <Button variant="outline" size="sm" onClick={handleMarkAllRead} disabled={unreadCount === 0}>
            Mark all read
          </Button>
        </div>

        <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-4 pb-4">
          {notifications === null ? (
            <p className="text-sm text-slate-500">Loading&hellip;</p>
          ) : notifications.length === 0 ? (
            <p className="text-sm text-slate-500">No notifications yet.</p>
          ) : (
            notifications.map((n) => {
              const card = (
                <div
                  className={`flex flex-col gap-0.5 rounded-md border p-2.5 text-sm ${
                    n.read_at ? "border-slate-200 bg-white" : "border-sky-200 bg-sky-50"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {!n.read_at && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />}
                    <span className="font-medium text-slate-900">{n.title}</span>
                  </div>
                  {n.body && <p className="text-xs text-slate-600">{n.body}</p>}
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{n.category.replace(/_/g, " ")}</span>
                    <span>{formatAgo(n.created_at)}</span>
                  </div>
                </div>
              );
              return n.alert_id ? (
                <Link
                  key={n.id}
                  href={`/alerts/${n.alert_id}`}
                  onClick={() => {
                    handleNotificationClick(n);
                    setOpen(false);
                  }}
                >
                  {card}
                </Link>
              ) : (
                <button key={n.id} type="button" className="text-left" onClick={() => handleNotificationClick(n)}>
                  {card}
                </button>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
