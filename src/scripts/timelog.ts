import {
  buildClipboardReport,
  describeLastExport,
  findMergeCandidates,
  getAvailableProjects,
  getFilterLabel,
  getFilteredEntries,
  getProjectSummaries,
  getReportSummary,
} from "./timelog/analytics";
import { buildCsv, parseCsvEntries } from "./timelog/csv";
import {
  adjustEndTimestamp,
  buildLocalTimestamp,
  esc,
  formatClock,
  formatDateInput,
  formatDuration,
  formatHoursCompact,
  formatLocalTime,
  formatLocalTimeSec,
  formatTotalTime,
  getDateKeyFromTimestamp,
  getStartOfCurrentWeek,
  getToday,
  getTodayTotalSeconds,
} from "./timelog/date";
import { evaluateNotification, requestNotifPermission } from "./timelog/notifications";
import {
  clearRunningState,
  loadEntries,
  loadNotifThreshold,
  loadPreferences,
  loadRunningState,
  saveEntries,
  saveNotifThreshold,
  savePreferences,
  saveRunningState,
} from "./timelog/storage";
import type {
  Entry,
  FilterState,
  InsightPeriod,
  Preferences,
  RunningState,
  TimerState,
} from "./timelog/types";

function formatCurrentDateLabel(): string {
  return new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function toTimeInput(ts: number): string {
  const date = new Date(ts);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

let entries: Entry[] = loadEntries().sort((a, b) => b.start - a.start);
let preferences: Preferences = loadPreferences();
let timerInterval: ReturnType<typeof setInterval> | null = null;
let timerState: TimerState = "idle";
let sessionStart: number | null = null;
let segmentStart: number | null = null;
let accumulatedSeconds = 0;
let undoEntry: { entry: Entry; index: number } | null = null;
let notifThreshold: number | null = loadNotifThreshold();
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let insightPeriod: InsightPeriod = "week";
let previewEntries: Entry[] = [];
let lastSaveMessage = "Historial recuperado en este navegador";

const filterState: FilterState = {
  period: "all",
  search: "",
  project: "",
  from: "",
  to: "",
};

const timerEl = document.getElementById("timer") as HTMLElement;
const timerStateLabel = document.getElementById("timer-state-label") as HTMLElement;
const statusDot = document.getElementById("status-dot") as HTMLElement;
const noteInput = document.getElementById("note-input") as HTMLInputElement;
const projectInput = document.getElementById("project-input") as HTMLInputElement;
const projectsDatalist = document.getElementById("projects-datalist") as HTMLElement;
const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
const pauseBtn = document.getElementById("pause-btn") as HTMLButtonElement;
const resumeBtn = document.getElementById("resume-btn") as HTMLButtonElement;
const stopBtn = document.getElementById("stop-btn") as HTMLButtonElement;
const recordsList = document.getElementById("records-list") as HTMLElement;
const statToday = document.getElementById("stat-today") as HTMLElement;
const statWeek = document.getElementById("stat-week") as HTMLElement;
const statSessions = document.getElementById("stat-sessions") as HTMLElement;
const statProjects = document.getElementById("stat-projects") as HTMLElement;
const exportBtn = document.getElementById("export-btn") as HTMLButtonElement;
const previewBtn = document.getElementById("preview-btn") as HTMLButtonElement;
const csvModal = document.getElementById("csv-modal") as HTMLElement;
const csvClose = document.getElementById("csv-close") as HTMLButtonElement;
const csvTable = document.getElementById("csv-table") as HTMLElement;
const csvCount = document.getElementById("csv-count") as HTMLElement;
const csvSummary = document.getElementById("csv-summary") as HTMLElement;
const csvDownloadModal = document.getElementById("csv-download-modal") as HTMLButtonElement;
const currentDateEl = document.getElementById("current-date") as HTMLElement;
const importInput = document.getElementById("import-input") as HTMLInputElement;
const toastEl = document.getElementById("toast") as HTMLElement;
const toastMsg = document.getElementById("toast-msg") as HTMLElement;
const toastAction = document.getElementById("toast-action") as HTMLButtonElement;
const settingsBtn = document.getElementById("settings-btn") as HTMLButtonElement;
const settingsPanel = document.getElementById("settings-panel") as HTMLElement;
const dailyGoalInput = document.getElementById("daily-goal-input") as HTMLInputElement;
const weeklyGoalInput = document.getElementById("weekly-goal-input") as HTMLInputElement;
const saveGoalsBtn = document.getElementById("save-goals-btn") as HTMLButtonElement;
const dailyGoalLabel = document.getElementById("daily-goal-label") as HTMLElement;
const weeklyGoalLabel = document.getElementById("weekly-goal-label") as HTMLElement;
const dailyGoalBar = document.getElementById("daily-goal-bar") as HTMLElement;
const weeklyGoalBar = document.getElementById("weekly-goal-bar") as HTMLElement;
const trustCopy = document.getElementById("trust-copy") as HTMLElement;
const trustExtra = document.getElementById("trust-extra") as HTMLElement;
const storageStatus = document.getElementById("storage-status") as HTMLElement;
const lastExportStatus = document.getElementById("last-export-status") as HTMLElement;
const backupNudge = document.getElementById("backup-nudge") as HTMLElement;
const notifStatus = document.getElementById("notif-status") as HTMLElement;
const periodBtns = document.querySelectorAll<HTMLButtonElement>(".period-btn");
const searchInput = document.getElementById("search-input") as HTMLInputElement;
const projectFilter = document.getElementById("project-filter") as HTMLSelectElement;
const fromDateInput = document.getElementById("from-date") as HTMLInputElement;
const toDateInput = document.getElementById("to-date") as HTMLInputElement;
const clearFiltersBtn = document.getElementById("clear-filters-btn") as HTMLButtonElement;
const insightWeekBtn = document.getElementById("insight-week-btn") as HTMLButtonElement;
const insightMonthBtn = document.getElementById("insight-month-btn") as HTMLButtonElement;
const projectInsightsList = document.getElementById("project-insights-list") as HTMLElement;
const projectInsightsEmpty = document.getElementById("project-insights-empty") as HTMLElement;
const reportRange = document.getElementById("report-range") as HTMLElement;
const reportHours = document.getElementById("report-hours") as HTMLElement;
const reportSessions = document.getElementById("report-sessions") as HTMLElement;
const reportProjects = document.getElementById("report-projects") as HTMLElement;
const reportAverage = document.getElementById("report-average") as HTMLElement;
const reportTopProject = document.getElementById("report-top-project") as HTMLElement;
const copyReportBtn = document.getElementById("copy-report-btn") as HTMLButtonElement;
const entryModal = document.getElementById("entry-modal") as HTMLElement;
const entryClose = document.getElementById("entry-close") as HTMLButtonElement;
const entryForm = document.getElementById("entry-form") as HTMLFormElement;
const entryIdInput = document.getElementById("entry-id") as HTMLInputElement;
const entryDateInput = document.getElementById("entry-date-input") as HTMLInputElement;
const entryStartInput = document.getElementById("entry-start-input") as HTMLInputElement;
const entryEndInput = document.getElementById("entry-end-input") as HTMLInputElement;
const entryProjectInput = document.getElementById("entry-project-input") as HTMLInputElement;
const entryNoteInput = document.getElementById("entry-note-input") as HTMLTextAreaElement;
const entrySplitInput = document.getElementById("entry-split-input") as HTMLInputElement;
const entryDuplicateBtn = document.getElementById("entry-duplicate-btn") as HTMLButtonElement;
const entryDeleteBtn = document.getElementById("entry-delete-btn") as HTMLButtonElement;
const entrySplitBtn = document.getElementById("entry-split-btn") as HTMLButtonElement;
const mergeActions = document.getElementById("merge-actions") as HTMLElement;

function getRunningElapsedSeconds(): number {
  if (timerState !== "running" || segmentStart === null) return accumulatedSeconds;
  return accumulatedSeconds + Math.floor((Date.now() - segmentStart) / 1000);
}

function getFilteredEntriesForView(): Entry[] {
  return getFilteredEntries(entries, filterState).sort((a, b) => b.start - a.start);
}

function markSaved(message = "Cambios guardados localmente"): void {
  lastSaveMessage = message;
  storageStatus.textContent = message;
}

function persistEntries(message = "Cambios guardados localmente"): void {
  saveEntries(entries);
  markSaved(message);
}

function persistRunningState(): void {
  saveRunningState({
    sessionStart: sessionStart ?? undefined,
    segmentStart: timerState === "running" ? segmentStart : null,
    accumulatedSeconds,
    note: noteInput.value.trim(),
    project: projectInput.value.trim(),
    timerState,
  });
}

function updateButtonArea(): void {
  startBtn.classList.toggle("hidden", timerState !== "idle");
  pauseBtn.classList.toggle("hidden", timerState !== "running");
  resumeBtn.classList.toggle("hidden", timerState !== "paused");
  stopBtn.classList.toggle("hidden", timerState === "idle");
}

function updateTimerStateLabel(): void {
  if (timerState === "running") timerStateLabel.textContent = "Registrando en tiempo real";
  else if (timerState === "paused") timerStateLabel.textContent = "Sesion en pausa";
  else timerStateLabel.textContent = "Listo para empezar";
}

function updateTimerDisplay(seconds = getRunningElapsedSeconds()): void {
  timerEl.textContent = formatClock(seconds);
}

function setInputLock(locked: boolean): void {
  noteInput.disabled = locked;
  projectInput.disabled = locked;
}

function tickTimer(): void {
  updateTimerDisplay();
  updateStats();
  updateGoalsUI();
  evaluateNotification(entries, notifThreshold, getRunningElapsedSeconds(), sessionStart);
}

function startTimerInterval(): void {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tickTimer, 1000);
}

function stopTimerInterval(): void {
  if (!timerInterval) return;
  clearInterval(timerInterval);
  timerInterval = null;
}

function startTimer(): void {
  sessionStart = Date.now();
  segmentStart = sessionStart;
  accumulatedSeconds = 0;
  setInputLock(true);
  timerState = "running";
  statusDot.classList.remove("paused");
  statusDot.classList.add("running");
  updateButtonArea();
  updateTimerStateLabel();
  persistRunningState();
  updateTimerDisplay(0);
  tickTimer();
  startTimerInterval();
}

function pauseTimer(): void {
  if (timerState !== "running" || segmentStart === null) return;
  stopTimerInterval();
  accumulatedSeconds = getRunningElapsedSeconds();
  segmentStart = null;
  timerState = "paused";
  statusDot.classList.remove("running");
  statusDot.classList.add("paused");
  updateButtonArea();
  updateTimerStateLabel();
  persistRunningState();
  updateTimerDisplay(accumulatedSeconds);
}

function resumeTimerFromPause(): void {
  if (timerState !== "paused") return;
  segmentStart = Date.now();
  timerState = "running";
  statusDot.classList.remove("paused");
  statusDot.classList.add("running");
  updateButtonArea();
  updateTimerStateLabel();
  persistRunningState();
  tickTimer();
  startTimerInterval();
}

function resetTimerForm(): void {
  timerState = "idle";
  accumulatedSeconds = 0;
  sessionStart = null;
  segmentStart = null;
  timerEl.textContent = "00:00:00";
  setInputLock(false);
  noteInput.value = "";
  projectInput.value = "";
  statusDot.classList.remove("running", "paused");
  updateButtonArea();
  updateTimerStateLabel();
}

function refreshAllViews(): void {
  updateStats();
  updateProjectDatalist();
  updateProjectFilterOptions();
  updateGoalsUI();
  updateStorageSignals();
  renderProjectInsights();
  renderList();
  updateReportCard();
  updateNotifUI();
}

function stopTimer(): void {
  if (timerState === "idle" || sessionStart === null) return;

  const totalDuration = getRunningElapsedSeconds();
  const endTs = timerState === "running" ? Date.now() : sessionStart + totalDuration * 1000;
  stopTimerInterval();
  clearRunningState();

  if (totalDuration >= 1) {
    const entry: Entry = {
      id: Date.now(),
      start: sessionStart,
      end: endTs,
      duration: totalDuration,
      notes: noteInput.value.trim(),
      date: getDateKeyFromTimestamp(sessionStart),
      project: projectInput.value.trim() || undefined,
    };
    entries.unshift(entry);
    entries.sort((a, b) => b.start - a.start);
    persistEntries("Sesion guardada localmente");
  }

  resetTimerForm();
  refreshAllViews();
  evaluateNotification(entries, notifThreshold);
}

function restoreTimer(saved: RunningState): void {
  const restoredSessionStart = saved.sessionStart ?? saved.start;
  if (!restoredSessionStart) return;

  sessionStart = restoredSessionStart;
  accumulatedSeconds = saved.accumulatedSeconds ?? 0;
  noteInput.value = saved.note ?? "";
  projectInput.value = saved.project ?? "";
  setInputLock(true);

  if ((saved.timerState ?? "running") === "paused") {
    timerState = "paused";
    updateTimerDisplay(accumulatedSeconds);
    statusDot.classList.add("paused");
    updateButtonArea();
    updateTimerStateLabel();
    return;
  }

  segmentStart = saved.segmentStart ?? restoredSessionStart;
  timerState = "running";
  statusDot.classList.add("running");
  updateButtonArea();
  updateTimerStateLabel();
  tickTimer();
  startTimerInterval();
}

function showToast(message: string, action?: { label: string; cb: () => void }): void {
  toastMsg.textContent = message;

  if (action) {
    toastAction.textContent = action.label;
    toastAction.classList.remove("hidden");
    toastAction.onclick = () => {
      if (toastTimer) clearTimeout(toastTimer);
      toastEl.classList.add("hidden");
      action.cb();
    };
  } else {
    toastAction.classList.add("hidden");
    toastAction.onclick = null;
  }

  toastEl.classList.remove("hidden");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.add("hidden");
    undoEntry = null;
  }, 4200);
}

