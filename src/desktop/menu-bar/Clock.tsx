"use client";

import { useEffect, useState } from "react";

const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const fullFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" });

/** Menu-bar clock. Re-renders once per minute, aligned to the minute boundary. */
export function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const ms = 60_000 - (Date.now() % 60_000) + 20;
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, ms);
    };
    schedule();
    // Timers are throttled in background tabs; resync when we come back.
    const onVisible = () => document.visibilityState === "visible" && setNow(new Date());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <time
      dateTime={now.toISOString()}
      title={fullFmt.format(now)}
      className="flex items-center gap-2 px-1.5 tabular-nums"
    >
      <span className="text-muted">{dateFmt.format(now)}</span>
      <span>{timeFmt.format(now)}</span>
    </time>
  );
}
