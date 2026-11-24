import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-500.css";
import "@fontsource/barlow/latin-600.css";
import "@fontsource/barlow-condensed/latin-500.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "./styles.css";

import { ACTS, DEFAULT_SEQ, DEFAULT_SETTINGS, clone, isActivity } from "./defaults";
import { fmtDate } from "./logic/dates";
import { gOf } from "./logic/curve";
import { ImportError, buildExport, parseImport, uid } from "./logic/data";
import * as plan from "./logic/plan";
import {
  load,
  replaceAll,
  requestPersist,
  saveMeta,
  saveSessions,
  saveSettings,
  saveTrack,
  setErrorHandler,
  state,
  today,
  writePref,
  type View,
} from "./store";
import type { Activity, Gripper, Hand } from "./types";
import { ask, askOpen, closeAsk, notify } from "./ui/ask";
import { esc, gInfo, plural } from "./ui/common";
import { viewCurve } from "./ui/curve";
import { viewLog } from "./ui/log";
import { viewPlan } from "./ui/plan";
import { viewSession } from "./ui/session";
import { viewSettings } from "./ui/settings";
import { T, closeTimer, onVisible, openTimer, setRerender, stepWeight, tDrop, tSave, tSkip, tStart } from "./ui/timer";
import { viewToday } from "./ui/today";

const app = document.getElementById("app")!;