function buildProjectOptions(selectedProject: string): string {
  const options = getAvailableProjects(entries)
    .map((project) => {
      const selected = project === selectedProject ? " selected" : "";
      return `<option value="${esc(project)}"${selected}>${esc(project)}</option>`;
    })
    .join("");

  return `<option value="">Todos</option>${options}`;
}

function updateProjectDatalist(): void {
  projectsDatalist.innerHTML = getAvailableProjects(entries)
    .filter((project) => project !== "Sin proyecto")
    .map((project) => `<option value="${esc(project)}"></option>`)
    .join("");
}

function updateProjectFilterOptions(): void {
  projectFilter.innerHTML = buildProjectOptions(filterState.project);
}

function updateStats(): void {
  const runningSeconds = getRunningElapsedSeconds();
  const today = getToday();
  const todayTotal =
    getTodayTotalSeconds(entries, today) +
    (sessionStart !== null && getDateKeyFromTimestamp(sessionStart) === today ? runningSeconds : 0);
  const weekStart = getStartOfCurrentWeek();
  const weekTotal =
    entries.filter((entry) => entry.start >= weekStart).reduce((sum, entry) => sum + entry.duration, 0) +
    (sessionStart !== null && sessionStart >= weekStart ? runningSeconds : 0);
  const activeProjects = new Set(
    entries.map((entry) => (entry.project?.trim().length ? entry.project.trim() : "Sin proyecto"))
  ).size;

  statToday.textContent = formatTotalTime(todayTotal);
  statWeek.textContent = formatTotalTime(weekTotal);
  statSessions.textContent = String(entries.length);
  statProjects.textContent = String(activeProjects);
}

