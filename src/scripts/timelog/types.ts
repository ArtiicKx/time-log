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
