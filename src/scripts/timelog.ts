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
let undoEntry: { entry: Entry; index: number } | null = null;
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
const toastMsg = document.getElementById("toast-msg") as HTMLElement;
const toastAction = document.getElementById("toast-action") as HTMLButtonElement;

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
  }, 4000);
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
  const index = entries.findIndex((e) => e.id === id);
  if (index === -1) return;
  const [removed] = entries.splice(index, 1);
  undoEntry = { entry: removed, index };
  saveEntries(entries);
  updateStats();
  renderList();
  showToast("Registro eliminado", {
    label: "Deshacer",
    cb: () => {
      if (!undoEntry) return;
      entries.splice(undoEntry.index, 0, undoEntry.entry);
      entries.sort((a, b) => b.start - a.start);
      undoEntry = null;
      saveEntries(entries);
      updateStats();
      renderList();
    },
  });
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

function startTimeEdit(id: number, timeRow: HTMLElement): void {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;

  const toHHMM = (ts: number) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const form = document.createElement("div");
  form.className = "flex items-center gap-1.5 font-mono text-[0.7rem] mt-1 flex-wrap";
  form.innerHTML = `
    <input type="time" value="${toHHMM(entry.start)}" id="te-start-${id}"
      class="bg-hi border border-line rounded px-1.5 py-px text-txt focus:outline-none focus:border-accent tabular-nums">
    <span class="opacity-40">&#8594;</span>
    <input type="time" value="${toHHMM(entry.end)}" id="te-end-${id}"
      class="bg-hi border border-line rounded px-1.5 py-px text-txt focus:outline-none focus:border-accent tabular-nums">
    <button class="te-save px-2 py-px rounded bg-accent/15 text-accent border border-accent/30 text-[0.65rem] font-semibold hover:bg-accent/25 transition-colors">OK</button>
    <button class="te-cancel px-2 py-px rounded bg-hi text-dim border border-line text-[0.65rem] hover:text-txt transition-colors">Cancelar</button>
  `;

  timeRow.replaceWith(form);
  (form.querySelector(`#te-start-${id}`) as HTMLInputElement).focus();

  function commitTimeEdit(): void {
    const startInput = form.querySelector(`#te-start-${id}`) as HTMLInputElement;
    const endInput = form.querySelector(`#te-end-${id}`) as HTMLInputElement;
    if (!startInput.value || !endInput.value) { renderList(); return; }

    const origDate = new Date(entry!.start);
    const [sh, sm] = startInput.value.split(":").map(Number);
    const [eh, em] = endInput.value.split(":").map(Number);

    const newStart = new Date(origDate);
    newStart.setHours(sh, sm, 0, 0);
    const newEnd = new Date(origDate);
    newEnd.setHours(eh, em, 0, 0);
    if (newEnd <= newStart) newEnd.setDate(newEnd.getDate() + 1);

    const newDuration = Math.floor((newEnd.getTime() - newStart.getTime()) / 1000);
    if (newDuration < 1) { renderList(); return; }

    entry!.start = newStart.getTime();
    entry!.end = newEnd.getTime();
    entry!.duration = newDuration;
    entries.sort((a, b) => b.start - a.start);
    saveEntries(entries);
    updateStats();
    renderList();
  }

  form.querySelector(".te-save")?.addEventListener("click", commitTimeEdit);
  form.querySelector(".te-cancel")?.addEventListener("click", () => renderList());
  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); commitTimeEdit(); }
    if (e.key === "Escape") renderList();
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

      return `
      <li
        class="group relative flex items-stretch rounded-xl bg-surface border border-line overflow-hidden transition-colors duration-150 hover:border-line-hi focus:outline-none focus:border-accent/50"
        data-id="${entry.id}"
        tabindex="0"
        aria-label="Registro ${formatLocalTime(entry.start)} – ${formatLocalTime(entry.end)}, ${formatDuration(entry.duration)}${entry.notes ? ", " + entry.notes : ""}"
      >
        <div class="w-[3px] shrink-0 bg-line group-hover:bg-accent/50 group-focus:bg-accent/50 transition-colors duration-200"></div>
        <div class="flex flex-1 items-center gap-3 pl-4 pr-3 py-3.5 min-w-0">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 min-w-0">
              <p class="${noteClass}" data-editable-note title="Clic o Enter para editar">${noteText}</p>
              <span class="opacity-0 group-hover:opacity-50 group-focus-within:opacity-50 text-dim text-[0.62rem] shrink-0 transition-opacity duration-100 pointer-events-none select-none">✎</span>
              ${projectBadge}
            </div>
            <div class="flex items-center gap-1 mt-1 font-mono text-[0.7rem] text-dim/70" data-time-row data-id="${entry.id}">
              <span>${formatLocalTime(entry.start)}</span>
              <span class="opacity-40 mx-0.5">-&gt;</span>
              <span>${formatLocalTime(entry.end)}</span>
              <span class="opacity-25 mx-1.5">.</span>
              <span>${entry.date}</span>
              <button class="edit-time-btn opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 ml-1.5 text-dim hover:text-accent transition-all duration-150 text-[0.65rem]" data-id="${entry.id}" title="Editar horario" aria-label="Editar horario">✎</button>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="font-mono text-[0.78rem] font-bold text-accent bg-accent/[0.07] border border-accent/20 px-2.5 py-1 rounded-lg tabular-nums">
              ${formatDuration(entry.duration)}
            </span>
            <button class="delete-btn opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg text-dim hover:text-danger hover:bg-danger/[0.08] border border-transparent hover:border-danger/25 transition-all duration-150 text-[0.65rem]" data-id="${entry.id}" title="Eliminar" aria-label="Eliminar registro">✕</button>
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
    deleteEntry(Number(deleteBtn.dataset.id));
    return;
  }

  const timeEditBtn = target.closest<HTMLButtonElement>(".edit-time-btn");
  if (timeEditBtn) {
    const item = timeEditBtn.closest<HTMLElement>("li[data-id]");
    if (item) {
      const timeRow = item.querySelector<HTMLElement>("[data-time-row]");
      if (timeRow) startTimeEdit(Number(timeEditBtn.dataset.id), timeRow);
    }
    return;
  }

  const noteEl = target.closest<HTMLElement>("[data-editable-note]");
  if (!noteEl) return;
  const item = noteEl.closest<HTMLElement>("li[data-id]");
  if (item) startNoteEdit(Number(item.dataset.id), noteEl);
});

recordsList.addEventListener("keydown", (event) => {
  const li = (event.target as Element).closest<HTMLElement>("li[data-id]");
  if (!li) return;
  const id = Number(li.dataset.id);

  if (event.key === "Delete" || event.key === "Backspace") {
    // Only delete if not currently editing a field inside the li
    if (document.activeElement === li) {
      event.preventDefault();
      deleteEntry(id);
    }
    return;
  }

  if (event.key === "Enter" && document.activeElement === li) {
    event.preventDefault();
    const noteEl = li.querySelector<HTMLElement>("[data-editable-note]");
    if (noteEl) startNoteEdit(id, noteEl);
  }
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