function updateGoalsUI(): void {
  const runningSeconds = getRunningElapsedSeconds();
  const today = getToday();
  const todaySeconds =
    getTodayTotalSeconds(entries, today) +
    (sessionStart !== null && getDateKeyFromTimestamp(sessionStart) === today ? runningSeconds : 0);
  const weekSeconds =
    entries.filter((entry) => entry.start >= getStartOfCurrentWeek()).reduce((sum, entry) => sum + entry.duration, 0) +
    (sessionStart !== null && sessionStart >= getStartOfCurrentWeek() ? runningSeconds : 0);

  const dailyGoalSeconds = preferences.dailyGoalHours * 3600;
  const weeklyGoalSeconds = preferences.weeklyGoalHours * 3600;
  const dailyProgress = dailyGoalSeconds > 0 ? Math.min(100, (todaySeconds / dailyGoalSeconds) * 100) : 0;
  const weeklyProgress = weeklyGoalSeconds > 0 ? Math.min(100, (weekSeconds / weeklyGoalSeconds) * 100) : 0;

  dailyGoalLabel.textContent = `${formatHoursCompact(todaySeconds)} / ${preferences.dailyGoalHours}h`;
  weeklyGoalLabel.textContent = `${formatHoursCompact(weekSeconds)} / ${preferences.weeklyGoalHours}h`;
  dailyGoalBar.style.width = `${dailyProgress}%`;
  weeklyGoalBar.style.width = `${weeklyProgress}%`;
}

