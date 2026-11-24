import { ACTS, GRIPPERS, GUIDE } from "../defaults";
import { shortDate } from "../logic/dates";
import {
  activeN,
  canMoveBack,
  carriedIn,
  dayLabel,
  entryN,
  gripStatusN,
  isDoneN,
  nextFreeN,
  noteFor,
} from "../logic/plan";
import { state, today } from "../store";
import type { Activity, Hand } from "../types";
import { esc, gtag } from "./common";

/** Where a training day sits relative to now. */
export function dayKind(n: number): "finished" | "current" | "future" {
  const d = state.data;
  if (entryN(d, n)) return "finished";
  return n === activeN(d, today()) ? "current" : "future";
}

/** One session (an activity on one training day): what it includes, a done tick and a note. */
export function viewSession(n: number, a: Activity): string {
  const d = state.data, t = today();
  const kind = dayKind(n);
  const e = entryN(d, n);
  const when = kind === "finished" && e ? `Finished ${shortDate(e.date)}` : kind === "current" ? "Today" : "Coming up";
  const done = isDoneN(d, n, a, t);
  const ci = carriedIn(d, n, a);

  let tick: string;
  if (a === "grip") {
    const st = gripStatusN(d, n, t);
    tick = `<div class="sess-done${done ? " on" : ""}">
      <span class="box${done ? " on" : ""}" aria-hidden="true">${done ? "✓" : ""}</span>
      <div><b>${done ? "Done" : "Not done yet"}</b>
        <div class="small muted">Ticks itself when you log a session on each gripper.</div>
        <div class="small">${GRIPPERS.map((g) => `<span class="gstat">${gtag(g.id)}${(["LH", "RH"] as Hand[]).map((h) => (st[g.id].has(h) ? h + " ✓" : h + " –")).join("  ")}</span>`).join("")}</div>
      </div></div>`;
  } else if (kind === "future") {
    tick = `<div class="sess-done"><span class="box" aria-hidden="true"></span>
      <div><b>Not due yet</b><div class="small muted">You can tick this off once ${dayLabel(d, n)} comes up. You can write a note now.</div></div></div>`;
  } else {
    tick = `<button class="sess-done btn-reset${done ? " on" : ""}" data-action="sess-check" aria-pressed="${done}">
      <span class="box${done ? " on" : ""}" aria-hidden="true">${done ? "✓" : ""}</span>
      <div><b>${done ? "Done" : "Mark as done"}</b><div class="small muted">${done ? "Tap to undo." : "Tap when you’ve finished this session."}</div></div>
    </button>`;
  }

  let move = "";
  if (kind !== "finished" && !done) {
    const push = `<button class="linkbtn" data-action="sess-push">Push to ${dayLabel(d, nextFreeN(d, n, a, t))}</button>`;
    move = !ci
      ? `<p class="small muted sess-move">${push}</p>`
      : canMoveBack(d, n, a)
        ? `<p class="small muted sess-move">Pushed from ${dayLabel(d, ci.from)}. <button class="linkbtn" data-action="sess-back">Move back to ${dayLabel(d, ci.from)}</button> · ${push}</p>`
        : `<p class="small muted sess-move">Pushed from ${dayLabel(d, ci.from)}. ${push}</p>`;
  }

  return `
  <div class="top sess-top">
    <button class="btn" data-action="sess-close" aria-label="Back to Plan">← Plan</button>
    <span class="small muted">${dayLabel(d, n)} · ${when}</span>
  </div>
  <h1 class="page">${ACTS[a].label}</h1>
  <p class="muted" style="margin:4px 0 14px">${ACTS[a].desc}</p>
  ${tick}
  ${move}
  <label class="sess-note">
    <span class="sess-note-l">Note <span class="small muted" id="noteStatus" aria-live="polite"></span></span>
    <textarea id="sessNote" data-n="${n}" data-a="${a}" rows="4" placeholder="${esc(placeholder(a))}">${esc(noteFor(d, n, a))}</textarea>
  </label>
  <h2>What this session includes</h2>
  <p class="sess-guide">${GUIDE[a]}</p>`;
}

function placeholder(a: Activity): string {
  if (a === "board" || a === "open" || a === "outdoor") return "Problems you tried or sent, how your fingers felt…";
  if (a === "strA" || a === "strB") return "Weights and reps, anything that felt off…";
  if (a === "grip") return "How the holds felt, anything to remember next time…";
  return "How it went…";
}
