import type { Entry } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getToday(): string {
  return formatDateKey(new Date());
}

export function formatClock(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return [hours, minutes, secs].map((value) => String(value).padStart(2, "0")).join(":");
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${secs}s`;
}

export function formatTotalTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function formatLocalTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatLocalTimeSec(ts: number): string {
  return new Date(ts).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function getCurrentDateLabel(): string {
  return new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function getStartOfCurrentWeek(now = new Date()): number {
  const start = new Date(now);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + diff);
  return start.getTime();
}

export function isEntryInCurrentWeek(entry: Entry, now = new Date()): boolean {
  return entry.start >= getStartOfCurrentWeek(now);
}

export function getTodayTotalSeconds(entries: Entry[], today = getToday()): number {
  return entries
    .filter((entry) => entry.date === today)
    .reduce((sum, entry) => sum + entry.duration, 0);
}

export function buildLocalTimestamp(dateKey: string, timeValue: string): number | null {
  const normalizedTime = timeValue.trim();
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(normalizedTime)) return null;

  const base = new Date(`${dateKey}T${normalizedTime}`);
  if (Number.isNaN(base.getTime())) return null;
  return base.getTime();
}

export function adjustEndTimestamp(start: number, end: number): number {
  if (end >= start) return end;
  return end + DAY_MS;
}
