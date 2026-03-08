import {
  endOfDay,
  formatDateLong,
  formatLocalTime,
  formatRangeLabel,
  getDateKeyFromTimestamp,
  getStartOfCurrentMonth,
  getStartOfCurrentWeek,
  getToday,
  startOfDay,
} from "./date";
import type {
  Entry,
  FilterPeriod,
  FilterState,
  InsightPeriod,
  MergeCandidate,
  ProjectSummary,
  ReportSummary,
} from "./types";

function normalizeProjectName(project?: string): string {
  const value = (project ?? "").trim();
  return value.length > 0 ? value : "Sin proyecto";
}

function getPeriodBounds(period: FilterPeriod, from: string, to: string): {
  fromTs: number | null;
  toTs: number | null;
  fromKey: string | null;
  toKey: string | null;
  label: string;
} {
  if (period === "today") {
    const today = getToday();
    return {
      fromTs: startOfDay(today),
      toTs: endOfDay(today),
      fromKey: today,
      toKey: today,
      label: "Hoy",
    };
  }

  if (period === "week") {
    const weekStart = getStartOfCurrentWeek();
    const today = getToday();
    return {
      fromTs: weekStart,
      toTs: endOfDay(today),
      fromKey: getDateKeyFromTimestamp(weekStart),
      toKey: today,
      label: "Esta semana",
    };
  }

  if (period === "custom") {
    const normalizedFrom = from || null;
    const normalizedTo = to || null;
    return {
      fromTs: normalizedFrom ? startOfDay(normalizedFrom) : null,
      toTs: normalizedTo ? endOfDay(normalizedTo) : null,
      fromKey: normalizedFrom,
      toKey: normalizedTo,
      label: formatRangeLabel(normalizedFrom, normalizedTo),
    };
  }

  return {
    fromTs: null,
    toTs: null,
    fromKey: null,
    toKey: null,
    label: "Todo el historial",
  };
}

export function getAvailableProjects(entries: Entry[]): string[] {
  return Array.from(
    new Set(entries.map((entry) => normalizeProjectName(entry.project)))
  ).sort((a, b) => a.localeCompare(b, "es"));
}

export function getFilteredEntries(entries: Entry[], filter: FilterState): Entry[] {
  const { fromTs, toTs } = getPeriodBounds(filter.period, filter.from, filter.to);
  const search = filter.search.trim().toLocaleLowerCase("es");
  const projectFilter = filter.project.trim();

  return entries.filter((entry) => {
    if (fromTs !== null && entry.start < fromTs) return false;
    if (toTs !== null && entry.start > toTs) return false;

    if (projectFilter.length > 0 && normalizeProjectName(entry.project) !== projectFilter) {
      return false;
    }

    if (search.length > 0) {
      const haystack = `${normalizeProjectName(entry.project)} ${entry.notes}`.toLocaleLowerCase("es");
      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}

export function getFilterLabel(filter: FilterState): string {
  return getPeriodBounds(filter.period, filter.from, filter.to).label;
}

export function getProjectSummaries(
  entries: Entry[],
  period: InsightPeriod,
  limit = 5
): ProjectSummary[] {
  const fromTs = period === "week" ? getStartOfCurrentWeek() : getStartOfCurrentMonth();
  const scopedEntries = entries.filter((entry) => entry.start >= fromTs);
  const totalSeconds = scopedEntries.reduce((sum, entry) => sum + entry.duration, 0);
  const groups = new Map<string, { totalSeconds: number; sessions: number }>();

  for (const entry of scopedEntries) {
    const key = normalizeProjectName(entry.project);
    const group = groups.get(key) ?? { totalSeconds: 0, sessions: 0 };
    group.totalSeconds += entry.duration;
    group.sessions += 1;
    groups.set(key, group);
  }

  return Array.from(groups.entries())
    .map(([project, values]) => ({
      project,
      totalSeconds: values.totalSeconds,
      sessions: values.sessions,
      share: totalSeconds > 0 ? values.totalSeconds / totalSeconds : 0,
    }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds)
    .slice(0, limit);
}

export function getReportSummary(entries: Entry[], rangeLabel: string): ReportSummary {
  const totalSeconds = entries.reduce((sum, entry) => sum + entry.duration, 0);
  const groups = Array.from(
    entries.reduce((map, entry) => {
      const project = normalizeProjectName(entry.project);
      const current = map.get(project) ?? { totalSeconds: 0, sessions: 0 };
      current.totalSeconds += entry.duration;
      current.sessions += 1;
      map.set(project, current);
      return map;
    }, new Map<string, { totalSeconds: number; sessions: number }>())
  )
    .map(([project, value]) => ({
      project,
      totalSeconds: value.totalSeconds,
      sessions: value.sessions,
      share: totalSeconds > 0 ? value.totalSeconds / totalSeconds : 0,
    }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);
  const projectCount = new Set(entries.map((entry) => normalizeProjectName(entry.project))).size;

  return {
    totalSeconds,
    totalSessions: entries.length,
    projectCount: entries.length > 0 ? projectCount : 0,
    averageSeconds: entries.length > 0 ? Math.round(totalSeconds / entries.length) : 0,
    rangeLabel,
    topProject: groups[0] ?? null,
  };
}

export function findMergeCandidates(entryId: number, entries: Entry[]): MergeCandidate[] {
  const sorted = [...entries].sort((a, b) => a.start - b.start);
  const index = sorted.findIndex((entry) => entry.id === entryId);
  if (index === -1) return [];

  const entry = sorted[index];
  const candidates: MergeCandidate[] = [];
  const previous = sorted[index - 1];
  const next = sorted[index + 1];

  if (previous && getDateKeyFromTimestamp(previous.start) === getDateKeyFromTimestamp(entry.start)) {
    const gap = Math.max(0, Math.round((entry.start - previous.end) / 1000));
    if (gap <= 15 * 60) {
      candidates.push({
        id: previous.id,
        label: `${formatLocalTime(previous.start)} - ${formatLocalTime(previous.end)}`,
        gapSeconds: gap,
        position: "before",
      });
    }
  }

  if (next && getDateKeyFromTimestamp(next.start) === getDateKeyFromTimestamp(entry.start)) {
    const gap = Math.max(0, Math.round((next.start - entry.end) / 1000));
    if (gap <= 15 * 60) {
      candidates.push({
        id: next.id,
        label: `${formatLocalTime(next.start)} - ${formatLocalTime(next.end)}`,
        gapSeconds: gap,
        position: "after",
      });
    }
  }

  return candidates;
}

export function buildClipboardReport(summary: ReportSummary): string {
  const lines = [
    `Resumen TimeLog: ${summary.rangeLabel}`,
    `Horas registradas: ${(summary.totalSeconds / 3600).toFixed(1)}h`,
    `Sesiones: ${summary.totalSessions}`,
    `Proyectos activos: ${summary.projectCount}`,
    `Media por sesion: ${(summary.averageSeconds / 3600).toFixed(1)}h`,
  ];

  if (summary.topProject) {
    lines.push(
      `Proyecto principal: ${summary.topProject.project} (${(summary.topProject.totalSeconds / 3600).toFixed(1)}h)`
    );
  }

  return lines.join("\n");
}

export function describeLastExport(timestamp: number | null): string {
  if (!timestamp) return "Todavia no has exportado una copia.";

  const date = new Date(timestamp);
  return `Ultima exportacion: ${formatDateLong(getDateKeyFromTimestamp(timestamp))} a las ${date.toLocaleTimeString(
    "es-ES",
    { hour: "2-digit", minute: "2-digit" }
  )}`;
}
