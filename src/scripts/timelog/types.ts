export interface Entry {
  id: number;
  start: number;
  end: number;
  duration: number;
  notes: string;
  date: string;
  project?: string;
}

export type TimerState = "idle" | "running" | "paused";

export interface RunningState {
  sessionStart?: number;
  segmentStart?: number | null;
  accumulatedSeconds?: number;
  note?: string;
  project?: string;
  timerState?: TimerState;
  start?: number;
}

export type FilterPeriod = "all" | "today" | "week" | "custom";
export type InsightPeriod = "week" | "month";

export interface FilterState {
  period: FilterPeriod;
  search: string;
  project: string;
  from: string;
  to: string;
}

export interface Preferences {
  dailyGoalHours: number;
  weeklyGoalHours: number;
  lastExportAt: number | null;
}

export interface ProjectSummary {
  project: string;
  totalSeconds: number;
  sessions: number;
  share: number;
}

export interface ReportSummary {
  totalSeconds: number;
  totalSessions: number;
  projectCount: number;
  averageSeconds: number;
  rangeLabel: string;
  topProject: ProjectSummary | null;
}

export interface MergeCandidate {
  id: number;
  label: string;
  gapSeconds: number;
  position: "before" | "after";
}