function updateStorageSignals(): void {
  const filteredEntries = getFilteredEntriesForView();
  const daysSinceExport = preferences.lastExportAt
    ? Math.floor((Date.now() - preferences.lastExportAt) / (1000 * 60 * 60 * 24))
    : null;

  storageStatus.textContent = lastSaveMessage;
  trustCopy.textContent = `${entries.length} sesiones guardadas solo en este navegador.`;
  trustExtra.textContent =
    filteredEntries.length === entries.length
      ? "Todo lo que ves se guarda al instante en localStorage."
      : `El filtro actual deja ${filteredEntries.length} sesiones visibles.`;
  lastExportStatus.textContent = describeLastExport(preferences.lastExportAt);

  if (entries.length > 0 && (preferences.lastExportAt === null || (daysSinceExport !== null && daysSinceExport >= 7))) {
    backupNudge.textContent = "Conviene exportar una copia esta semana para no depender solo del navegador.";
    backupNudge.classList.remove("hidden");
  } else {
    backupNudge.classList.add("hidden");
  }
}

function renderProjectInsights(): void {
  insightWeekBtn.classList.toggle("active", insightPeriod === "week");
  insightMonthBtn.classList.toggle("active", insightPeriod === "month");

  const summaries = getProjectSummaries(entries, insightPeriod, 5).filter(
    (summary) => summary.totalSeconds > 0
  );

  projectInsightsEmpty.classList.toggle("hidden", summaries.length > 0);
  projectInsightsList.innerHTML = summaries
    .map(
      (summary) => `
        <article class="insight-item">
          <div class="insight-top">
            <strong class="insight-name">${esc(summary.project)}</strong>
            <span class="insight-bar-label">${formatHoursCompact(summary.totalSeconds)}</span>
          </div>
          <div class="insight-track">
            <div class="insight-fill" style="width:${Math.max(summary.share * 100, 6)}%"></div>
          </div>
          <div class="insight-bottom">
            <span>${summary.sessions} sesion${summary.sessions === 1 ? "" : "es"}</span>
            <span>${Math.round(summary.share * 100)}% del total</span>
          </div>
        </article>`
    )
    .join("");
}

