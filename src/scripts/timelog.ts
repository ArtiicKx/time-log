import {
  esc,
  formatClock,
  formatDuration,
  formatLocalTime,
  formatLocalTimeSec,
  formatTotalTime,
  getCurrentDateLabel,
  getStartOfCurrentWeek,
  getToday,
  getTodayTotalSeconds,
  isEntryInCurrentWeek,
} from "./timelog/date";
import { buildCsv, parseCsvEntries } from "./timelog/csv";
import { evaluateNotification, requestNotifPermission } from "./timelog/notifications";
import {
  clearRunningState,
  loadEntries,
  loadNotifThreshold,
  loadRunningState,
  saveEntries,
  saveNotifThreshold,
  saveRunningState,
} from "./timelog/storage";
import type { Entry, RunningState, TimerState } from "./timelog/types";

let entries: Entry[] = loadEntries();
let timerInterval: ReturnType<typeof setInterval> | null = null;
let timerState: TimerState = "idle";
let sessionStart: number | null = null;
let segmentStart: number | null = null;
let accumulatedSeconds = 0;
let activeFilter: "all" | "today" | "week" = "all";
let pendingDeleteId: number | null = null;
let notifThreshold: number | null = loadNotifThreshold();
let toastTimer: ReturnType<typeof setTimeout> | null = null;

const timerEl = document.getElementById("timer") as HTMLElement;
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
const exportBtn = document.getElementById("export-btn") as HTMLButtonElement;
const previewBtn = document.getElementById("preview-btn") as HTMLButtonElement;
const csvModal = document.getElementById("csv-modal") as HTMLElement;
const csvBackdrop = document.getElementById("csv-backdrop") as HTMLElement;
const csvClose = document.getElementById("csv-close") as HTMLButtonElement;
const csvTable = document.getElementById("csv-table") as HTMLElement;
const csvCount = document.getElementById("csv-count") as HTMLElement;
const csvDownloadModal = document.getElementById("csv-download-modal") as HTMLButtonElement;
const filterBtns = document.querySelectorAll<HTMLButtonElement>(".filter-btn");
const currentDateEl = document.getElementById("current-date") as HTMLElement;
const importInput = document.getElementById("import-input") as HTMLInputElement;
const notifBtn = document.getElementById("notif-btn") as HTMLButtonElement;
const notifPanel = document.getElementById("notif-panel") as HTMLElement;
const notifStatus = document.getElementById("notif-status") as HTMLElement;
const toastEl = document.getElementById("toast") as HTMLElement;

function getRunningElapsedSeconds(): number {
  if (timerState !== "running" || segmentStart === null) return accumulatedSeconds;
  return accumulatedSeconds + Math.floor((Date.now() - segmentStart) / 1000);
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

function showToast(message: string): void {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 2800);
}

function updateButtonArea(): void {
  startBtn.classList.toggle("hidden", timerState !== "idle");
  pauseBtn.classList.toggle("hidden", timerState !== "running");
  resumeBtn.classList.toggle("hidden", timerState !== "paused");
  stopBtn.classList.toggle("hidden", timerState === "idle");
}

function updateTimerDisplay(seconds = getRunningElapsedSeconds()): void {
  timerEl.textContent = formatClock(seconds);
}

function tickTimer(): void {
  updateTimerDisplay();
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
  noteInput.disabled = true;
  projectInput.disabled = true;
  timerState = "running";
  statusDot.classList.remove("paused");
  statusDot.classList.add("running");
  updateButtonArea();
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
  noteInput.disabled = false;
  noteInput.value = "";
  projectInput.disabled = false;
  projectInput.value = "";
  statusDot.classList.remove("running", "paused");
  updateButtonArea();
}

function stopTimer(): void {
  if (timerState === "idle" || sessionStart === null) return;

  const totalDuration = getRunningElapsedSeconds();
  const endTs = timerState === "running" ? Date.now() : sessionStart + totalDuration * 1000;
  stopTimerInterval();
  clearRunningState();

  if (totalDuration >= 1) {
    const entry: Entry = {
      id: sessionStart,
      start: sessionStart,
      end: endTs,
      duration: totalDuration,
      notes: noteInput.value.trim(),
      date: getToday(),
      project: projectInput.value.trim() || undefined,
    };
    entries.unshift(entry);
    saveEntries(entries);
  }

  resetTimerForm();
  updateStats();
  renderList();
  updateProjectDatalist();
  evaluateNotification(entries, notifThreshold);
}

