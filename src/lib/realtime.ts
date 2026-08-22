"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAccessToken, socketUrl } from "@/lib/api/client";
import { qk } from "@/lib/query/keys";
import { useSession } from "@/lib/store/session";

/* ==========================================================================
   The queue socket (§3.6).

   The server pushes "something in this clinic's queue moved" and nothing else:
   no names, no reasons, no clinical detail. This hook turns that into a cache
   invalidation, so the queue is re-read through the same guarded endpoint as
   always and there is only ever one description of what the queue is.

   The socket is opened with the current access token and closes itself when
   that token expires (4440); reconnecting picks up a fresh one, so a screen
   left running in a waiting room stays live without holding a long-lived
   credential.
   ========================================================================== */

const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

export type ConnectionState = "connecting" | "live" | "offline";

export function useQueueStream(): ConnectionState {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [state, setState] = React.useState<ConnectionState>("connecting");

  const tenantId = session.tenantId;
  const signedIn = session.signedIn;

  React.useEffect(() => {
    if (!signedIn || !tenantId || typeof window === "undefined") return;

    let socket: WebSocket | null = null;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const refresh = () => {
      /* One event, one re-read. Everything a queue change touches hangs off the
         clinic's key, and TanStack coalesces the refetches. */
      void queryClient.invalidateQueries({ queryKey: qk.queue(tenantId) });
      void queryClient.invalidateQueries({ queryKey: qk.appointments(tenantId) });
    };

    const connect = () => {
      const token = getAccessToken();
      if (!token) {
        timer = setTimeout(connect, 1_000);
        return;
      }

      setState((s) => (s === "live" ? s : "connecting"));
      socket = new WebSocket(socketUrl("/v1/ws/queue", token));

      socket.onopen = () => {
        attempt = 0;
        setState("live");
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string) as { type: string };
          if (message.type.startsWith("queue.")) refresh();
        } catch {
          /* a message we cannot read is a message we do not act on */
        }
      };

      socket.onerror = () => socket?.close();

      socket.onclose = () => {
        if (closed) return;
        setState("offline");
        /* Re-read on the way back up: whatever we missed while away is in the
           next response. */
        const wait = RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)];
        timer = setTimeout(() => {
          refresh();
          connect();
        }, wait);
      };
    };

    connect();

    /* A tab brought back to the foreground may have missed events entirely. */
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refresh();
        if (socket?.readyState === WebSocket.CLOSED) connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, [signedIn, tenantId, queryClient]);

  return state;
}