function updateReportCard(): void {
  const filteredEntries = getFilteredEntriesForView();
  const summary = getReportSummary(filteredEntries, getFilterLabel(filterState));

  reportRange.textContent = summary.rangeLabel;
  reportHours.textContent = formatHoursCompact(summary.totalSeconds);
  reportSessions.textContent = String(summary.totalSessions);
  reportProjects.textContent = String(summary.projectCount);
  reportAverage.textContent = formatHoursCompact(summary.averageSeconds);
  reportTopProject.textContent = summary.topProject
    ? `${summary.topProject.project} / ${formatHoursCompact(summary.topProject.totalSeconds)}`
    : "Sin datos todavia";
}

function renderList(): void {
  const filtered = getFilteredEntriesForView();

  if (filtered.length === 0) {
    const hasAny = entries.length > 0;
    recordsList.innerHTML = `
      <li class="record-empty">
        <p class="record-empty-icon" aria-hidden="true">${hasAny ? "🔍" : "⏱"}</p>
        <p class="record-empty-title">${hasAny ? "Sin resultados" : "Sin sesiones todavia"}</p>
        <p class="tiny-copy">${hasAny ? "Prueba con otro rango, proyecto o texto." : "Inicia el temporizador para registrar tu primera sesion."}</p>
      </li>`;
    return;
  }

  recordsList.innerHTML = filtered
    .map((entry, index) => {
      const projectName = entry.project?.trim().length ? entry.project.trim() : "Sin proyecto";
      const noteMarkup = entry.notes
        ? `<p class="record-note">${esc(entry.notes)}</p>`
        : `<p class="record-note muted">Sin nota</p>`;

      return `
        <li class="record-card" data-id="${entry.id}" style="--i:${index}">
          <div class="record-main">
            <div class="record-copy">
              ${noteMarkup}
              <div class="record-meta">
                <span class="record-badge">${esc(projectName)}</span>
                <span>${esc(entry.date)}</span>
                <span>${esc(formatLocalTime(entry.start))} - ${esc(formatLocalTime(entry.end))}</span>
              </div>
            </div>
            <div class="record-duration">${formatDuration(entry.duration)}</div>
          </div>
          <div class="record-actions">
            <button class="record-action" type="button" data-action="edit" data-id="${entry.id}">Gestionar</button>
            <button class="record-action" type="button" data-action="duplicate" data-id="${entry.id}">Duplicar</button>
            <button class="record-action" type="button" data-action="delete" data-id="${entry.id}">Eliminar</button>
          </div>
        </li>`;
    })
    .join("");
}

function updateNotifUI(): void {
  document.querySelectorAll<HTMLButtonElement>(".notif-opt").forEach((button) => {
    const buttonHours = button.dataset.hours === "" ? null : Number(button.dataset.hours);
    button.classList.toggle("active", buttonHours === notifThreshold);
  });

  if (!("Notification" in window)) {
    notifStatus.textContent = "No disponible en este navegador";
  } else if (Notification.permission === "denied") {
    notifStatus.textContent = "Las notificaciones estan bloqueadas en el navegador";
  } else if (notifThreshold) {
    notifStatus.textContent = `Aviso activo al alcanzar ${notifThreshold}h en el dia`;
  } else {
    notifStatus.textContent = "Avisos desactivados";
  }
}

function getEntryById(id: number): Entry | undefined {
  return entries.find((entry) => entry.id === id);
}

function deleteEntry(id: number): void {
  const index = entries.findIndex((entry) => entry.id === id);
  if (index === -1) return;

  const [removed] = entries.splice(index, 1);
  undoEntry = { entry: removed, index };
  persistEntries("Registro eliminado");
  closeEntryEditor();
  refreshAllViews();

  showToast("Registro eliminado", {
    label: "Deshacer",
    cb: () => {
      if (!undoEntry) return;
      entries.splice(undoEntry.index, 0, undoEntry.entry);
      entries.sort((a, b) => b.start - a.start);
      persistEntries("Eliminacion deshecha");
      undoEntry = null;
      refreshAllViews();
    },
  });
}

function duplicateEntry(id: number): void {
  const original = getEntryById(id);
  if (!original) return;

  const clone: Entry = {
    ...original,
    id: Date.now(),
  };

  entries.unshift(clone);
  entries.sort((a, b) => b.start - a.start);
  persistEntries("Sesion duplicada");
  closeEntryEditor();
  refreshAllViews();
  showToast("Sesion duplicada");
}

function getSplitDefaultValue(entry: Entry): string {
  const midPoint = entry.start + Math.floor((entry.end - entry.start) / 2);
  return toTimeInput(midPoint);
}

function renderMergeActionButtons(id: number): void {
  const candidates = findMergeCandidates(id, entries);

  if (candidates.length === 0) {
    mergeActions.innerHTML = `<span class="tiny-copy">No hay sesiones cercanas de este dia para fusionar.</span>`;
    return;
  }

  mergeActions.innerHTML = candidates
    .map(
      (candidate) => `
        <button class="chip-btn merge-btn" type="button" data-merge-id="${candidate.id}">
          ${candidate.position === "before" ? "Con anterior" : "Con siguiente"} / ${esc(candidate.label)}
        </button>`
    )
    .join("");
}

