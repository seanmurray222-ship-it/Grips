import { ACTS, CLIMBS, EDITABLE_GUIDES, GRIPPERS } from "../defaults";
import { shortDate } from "../logic/dates";
import {
  activeN,
  canMoveBack,
  carriedIn,
  climbFor,
  gripAutoN,
  guideFor,
  isCustomGuide,
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
export function viewSession(n: number, a: Activity, back: string): string {
  const d = state.data, t = today();
  const kind = dayKind(n);
  const e = entryN(d, n);
  const when = kind === "finished" && e ? `Finished ${shortDate(e.date)}` : kind === "current" ? "Today" : "Coming up";
  const done = isDoneN(d, n, a, t);
  const ci = carriedIn(d, n, a);

  const kindA = climbFor(d, n, a);
  const label = ACTS[kindA].label;

  let tick: string;
  const gripLine =
    a === "grip"
      ? (() => {
          const st = gripStatusN(d, n, t);
          return `<div class="small">${GRIPPERS.map((g) => `<span class="gstat">${gtag(g.id)}${(["LH", "RH"] as Hand[]).map((h) => (st[g.id].has(h) ? h + " ✓" : h + " –")).join("  ")}</span>`).join("")}</div>`;
        })()
      : "";
  if (a === "grip" && gripAutoN(d, n, t)) {
    tick = `<div class="sess-done on">
      <span class="box on" aria-hidden="true">✓</span>
      <div><b>Done</b>
        <div class="small muted">Ticked itself: you logged a session on each gripper.</div>
        ${gripLine}
      </div></div>`;
  } else if (kind === "future") {
    tick = `<div class="sess-done"><span class="box" aria-hidden="true"></span>
      <div><b>Not due yet</b><div class="small muted">You can tick this off once ${dayLabel(d, n)} comes up. You can write a note now.</div></div></div>`;
  } else {
    const hint =
      a === "grip"
        ? done
          ? "Ticked by hand. Tap to undo."
          : "Ticks itself when you log a session on each gripper. Trained without logging? Tap to tick it off."
        : done
          ? "Tap to undo."
          : "Tap when you’ve finished this session.";
    tick = `<button class="sess-done btn-reset${done ? " on" : ""}" data-action="sess-check" aria-pressed="${done}">
      <span class="box${done ? " on" : ""}" aria-hidden="true">${done ? "✓" : ""}</span>
      <div><b>${done ? "Done" : "Mark as done"}</b><div class="small muted">${hint}</div>${gripLine}</div>
    </button>`;
  }

  const climbPick = CLIMBS.includes(a)
    ? `<div class="sess-kind" role="group" aria-label="Type of climbing">
      ${CLIMBS.map((k) => `<button data-action="sess-kind" data-k="${k}" aria-pressed="${k === kindA}">${ACTS[k].label}</button>`).join("")}
    </div>`
    : "";

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
    <button class="btn" data-action="sess-close" aria-label="Back to ${back}">← ${back}</button>
    <span class="small muted">${dayLabel(d, n)} · ${when}</span>
  </div>
  <h1 class="page">${label}</h1>
  <p class="muted" style="margin:4px 0 14px">${ACTS[kindA].desc}</p>
  ${climbPick}
  ${tick}
  ${move}
  <label class="sess-note">
    <span class="sess-note-l">Note <span class="small muted" id="noteStatus" aria-live="polite"></span></span>
    <textarea id="sessNote" data-n="${n}" data-a="${a}" rows="4" placeholder="${esc(placeholder(a))}">${esc(noteFor(d, n, a))}</textarea>
  </label>
  ${guideBlock(kindA)}`;
}

/** "What this session includes". Strength A and B can be rewritten to match your own program. */
function guideBlock(a: Activity): string {
  const s = state.data.settings;
  const text = guideFor(s, a);
  if (!EDITABLE_GUIDES.includes(a))
    return `<h2>What this session includes</h2><p class="sess-guide">${esc(text)}</p>`;
  const custom = isCustomGuide(s, a);
  if (state.editGuide)
    return `<h2>What this session includes</h2>
    <label class="sess-note">
      <span class="small muted">Your ${ACTS[a].label} program. It applies to every ${ACTS[a].label} session.</span>
      <textarea id="guideEdit" rows="8" aria-label="What ${ACTS[a].label} includes">${esc(text)}</textarea>
    </label>
    <div class="row2 sess-guide-btns">
      <button class="btn" data-action="guide-cancel">Cancel</button>
      <button class="btn primary" data-action="guide-save" data-a="${a}">Save</button>
    </div>
    ${custom ? `<p class="small" style="margin:6px 0 0"><button class="linkbtn" data-action="guide-reset" data-a="${a}">Restore the suggested ${ACTS[a].label}</button></p>` : ""}`;
  return `<div class="sess-guide-head"><h2>What this session includes</h2><button class="btn" data-action="guide-edit">Edit</button></div>
  <p class="sess-guide">${esc(text)}</p>
  ${custom ? `<p class="small muted" style="margin:6px 0 0">Your own version.</p>` : ""}`;
}

function placeholder(a: Activity): string {
  if (a === "board" || a === "open" || a === "outdoor") return "Problems you tried or sent, how your fingers felt…";
  if (a === "strA" || a === "strB") return "Weights and reps, anything that felt off…";
  if (a === "grip") return "How the holds felt, anything to remember next time…";
  return "How it went…";
}
