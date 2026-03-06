import { formatDateKey, getToday, getTodayTotalSeconds } from "./date";
import type { Entry } from "./types";

function getFiredKey(today: string): string {
  return `timelog_notif_fired_${today}`;
}

function loadFired(today: string): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(getFiredKey(today)) ?? "[]");
    return Array.isArray(raw) ? raw.filter((value) => typeof value === "number") : [];
  } catch {
    return [];
  }
}

function saveFired(today: string, values: number[]): void {
  localStorage.setItem(getFiredKey(today), JSON.stringify(values));
}

export async function requestNotifPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

export function evaluateNotification(
  entries: Entry[],
  thresholdHours: number | null,
  runningSeconds = 0,
  runningSessionStart: number | null = null
): void {
  if (!thresholdHours || !("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const today = getToday();
  let todayTotal = getTodayTotalSeconds(entries, today);

  if (runningSeconds > 0 && runningSessionStart !== null) {
    const runningDateKey = formatDateKey(new Date(runningSessionStart));
    if (runningDateKey === today) {
      todayTotal += runningSeconds;
    }
  }

  const thresholdSeconds = thresholdHours * 3600;
  const fired = loadFired(today);

  if (todayTotal < thresholdSeconds || fired.includes(thresholdHours)) {
    return;
  }

  new Notification("TimeLog", {
    body: `Has alcanzado ${thresholdHours}h registradas hoy.`,
    icon: "/icon-192.png",
  });

  fired.push(thresholdHours);
  saveFired(today, fired);
}
