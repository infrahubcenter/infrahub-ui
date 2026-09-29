"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAgo } from "@/lib/format";
import { ApiError, listNotifications, markAllNotificationsRead, markNotificationRead, type Notification } from "@/lib/api";

const PAGE_SIZE = 50;

// Fuller history than the header bell's dropdown -- same scoping (always
// the caller's own notifications, never another user's), mirroring
// alerts/page.tsx's table shape.
export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listNotifications({ limit: PAGE_SIZE })
      .then((res) => {
        setNotifications(res.notifications);
        setUnreadCount(res.unread_count);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load notifications."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to mark notifications read.");
    }
  }

  async function handleMarkRead(n: Notification) {
    if (n.read_at) return;
    try {
      await markNotificationRead(n.id);
      load();
    } catch {
      // Best-effort -- the row simply stays unread until the next load.
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Bell className="h-5 w-5" /> Notifications
          </h2>
          <p className="text-sm text-slate-500">Your recent alerts and system events -- always your own, never another user&apos;s.</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleMarkAllRead} disabled={unreadCount === 0}>
          Mark all read
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {notifications !== null && notifications.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <Bell className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">No notifications yet.</p>
        </div>
      ) : (
        notifications !== null && (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {notifications.map((n) => (
                  <TableRow key={n.id} className={n.read_at ? undefined : "bg-sky-50/50"}>
                    <TableCell>{!n.read_at && <span className="block h-1.5 w-1.5 rounded-full bg-sky-500" />}</TableCell>
                    <TableCell>
                      {n.alert_id ? (
                        <Link
                          href={`/alerts/${n.alert_id}`}
                          className="font-medium text-sky-700 hover:underline"
                          onClick={() => handleMarkRead(n)}
                        >
                          {n.title}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-900">{n.title}</span>
                      )}
                      {n.body && <div className="text-xs text-slate-500">{n.body}</div>}
                    </TableCell>
                    <TableCell className="text-slate-600">{n.category.replace(/_/g, " ")}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{n.channel}</Badge>
                    </TableCell>
                    <TableCell className="text-slate-600">{formatAgo(n.created_at)}</TableCell>
                    <TableCell>
                      {!n.read_at && (
                        <Button variant="ghost" size="sm" onClick={() => handleMarkRead(n)}>
                          Mark read
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}
    </div>
  );
}