function openEntryEditor(id: number): void {
  const entry = getEntryById(id);
  if (!entry) return;

  entryIdInput.value = String(id);
  entryDateInput.value = formatDateInput(entry.start);
  entryStartInput.value = toTimeInput(entry.start);
  entryEndInput.value = toTimeInput(entry.end);
  entryProjectInput.value = entry.project ?? "";
  entryNoteInput.value = entry.notes;
  entrySplitInput.value = getSplitDefaultValue(entry);
  renderMergeActionButtons(id);
  entryModal.classList.remove("hidden");
}

function closeEntryEditor(): void {
  entryModal.classList.add("hidden");
}

function buildEditedTimestamps(dateKey: string, startTime: string, endTime: string): {
  start: number;
  end: number;
  duration: number;
  date: string;
} | null {
  const start = buildLocalTimestamp(dateKey, `${startTime}:00`);
  const rawEnd = buildLocalTimestamp(dateKey, `${endTime}:00`);
  if (start === null || rawEnd === null) return null;

  const end = adjustEndTimestamp(start, rawEnd);
  const duration = Math.floor((end - start) / 1000);
  if (duration < 1) return null;

  return {
    start,
    end,
    duration,
    date: getDateKeyFromTimestamp(start),
  };
}

function saveEntryFromModal(): void {
  const id = Number(entryIdInput.value);
  const entry = getEntryById(id);
  if (!entry) return;

  const timestamps = buildEditedTimestamps(entryDateInput.value, entryStartInput.value, entryEndInput.value);
  if (!timestamps) {
    showToast("Revisa fecha y horas antes de guardar");
    return;
  }

  entry.start = timestamps.start;
  entry.end = timestamps.end;
  entry.duration = timestamps.duration;
  entry.date = timestamps.date;
  entry.project = entryProjectInput.value.trim() || undefined;
  entry.notes = entryNoteInput.value.trim();

  entries.sort((a, b) => b.start - a.start);
  persistEntries("Registro actualizado");
  closeEntryEditor();
  refreshAllViews();
  showToast("Registro actualizado");
}

function splitEntry(): void {
  const id = Number(entryIdInput.value);
  const entry = getEntryById(id);
  if (!entry) return;

  const splitTime = entrySplitInput.value;
  if (!splitTime) {
    showToast("Elige una hora para partir la sesion");
    return;
  }

  let splitTs = buildLocalTimestamp(entryDateInput.value, `${splitTime}:00`);
  if (splitTs === null) {
    showToast("Hora de corte no valida");
    return;
  }

  if (splitTs <= entry.start) splitTs += 24 * 60 * 60 * 1000;
  if (splitTs <= entry.start || splitTs >= entry.end) {
    showToast("La hora de corte debe caer dentro de la sesion");
    return;
  }

  const secondEntry: Entry = {
    ...entry,
    id: Date.now(),
    start: splitTs,
    end: entry.end,
    duration: Math.floor((entry.end - splitTs) / 1000),
    date: getDateKeyFromTimestamp(splitTs),
  };

  entry.end = splitTs;
  entry.duration = Math.floor((splitTs - entry.start) / 1000);
  entries.push(secondEntry);
  entries.sort((a, b) => b.start - a.start);
  persistEntries("Sesion partida");
  closeEntryEditor();
  refreshAllViews();
  showToast("Sesion partida en dos registros");
}

function mergeNotes(first: string, second: string): string {
  const parts = [first.trim(), second.trim()].filter(Boolean);
  return Array.from(new Set(parts)).join(" / ");
}

function mergeProjects(first?: string, second?: string): string | undefined {
  const parts = [first?.trim(), second?.trim()].filter((value): value is string => Boolean(value));
  const unique = Array.from(new Set(parts));
  return unique.length > 0 ? unique.join(" + ") : undefined;
}

function mergeWithEntry(mergeId: number): void {
  const id = Number(entryIdInput.value);
  const current = getEntryById(id);
  const other = getEntryById(mergeId);
  if (!current || !other) return;

  const mergedStart = Math.min(current.start, other.start);
  const mergedEnd = Math.max(current.end, other.end);
  const merged: Entry = {
    id: Date.now(),
    start: mergedStart,
    end: mergedEnd,
    duration: Math.floor((mergedEnd - mergedStart) / 1000),
    date: getDateKeyFromTimestamp(mergedStart),
    notes: mergeNotes(current.notes, other.notes),
    project: mergeProjects(current.project, other.project),
  };

  entries = entries.filter((entry) => entry.id !== current.id && entry.id !== other.id);
  entries.unshift(merged);
  entries.sort((a, b) => b.start - a.start);
  persistEntries("Sesiones fusionadas");
  closeEntryEditor();
  refreshAllViews();
  showToast("Sesiones fusionadas");
}