let renderedDay = "";
function render() {
  renderedDay = today();
  document.body.dataset.gripper = state.gripper;
  let top = "";
  if (state.error) top += `<div class="notice err" role="alert">${esc(state.error)}</div>`;
  if (!state.loaded) {
    app.innerHTML = top + `<div class="empty-state">Loading your log…</div>`;
    updateTabs();
    return;
  }
  const v = state.session
    ? viewSession(state.session.n, state.session.a, state.view === "today" ? "Today" : "Plan")
    : state.view === "log" ? viewLog() : state.view === "curve" ? viewCurve() : state.view === "plan" ? viewPlan() : state.view === "settings" ? viewSettings() : viewToday();
  app.innerHTML = top + v;
  updateTabs();
}
function updateTabs() {
  document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((b) => {
    if (b.dataset.view === state.view) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
}
setRerender(render);
setErrorHandler(render);

/* ---------- Track changes ---------- */
const D = () => state.data;
function setTrack(t: typeof state.data.track) {
  state.data.track = t;
  void saveTrack();
  render();
}
function setSeq(s: typeof state.data.settings.seq) {
  state.data.settings.seq = s;
  void saveSettings();
  render();
}

/* ---------- Export / Import ---------- */
function doExport() {
  const body = JSON.stringify(buildExport(D()), null, 1);
  const blob = new Blob([body], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `open-grips-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  state.meta.lastExport = Date.now();
  void saveMeta();
  render();
}

async function doImport(file: File) {
  let parsed;
  try {
    parsed = parseImport(await file.text());
  } catch (e) {
    notify(e instanceof ImportError ? e.message : "That file couldn’t be read.");
    return;
  }
  const cur = D().sessions.length;
  const msg = `Replace ${cur ? plural(cur, "session") + " and your settings" : "everything on this device"} with ${plural(parsed.sessions.length, "session")}, settings and plan progress from ${file.name}?`;
  ask(msg, "Replace", async () => {
    await replaceAll(parsed);
    state.hand = "LH";
    state.editPlan = state.editProgram = state.showForm = false;
    state.session = null;
    render();
    notify(`Imported ${plural(parsed.sessions.length, "session")}, ${plural(parsed.track.days.length, "finished training day")} and your rotation.`);
  }, cur > 0);
}

/* ---------- Session page (opened from Today or Plan) ---------- */
/*
 * Opening a session pushes a history entry, so Android's back gesture returns to the Plan list
 * or Today instead of leaving the app. Notes save as you type (debounced) and whenever you leave the page.
 */
let listScrollY = 0;
let pendingNote: { n: number; a: Activity; text: string } | null = null;
let noteTimer = 0;

function setNoteStatus(text: string) {
  const el = document.getElementById("noteStatus");
  if (el) el.textContent = text;
}
function flushNote() {
  clearTimeout(noteTimer);
  if (!pendingNote) return;
  const { n, a, text } = pendingNote;
  pendingNote = null;
  if (plan.noteFor(D(), n, a) === text) return;
  state.data.track = plan.setNote(D(), n, a, text);
  void saveTrack().then(() => setNoteStatus(state.error ? "" : "Saved"));
}
function openSession(n: number, a: Activity) {
  flushNote();
  listScrollY = window.scrollY;
  state.session = { n, a };
  history.pushState({ og: "session" }, "");
  render();
  window.scrollTo(0, 0);
}
/** Leave the session page. `viaHistory` is true when the back gesture already popped our entry. */
function closeSession(viaHistory = false) {
  flushNote();
  if (!state.session) return;
  state.session = null;
  if (!viaHistory && history.state && history.state.og === "session") history.back();
  render();
  window.scrollTo(0, listScrollY);
}
window.addEventListener("popstate", () => {
  if (state.session) closeSession(true);
});
// A reload keeps the history entry but not the open page; drop the marker so Back behaves normally.
if (history.state && history.state.og === "session") history.replaceState(null, "");

/* ---------- Events ---------- */
document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target.id === "askOk") return closeAsk(true);
  if (target.id === "askCancel" || target.id === "ask") return closeAsk(false);
  const tab = target.closest<HTMLButtonElement>(".tabs button");
  if (tab) {
    if (state.session) closeSession();
    state.view = tab.dataset.view as View;
    state.showForm = false;
    render();
    window.scrollTo(0, 0);
    return;
  }
  const el = target.closest<HTMLElement>("[data-action]");
  if (!el) return;
  const a = el.dataset.action!;
  const n = Number(el.dataset.n), act = el.dataset.a, t = today();
  switch (a) {
    case "gripper":
      state.gripper = el.dataset.g as Gripper;
      writePref("og-gripper", state.gripper);
      return render();
    case "hand":
      state.hand = el.dataset.hand as Hand;
      return render();
    case "curve-hand":
      state.curveHand = el.dataset.hand as Hand;
      return render();
    case "log-filter":
      state.logFilter = el.dataset.g as "all" | Gripper;
      return render();
    case "check":
      if (isActivity(act)) setTrack(plan.toggleCheck(D(), n, act));
      return;
    case "plan-edit":
      state.editPlan = !state.editPlan;
      return render();
    case "postpone":
      if (isActivity(act)) setTrack(plan.postpone(D(), n, act, t));
      return;
    case "move-back":
      if (isActivity(act)) setTrack(plan.moveBack(D(), n, act));
      return;
    case "open-session":
      if (isActivity(act)) openSession(n, act);
      return;
    case "sess-close":
      return closeSession();
    case "sess-check":
      if (state.session) setTrack(plan.toggleCheck(D(), state.session.n, state.session.a));
      return;
    case "sess-push": {
      const s = state.session;
      if (!s) return;
      flushNote();
      const to = plan.nextFreeN(D(), s.n, s.a, t);
      const track = plan.postpone(D(), s.n, s.a, t);
      state.session = { n: to, a: s.a };
      return setTrack(track);
    }
    case "sess-back": {
      const s = state.session;
      const ci = s && plan.carriedIn(D(), s.n, s.a);
      if (!s || !ci) return;
      flushNote();
      const track = plan.moveBack(D(), s.n, s.a);
      state.session = { n: ci.from, a: s.a };
      return setTrack(track);
    }
    case "finish-day": {
      const an = plan.activeN(D(), t);
      const left = plan.itemsFor(D(), an, t).filter((x) => !plan.isDoneN(D(), an, x, t));
      const finish = () => setTrack(plan.finishDay(D(), today()));
      if (left.length)
        ask(
          `Finish ${plan.dayLabel(D(), an)} with ${left.map((x) => ACTS[x].label).join(", ")} not done? To keep a session for later, use Push instead.`,
          `Finish ${plan.dayLabel(D(), an)}`,
          finish,
        );
      else finish();
      return;
    }
    case "undo-finish":
      return setTrack(plan.undoFinish(D(), t));
    case "seq-up":
    case "seq-down":
      return setSeq(plan.seqMove(plan.seq(D()), Number(el.dataset.i), a === "seq-up" ? -1 : 1));
    case "seq-toggle":
      if (isActivity(act)) setSeq(plan.seqToggle(plan.seq(D()), Number(el.dataset.i), act));
      return;
    case "seq-add":
      return setSeq(plan.seqAdd(plan.seq(D())));
    case "seq-remove": {
      const i = Number(el.dataset.i);
      if (plan.seqLen(D()) > 1) ask(`Remove Day ${i + 1} from the rotation?`, `Remove Day ${i + 1}`, () => setSeq(plan.seqRemove(plan.seq(D()), i)), true);
      return;
    }
    case "prog-edit":
      state.editProgram = true;
      return render();
    case "prog-cancel":
      state.editProgram = false;
      return render();
    case "prog-clear":
      return ask(
        "Remove the program dates? Your rotation stays, without blocks or rest weeks.",
        "Remove dates",
        () => {
          state.data.settings.program = clone(DEFAULT_SETTINGS.program);
          state.editProgram = false;
          void saveSettings();
          render();
        },
        true,
      );
    case "plan-reset":
      return ask("Replace your rotation with the suggested 7-day rotation?", "Restore", () => setSeq(clone(DEFAULT_SEQ)));
    case "start":
      return openTimer();
    case "t-close":
      if (T.reps.length && T.phase !== "done") ask("Close without saving these reps?", "Close", closeTimer, true);
      else closeTimer();
      return;
    case "t-start":
      return tStart();
    case "t-drop":
      return tDrop();
    case "t-skip":
      return tSkip();
    case "t-save":
      return tSave();
    case "t-discard":
      return ask("Discard this session?", "Discard", closeTimer, true);
    case "wt-up":
      return stepWeight(1);
    case "wt-down":
      return stepWeight(-1);
    case "form-open":
      state.showForm = true;
      return render();
    case "form-cancel":
      state.showForm = false;
      return render();
    case "del": {
      const s = D().sessions.find((x) => x.id === el.dataset.id);
      if (s)
        ask(
          `Delete the ${gInfo(gOf(s)).name} ${s.hand} ${s.zone} session from ${fmtDate(s.date)}?`,
          "Delete",
          () => {
            state.data.sessions = D().sessions.filter((x) => x.id !== s.id);
            void saveSessions();
            render();
          },
          true,
        );
      return;
    }
    case "reset-settings":
      return ask("Restore the default zones and settings? Your rotation and program stay as they are.", "Restore", () => {
        const { seq, program } = state.data.settings;
        state.data.settings = { ...clone(DEFAULT_SETTINGS), seq, program };
        void saveSettings();
        render();
      });
    case "export":
      return doExport();
    case "import":
      return (document.getElementById("importFile") as HTMLInputElement).click();
  }
});

document.addEventListener("input", (e) => {
  const el = e.target as HTMLTextAreaElement;
  if (el.id !== "sessNote") return;
  const a = el.dataset.a;
  if (!isActivity(a)) return;
  pendingNote = { n: Number(el.dataset.n), a, text: el.value };
  setNoteStatus("Saving…");
  clearTimeout(noteTimer);
  noteTimer = window.setTimeout(flushNote, 600);
});
document.addEventListener("focusout", (e) => {
  if ((e.target as HTMLElement).id === "sessNote") flushNote();
});

document.addEventListener("change", (e) => {
  const inp = e.target as HTMLInputElement;
  if (inp.id === "importFile" && inp.files && inp.files[0]) {
    void doImport(inp.files[0]);
    inp.value = "";
  }
});

document.addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const fd = new FormData(form);
  const num = (k: string) => Number(String(fd.get(k) ?? "").replace(",", "."));
  if (form.id === "addForm") {
    const reps = ["r1", "r2", "r3"].map(num).filter((v) => v > 0).map(Math.round);
    if (!(num("weight") > 0) || !reps.length) return notify("Enter a weight and at least rep 1.");
    const g: Gripper = fd.get("gripper") === "sisyphus" ? "sisyphus" : "prometheus";
    state.data.sessions = D().sessions.concat([
      {
        id: uid(),
        created: Date.now(),
        date: String(fd.get("date") || today()),
        gripper: g,
        zone: String(fd.get("zone")),
        hand: fd.get("hand") === "RH" ? "RH" : "LH",
        weight: num("weight"),
        reps,
      },
    ]);
    state.showForm = false;
    void saveSessions();
    render();
  } else if (form.id === "progForm") {
    const start = String(fd.get("start") || ""), end = String(fd.get("end") || "");
    if (!start) return;
    if (end && end < start) return notify("The end date must be after the start date.");
    state.data.settings.program = {
      start,
      end,
      block: Math.max(1, Math.round(num("block")) || 4),
      rest: Math.max(0, Math.round(num("rest")) || 0),
    };
    state.editProgram = false;
    void saveSettings();
    render();
  } else if (form.id === "setForm") {
    const pos = (k: string, d: number) => {
      const v = num(k);
      return v > 0 ? v : d;
    };
    const s = state.data.settings;
    s.zones = s.zones.map((z, i) => ({
      name: z.name,
      bottom: pos("b" + i, z.bottom),
      top: pos("t" + i, z.top),
      target: pos("g" + i, z.target),
      reps: Math.round(pos("r" + i, z.reps)),
    }));
    s.rest = pos("rest", s.rest);
    s.oneRMTime = pos("onerm", s.oneRMTime);
    s.steps = { prometheus: pos("step-prometheus", s.steps.prometheus || 1), sisyphus: pos("step-sisyphus", s.steps.sisyphus || 1) };
    s.starter = {
      prometheus: s.zones.map((_, i) => Math.max(0, num("st-prometheus-" + i) || 0)),
      sisyphus: s.zones.map((_, i) => Math.max(0, num("st-sisyphus-" + i) || 0)),
    };
    s.starterCount = Math.max(0, Math.round(num("startercount")) || 0);
    void saveSettings();
    render();
    notify("Settings saved.");
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && askOpen()) closeAsk(false);
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushNote();
  if (document.visibilityState === "visible") {
    onVisible();
    // A new calendar day may have started while the app was in the background.
    if (!T.open && !askOpen() && renderedDay !== today()) render();
  }
});

/* ---------- Start ---------- */
render();
void load().then(() => {
  render();
  void requestPersist().then(() => {
    if (state.view === "settings") render();
  });
});

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js", { scope: import.meta.env.BASE_URL }).catch(() => {});
  });
}