function restoreTimer(saved: RunningState): void {
  const restoredSessionStart = saved.sessionStart ?? saved.start;
  if (!restoredSessionStart) return;

  sessionStart = restoredSessionStart;
  accumulatedSeconds = saved.accumulatedSeconds ?? 0;
  noteInput.value = saved.note ?? "";
  projectInput.value = saved.project ?? "";
  noteInput.disabled = true;
  projectInput.disabled = true;

  if ((saved.timerState ?? "running") === "paused") {
    timerState = "paused";
    updateTimerDisplay(accumulatedSeconds);
    statusDot.classList.add("paused");
    updateButtonArea();
    return;
  }

  segmentStart = saved.segmentStart ?? restoredSessionStart;
  timerState = "running";
  statusDot.classList.add("running");
  updateButtonArea();
  tickTimer();
  startTimerInterval();
}

function getProjects(): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of entries) {
    if (entry.project && !seen.has(entry.project)) {
      seen.add(entry.project);
      result.push(entry.project);
    }
  }

  return result;
}

function updateProjectDatalist(): void {
  projectsDatalist.innerHTML = getProjects()
    .map((project) => `<option value="${esc(project)}"></option>`)
    .join("");
}

function updateStats(): void {
  const today = getToday();
  const startOfWeek = getStartOfCurrentWeek();
  let weekTotal = 0;

  for (const entry of entries) {
    if (entry.start >= startOfWeek) weekTotal += entry.duration;
  }

  statToday.textContent = formatTotalTime(getTodayTotalSeconds(entries, today));
  statWeek.textContent = formatTotalTime(weekTotal);
  statSessions.textContent = String(entries.length);
}

function deleteEntry(id: number): void {
  entries = entries.filter((entry) => entry.id !== id);
  pendingDeleteId = null;
  saveEntries(entries);
  updateStats();
  renderList();
}

function startNoteEdit(id: number, noteEl: HTMLElement): void {
  const entry = entries.find((item) => item.id === id);
  if (!entry) return;

  const input = document.createElement("input");
  input.type = "text";
  input.value = entry.notes;
  input.maxLength = 200;
  input.className =
    "bg-transparent text-txt text-[0.88rem] font-medium w-full focus:outline-none border-b border-accent/60 pb-px min-w-0";

  noteEl.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;

  function commit(): void {
    if (committed) return;
    committed = true;
    if (!entry) return;
    entry.notes = input.value.trim();
    saveEntries(entries);
    renderList();
  }

  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
    if (event.key === "Escape") {
      committed = true;
      renderList();
    }
  });
}

function getFilteredEntries(): Entry[] {
  const today = getToday();
  if (activeFilter === "today") return entries.filter((entry) => entry.date === today);
  if (activeFilter === "week") return entries.filter((entry) => isEntryInCurrentWeek(entry));
  return entries;
}

