import {
  adjustEndTimestamp,
  buildLocalTimestamp,
  formatDuration,
  formatLocalTimeSec,
} from "./date";
import type { Entry } from "./types";

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildCsv(entries: Entry[]): string {
  const BOM = "\uFEFF";
  const headers = [
    "ID",
    "Fecha",
    "Inicio (ts)",
    "Fin (ts)",
    "Hora inicio",
    "Hora fin",
    "Duracion (seg)",
    "Duracion",
    "Proyecto",
    "Nota",
  ];

  const rows = entries.map((entry) =>
    [
      entry.id,
      entry.date,
      entry.start,
      entry.end,
      formatLocalTimeSec(entry.start),
      formatLocalTimeSec(entry.end),
      entry.duration,
      formatDuration(entry.duration),
      escapeCsv(entry.project ?? ""),
      escapeCsv(entry.notes ?? ""),
    ].join(",")
  );

  return BOM + [headers.join(","), ...rows].join("\n");
}

export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

function parseRequiredNumber(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalText(value: string | undefined): string {
  return (value ?? "").trim();
}

function resolveStartAndEnd(
  headers: string[],
  cols: string[],
  fallbackDate: string,
  duration: number
): { start: number; end: number } | null {
  const startTsIdx = headers.indexOf("Inicio (ts)");
  const endTsIdx = headers.indexOf("Fin (ts)");
  const startTimeIdx = headers.indexOf("Hora inicio");
  const endTimeIdx = headers.indexOf("Hora fin");

  const startTs = startTsIdx >= 0 ? parseRequiredNumber(cols[startTsIdx]) : null;
  const endTs = endTsIdx >= 0 ? parseRequiredNumber(cols[endTsIdx]) : null;

  if (startTs !== null) {
    const resolvedEnd = endTs ?? startTs + duration * 1000;
    return { start: startTs, end: adjustEndTimestamp(startTs, resolvedEnd) };
  }

  const startTime =
    startTimeIdx >= 0 ? buildLocalTimestamp(fallbackDate, cols[startTimeIdx] ?? "") : null;
  const endTime =
    endTimeIdx >= 0 ? buildLocalTimestamp(fallbackDate, cols[endTimeIdx] ?? "") : null;

  if (startTime !== null) {
    const resolvedEnd =
      endTime !== null ? adjustEndTimestamp(startTime, endTime) : startTime + duration * 1000;
    return { start: startTime, end: resolvedEnd };
  }

  return null;
}

export function parseCsvEntries(
  text: string,
  existingEntries: Entry[]
): { importedEntries: Entry[]; skipped: number } {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("empty");
  }

  const headers = parseCSVLine(lines[0]);
  const idIdx = headers.indexOf("ID");
  const dateIdx = headers.indexOf("Fecha");
  const durationIdx =
    headers.indexOf("Duracion (seg)") >= 0
      ? headers.indexOf("Duracion (seg)")
      : headers.indexOf("Duración (seg)");
  const noteIdx = headers.indexOf("Nota");
  const projectIdx = headers.indexOf("Proyecto");

  if (idIdx < 0 || dateIdx < 0 || durationIdx < 0) {
    throw new Error("format");
  }

  const existingIds = new Set(existingEntries.map((entry) => entry.id));
  const importedEntries: Entry[] = [];
  let skipped = 0;

  for (const line of lines.slice(1)) {
    const cols = parseCSVLine(line);
    const id = parseRequiredNumber(cols[idIdx]);
    const duration = parseRequiredNumber(cols[durationIdx]);
    const date = parseOptionalText(cols[dateIdx]);

    if (id === null || duration === null || !date || existingIds.has(id)) {
      skipped += 1;
      continue;
    }

    const timestamps = resolveStartAndEnd(headers, cols, date, duration);
    if (!timestamps) {
      skipped += 1;
      continue;
    }

    const entry: Entry = {
      id,
      start: timestamps.start,
      end: timestamps.end,
      duration,
      notes: parseOptionalText(noteIdx >= 0 ? cols[noteIdx] : ""),
      date,
      project: parseOptionalText(projectIdx >= 0 ? cols[projectIdx] : "") || undefined,
    };

    importedEntries.push(entry);
    existingIds.add(id);
  }

  return { importedEntries, skipped };
}
