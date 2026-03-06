import type { Entry, RunningState } from "./types";

const STORAGE_KEY = "timelog_entries";
const RUNNING_KEY = "timelog_running";
const NOTIF_KEY = "timelog_notif_threshold";

function normalizeEntry(raw: unknown): Entry | null {
  if (!raw || typeof raw !== "object") return null;

  const candidate = raw as Record<string, unknown>;
  const id = Number(candidate.id);
  const start = Number(candidate.start);
  const end = Number(candidate.end);
  const duration = Number(candidate.duration);
  const notes = typeof candidate.notes === "string" ? candidate.notes : "";
  const date = typeof candidate.date === "string" ? candidate.date : "";
  const project =
    typeof candidate.project === "string" && candidate.project.trim().length > 0
      ? candidate.project.trim()
      : undefined;

  if (
    !Number.isFinite(id) ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    !Number.isFinite(duration) ||
    !date
  ) {
    return null;
  }

  return {
    id,
    start,
    end,
    duration,
    notes,
    date,
    project,
  };
}

export function loadEntries(): Entry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizeEntry).filter((entry): entry is Entry => entry !== null);
  } catch {
    return [];
  }
}

export function saveEntries(entries: Entry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function loadRunningState(): RunningState | null {
  try {
    const raw = localStorage.getItem(RUNNING_KEY);
    return raw ? (JSON.parse(raw) as RunningState) : null;
  } catch {
    return null;
  }
}

export function saveRunningState(state: RunningState): void {
  localStorage.setItem(RUNNING_KEY, JSON.stringify(state));
}

export function clearRunningState(): void {
  localStorage.removeItem(RUNNING_KEY);
}

export function loadNotifThreshold(): number | null {
  const raw = localStorage.getItem(NOTIF_KEY);
  if (!raw) return null;

  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function saveNotifThreshold(hours: number | null): void {
  if (hours === null) {
    localStorage.removeItem(NOTIF_KEY);
    return;
  }

  localStorage.setItem(NOTIF_KEY, String(hours));
}