function renderList(): void {
  const filtered = getFilteredEntries();

  if (filtered.length === 0) {
    recordsList.innerHTML = `
      <li class="flex flex-col items-center justify-center py-14 text-dim text-sm border border-dashed border-line rounded-2xl gap-2">
        <span class="text-3xl opacity-20">⌱</span>
        <span>Sin registros${activeFilter !== "all" ? " en este periodo" : ""}</span>
      </li>`;
    return;
  }

  recordsList.innerHTML = filtered
    .map((entry) => {
      const hasNote = entry.notes.length > 0;
      const noteText = hasNote ? esc(entry.notes) : "- sin nota -";
      const noteClass = hasNote
        ? "text-[0.88rem] font-medium text-txt leading-snug truncate cursor-text hover:text-accent/80 transition-colors duration-100"
        : "text-[0.88rem] italic text-dim/60 leading-snug truncate cursor-text";

      const projectBadge = entry.project
        ? `<span class="text-[0.62rem] font-medium px-1.5 py-0.5 rounded bg-accent/10 text-accent/80 border border-accent/15 truncate max-w-[90px] shrink-0">${esc(entry.project)}</span>`
        : "";

      const isConfirming = pendingDeleteId === entry.id;
      const deleteArea = isConfirming
        ? `<span class="text-[0.7rem] text-dim whitespace-nowrap">Eliminar?</span>
           <button class="confirm-delete-btn w-7 h-7 flex items-center justify-center rounded-lg text-accent hover:bg-accent/10 border border-accent/25 transition-all duration-150 text-xs" data-id="${entry.id}" title="Confirmar">OK</button>
           <button class="cancel-delete-btn w-7 h-7 flex items-center justify-center rounded-lg text-dim hover:text-txt hover:bg-hi border border-line transition-all duration-150 text-xs" title="Cancelar">X</button>`
        : `<button class="delete-btn opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg text-dim hover:text-danger hover:bg-danger/[0.08] border border-transparent hover:border-danger/25 transition-all duration-150 text-[0.65rem]" data-id="${entry.id}" title="Eliminar sesion">X</button>`;

      return `
      <li
        class="group relative flex items-stretch rounded-xl bg-surface border border-line overflow-hidden transition-colors duration-150 hover:border-line-hi${isConfirming ? " border-danger/30" : ""}"
        data-id="${entry.id}"
      >
        <div class="w-[3px] shrink-0 bg-line group-hover:bg-accent/50 transition-colors duration-200"></div>
        <div class="flex flex-1 items-center gap-3 pl-4 pr-3 py-3.5 min-w-0">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 min-w-0">
              <p class="${noteClass}" data-editable-note title="Clic para editar">${noteText}</p>
              ${projectBadge}
            </div>
            <div class="flex items-center gap-1 mt-1 font-mono text-[0.7rem] text-dim/70">
              <span>${formatLocalTime(entry.start)}</span>
              <span class="opacity-40 mx-0.5">-&gt;</span>
              <span>${formatLocalTime(entry.end)}</span>
              <span class="opacity-25 mx-1.5">.</span>
              <span>${entry.date}</span>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="font-mono text-[0.78rem] font-bold text-accent bg-accent/[0.07] border border-accent/20 px-2.5 py-1 rounded-lg tabular-nums">
              ${formatDuration(entry.duration)}
            </span>
            ${deleteArea}
          </div>
        </div>
      </li>`;
    })
    .join("");
}