function openCsvPreview(): void {
  previewEntries = getFilteredEntriesForView();
  if (previewEntries.length === 0) {
    showToast("No hay datos para exportar con el filtro actual");
    return;
  }

  const summary = getReportSummary(previewEntries, getFilterLabel(filterState));
  const headers = ["Fecha", "Inicio", "Fin", "Duracion", "Proyecto", "Nota"];
  const thead = `<thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>`;
  const tbody =
    "<tbody>" +
    previewEntries
      .map(
        (entry) => `
          <tr>
            <td>${esc(entry.date)}</td>
            <td>${esc(formatLocalTimeSec(entry.start))}</td>
            <td>${esc(formatLocalTimeSec(entry.end))}</td>
            <td>${esc(formatDuration(entry.duration))}</td>
            <td>${esc(entry.project ?? "Sin proyecto")}</td>
            <td>${esc(entry.notes || "-")}</td>
          </tr>`
      )
      .join("") +
    "</tbody>";

  csvTable.innerHTML = thead + tbody;
  csvCount.textContent = `${previewEntries.length} registro${previewEntries.length === 1 ? "" : "s"}`;
  csvSummary.textContent = buildClipboardReport(summary).replace(/\n/g, " / ");
  csvModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeCsvPreview(): void {
  csvModal.classList.add("hidden");
  document.body.style.overflow = "";
  previewEntries = [];
}

function downloadCsv(): void {
  const exportEntries = previewEntries.length > 0 ? previewEntries : getFilteredEntriesForView();
  if (exportEntries.length === 0) {
    showToast("No hay datos para exportar");
    return;
  }

  const csv = buildCsv(exportEntries);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `timelog_${getToday()}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);

  preferences = { ...preferences, lastExportAt: Date.now() };
  savePreferences(preferences);
  markSaved("Copia exportada");
  updateStorageSignals();
  showToast("CSV exportado");
}

async function copyReportToClipboard(): Promise<void> {
  const summary = getReportSummary(getFilteredEntriesForView(), getFilterLabel(filterState));
  const payload = buildClipboardReport(summary);

  if (!navigator.clipboard) {
    showToast("El navegador no permite copiar al portapapeles");
    return;
  }

  await navigator.clipboard.writeText(payload);
  showToast("Resumen copiado");
}

async function importCsvFile(): Promise<void> {
  const file = importInput.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const { importedEntries, skipped } = parseCsvEntries(text, entries);

    if (importedEntries.length > 0) {
      entries = [...entries, ...importedEntries].sort((a, b) => b.start - a.start);
      persistEntries("Historial importado");
      refreshAllViews();
    }

    importInput.value = "";
    const importedLabel =
      importedEntries.length > 0
        ? `${importedEntries.length} registro${importedEntries.length === 1 ? "" : "s"} importado${importedEntries.length === 1 ? "" : "s"}`
        : "No hay registros nuevos";
    showToast(skipped > 0 ? `${importedLabel}. ${skipped} omitido${skipped === 1 ? "" : "s"}.` : importedLabel);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    if (reason === "empty") showToast("El archivo no tiene datos");
    else if (reason === "format") showToast("Formato CSV no reconocido");
    else showToast("Error al leer el archivo");
  }
}

function syncFilterInputs(): void {
  periodBtns.forEach((button) => {
    button.classList.toggle("active", button.dataset.period === filterState.period);
  });
  searchInput.value = filterState.search;
  projectFilter.value = filterState.project;
  fromDateInput.value = filterState.from;
  toDateInput.value = filterState.to;
}

function applyFilterUpdate(partial: Partial<FilterState>): void {
  Object.assign(filterState, partial);
  syncFilterInputs();
  renderList();
  updateReportCard();
  updateStorageSignals();
}

function clearFilters(): void {
  filterState.period = "all";
  filterState.search = "";
  filterState.project = "";
  filterState.from = "";
  filterState.to = "";
  syncFilterInputs();
  renderList();
  updateReportCard();
  updateStorageSignals();
}

function toggleSettingsPanel(): void {
  const hidden = settingsPanel.classList.contains("hidden");
  settingsPanel.classList.toggle("hidden");
  settingsBtn.setAttribute("aria-expanded", String(hidden));
}

currentDateEl.textContent = formatCurrentDateLabel();
dailyGoalInput.value = String(preferences.dailyGoalHours);
weeklyGoalInput.value = String(preferences.weeklyGoalHours);
updateButtonArea();
updateTimerStateLabel();
updateTimerDisplay(0);
syncFilterInputs();
refreshAllViews();

const savedRunning = loadRunningState();
if (savedRunning) restoreTimer(savedRunning);

evaluateNotification(entries, notifThreshold, getRunningElapsedSeconds(), sessionStart);

startBtn.addEventListener("click", startTimer);
pauseBtn.addEventListener("click", pauseTimer);
resumeBtn.addEventListener("click", resumeTimerFromPause);
stopBtn.addEventListener("click", stopTimer);
exportBtn.addEventListener("click", () => {
  previewEntries = [];
  downloadCsv();
});
previewBtn.addEventListener("click", openCsvPreview);
csvClose.addEventListener("click", closeCsvPreview);
csvDownloadModal.addEventListener("click", downloadCsv);
copyReportBtn.addEventListener("click", () => {
  void copyReportToClipboard().catch(() => {
    showToast("No se pudo copiar el resumen");
  });
});
importInput.addEventListener("change", () => {
  void importCsvFile();
});

settingsBtn.addEventListener("click", toggleSettingsPanel);
saveGoalsBtn.addEventListener("click", () => {
  const daily = Number(dailyGoalInput.value);
  const weekly = Number(weeklyGoalInput.value);
  if (!Number.isFinite(daily) || daily <= 0 || !Number.isFinite(weekly) || weekly <= 0) {
    showToast("Las metas deben ser numeros mayores que cero");
    return;
  }

  preferences = {
    ...preferences,
    dailyGoalHours: Math.round(daily * 10) / 10,
    weeklyGoalHours: Math.round(weekly),
  };
  savePreferences(preferences);
  markSaved("Metas actualizadas");
  updateGoalsUI();
  updateStorageSignals();
  showToast("Metas actualizadas");
});

document.querySelectorAll<HTMLButtonElement>(".notif-opt").forEach((button) => {
  button.addEventListener("click", async () => {
    const hours = button.dataset.hours === "" ? null : Number(button.dataset.hours);
    if (hours !== null) {
      const granted = await requestNotifPermission();
      if (!granted) {
        notifStatus.textContent = "Permiso denegado";
        return;
      }
    }

    notifThreshold = hours;
    saveNotifThreshold(notifThreshold);
    updateNotifUI();
    evaluateNotification(entries, notifThreshold, getRunningElapsedSeconds(), sessionStart);
    showToast(hours ? `Aviso configurado a ${hours}h` : "Avisos desactivados");
  });
});

insightWeekBtn.addEventListener("click", () => {
  insightPeriod = "week";
  renderProjectInsights();
});

insightMonthBtn.addEventListener("click", () => {
  insightPeriod = "month";
  renderProjectInsights();
});

periodBtns.forEach((button) => {
  button.addEventListener("click", () => {
    applyFilterUpdate({ period: button.dataset.period as FilterState["period"] });
  });
});

searchInput.addEventListener("input", () => {
  applyFilterUpdate({ search: searchInput.value });
});

projectFilter.addEventListener("change", () => {
  applyFilterUpdate({ project: projectFilter.value });
});

fromDateInput.addEventListener("change", () => {
  applyFilterUpdate({ from: fromDateInput.value, period: "custom" });
});

toDateInput.addEventListener("change", () => {
  applyFilterUpdate({ to: toDateInput.value, period: "custom" });
});

clearFiltersBtn.addEventListener("click", clearFilters);

recordsList.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLButtonElement>("[data-action]");
  if (!button) return;

  const id = Number(button.dataset.id);
  const action = button.dataset.action;

  if (action === "edit") openEntryEditor(id);
  if (action === "duplicate") duplicateEntry(id);
  if (action === "delete") deleteEntry(id);
});

entryClose.addEventListener("click", closeEntryEditor);
entryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveEntryFromModal();
});
entryDuplicateBtn.addEventListener("click", () => {
  duplicateEntry(Number(entryIdInput.value));
});
entryDeleteBtn.addEventListener("click", () => {
  deleteEntry(Number(entryIdInput.value));
});
entrySplitBtn.addEventListener("click", splitEntry);
mergeActions.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLButtonElement>("[data-merge-id]");
  if (!button) return;
  mergeWithEntry(Number(button.dataset.mergeId));
});

document.querySelectorAll<HTMLElement>("[data-close-entry]").forEach((element) => {
  element.addEventListener("click", closeEntryEditor);
});
document.querySelectorAll<HTMLElement>("[data-close-preview]").forEach((element) => {
  element.addEventListener("click", closeCsvPreview);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!entryModal.classList.contains("hidden")) {
      closeEntryEditor();
      return;
    }

    if (!csvModal.classList.contains("hidden")) {
      closeCsvPreview();
      return;
    }
  }

  if (event.code === "Space" && document.activeElement !== noteInput && document.activeElement !== projectInput) {
    event.preventDefault();
    if (timerState === "idle") startTimer();
    else if (timerState === "running") pauseTimer();
    else if (timerState === "paused") resumeTimerFromPause();
  }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && timerState === "running") {
    tickTimer();
  }
});

// Topbar scroll border
const topbar = document.querySelector(".topbar") as HTMLElement | null;
if (topbar) {
  window.addEventListener("scroll", () => {
    topbar.classList.toggle("scrolled", window.scrollY > 8);
  }, { passive: true });
}