function downloadCsv(): void {
  if (entries.length === 0) return;
  const csv = buildCsv(entries);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `timelog_${getToday()}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function importCsvFile(): Promise<void> {
  const file = importInput.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const { importedEntries } = parseCsvEntries(text, entries);

    if (importedEntries.length > 0) {
      entries = [...entries, ...importedEntries].sort((a, b) => b.start - a.start);
      saveEntries(entries);
      updateStats();
      renderList();
      updateProjectDatalist();
    }

    importInput.value = "";
    showToast(
      importedEntries.length > 0
        ? `${importedEntries.length} registro${importedEntries.length === 1 ? "" : "s"} importado${importedEntries.length === 1 ? "" : "s"}`
        : "No hay registros nuevos"
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    if (reason === "empty") showToast("El archivo no tiene datos");
    else if (reason === "format") showToast("Formato CSV no reconocido");
    else showToast("Error al leer el archivo");
  }
}

function openCsvPreview(): void {
  if (entries.length === 0) return;

  const columns = ["Fecha", "Inicio", "Fin", "Duracion", "Proyecto", "Nota"];
  const thClass =
    "px-3 py-2 text-left text-dim font-medium border-b border-line bg-hi sticky top-0";
  const tdClass = "px-3 py-2 border-b border-line/60 text-txt/90 max-w-[140px] truncate";
  const tdAccent = "px-3 py-2 border-b border-line/60 text-accent font-bold tabular-nums";

  const thead = `<thead><tr>${columns
    .map((column) => `<th class="${thClass}">${column}</th>`)
    .join("")}</tr></thead>`;
  const tbody =
    "<tbody>" +
    entries
      .map(
        (entry) =>
          `<tr class="hover:bg-hi/40 transition-colors duration-100">
            <td class="${tdClass}">${esc(entry.date)}</td>
            <td class="${tdClass} tabular-nums">${esc(formatLocalTimeSec(entry.start))}</td>
            <td class="${tdClass} tabular-nums">${esc(formatLocalTimeSec(entry.end))}</td>
            <td class="${tdAccent}">${esc(formatDuration(entry.duration))}</td>
            <td class="${tdClass} ${entry.project ? "" : "italic text-dim/50"}">${entry.project ? esc(entry.project) : "-"}</td>
            <td class="${tdClass} ${entry.notes ? "" : "italic text-dim/50"}">${entry.notes ? esc(entry.notes) : "-"}</td>
          </tr>`
      )
      .join("") +
    "</tbody>";

  csvTable.innerHTML = thead + tbody;
  csvCount.textContent = `${entries.length} ${entries.length === 1 ? "registro" : "registros"}`;
  csvModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeCsvPreview(): void {
  csvModal.classList.add("hidden");
  document.body.style.overflow = "";
}

function updateNotifUI(): void {
  document.querySelectorAll<HTMLButtonElement>(".notif-opt").forEach((button) => {
    const buttonHours = button.dataset.hours === "" ? null : Number(button.dataset.hours);
    const isActive = buttonHours === notifThreshold;
    button.classList.toggle("border-accent", isActive);
    button.classList.toggle("text-accent", isActive);
    button.classList.toggle("border-line", !isActive);
    button.classList.toggle("text-dim", !isActive);
  });

  if (!("Notification" in window)) {
    notifStatus.textContent = "No disponible en este navegador";
  } else if (Notification.permission === "denied") {
    notifStatus.textContent = "Notificaciones bloqueadas en el navegador";
  } else if (notifThreshold) {
    notifStatus.textContent = `Aviso al alcanzar ${notifThreshold}h hoy`;
  } else {
    notifStatus.textContent = "Desactivadas";
  }
}

currentDateEl.textContent = getCurrentDateLabel();
startBtn.addEventListener("click", startTimer);
pauseBtn.addEventListener("click", pauseTimer);
resumeBtn.addEventListener("click", resumeTimerFromPause);
stopBtn.addEventListener("click", stopTimer);
exportBtn.addEventListener("click", downloadCsv);
previewBtn.addEventListener("click", openCsvPreview);
csvClose.addEventListener("click", closeCsvPreview);
csvBackdrop.addEventListener("click", closeCsvPreview);
csvDownloadModal.addEventListener("click", downloadCsv);
importInput.addEventListener("change", () => {
  void importCsvFile();
});

recordsList.addEventListener("click", (event) => {
  const target = event.target as Element;

  const deleteBtn = target.closest<HTMLButtonElement>(".delete-btn");
  if (deleteBtn) {
    pendingDeleteId = Number(deleteBtn.dataset.id);
    renderList();
    return;
  }

  const confirmBtn = target.closest<HTMLButtonElement>(".confirm-delete-btn");
  if (confirmBtn) {
    deleteEntry(Number(confirmBtn.dataset.id));
    return;
  }

  const cancelBtn = target.closest(".cancel-delete-btn");
  if (cancelBtn) {
    pendingDeleteId = null;
    renderList();
    return;
  }

  const noteEl = target.closest<HTMLElement>("[data-editable-note]");
  if (!noteEl) return;
  const item = noteEl.closest<HTMLElement>("li[data-id]");
  if (item) startNoteEdit(Number(item.dataset.id), noteEl);
});

filterBtns.forEach((button) => {
  button.addEventListener("click", () => {
    filterBtns.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    activeFilter = button.dataset.filter as typeof activeFilter;
    renderList();
  });
});

notifBtn.addEventListener("click", () => {
  notifPanel.classList.toggle("hidden");
  if (!notifPanel.classList.contains("hidden")) updateNotifUI();
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
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!csvModal.classList.contains("hidden")) {
      closeCsvPreview();
      return;
    }

    if (pendingDeleteId !== null) {
      pendingDeleteId = null;
      renderList();
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

updateStats();
renderList();
updateProjectDatalist();
updateNotifUI();

const savedRunning = loadRunningState();
if (savedRunning) restoreTimer(savedRunning);

evaluateNotification(entries, notifThreshold, getRunningElapsedSeconds(), sessionStart);
