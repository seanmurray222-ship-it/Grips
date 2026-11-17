import { ACTS, ACT_ORDER } from "../defaults";
import { fmtDate, shortDate } from "../logic/dates";
import {
  activeN,
  carriedIn,
  carriedOut,
  dayLabel,
  isDoneN,
  isRestWeek,
  itemsFor,
  programInfo,
  recentStats,
  seq,
  seqLen,
  todayEntry,
  type ProgramInfo,
} from "../logic/plan";
import { state, today } from "../store";
import type { Activity } from "../types";
import { esc } from "./common";

export function programLabel(info: ProgramInfo | null): string {
  if (!info) return "";
  if (info.phase === "before") return "Program starts " + fmtDate(state.data.settings.program.start);
  const base = info.restWeek ? `Block ${info.blockNo} rest week` : `Block ${info.blockNo}, week ${info.week} of ${info.block}`;
  return info.phase === "after" ? base + ", past end date" : base;
}

function programCard(): string {
  const d = state.data, t = today();
  const P = d.settings.program, info = programInfo(d, activeN(d, t), t);
  if (state.editProgram)
    return `
  <form class="form" id="progForm">
    <div class="grid">
      <label class="f">Start date<input type="date" name="start" value="${esc(P.start || t)}" required></label>
      <label class="f">Target end date<input type="date" name="end" value="${esc(P.end || "")}"></label>
    </div>
    <div class="grid">
      <label class="f">Training weeks per block<input name="block" value="${P.block}" inputmode="numeric"></label>
      <label class="f">Rest weeks after each block<input name="rest" value="${P.rest}" inputmode="numeric"></label>
    </div>
    <p class="small muted" style="margin:0">A week is one pass through your ${seqLen(d)}-day rotation, counted from the start date. Missed days don’t count, so a week can run longer than 7 calendar days. The grippers continue through rest weeks.</p>
    <div class="row2">
      <button type="button" class="btn" data-action="prog-cancel">Cancel</button>
      <button type="submit" class="btn primary">Save program</button>
    </div>
    ${P.start ? `<button type="button" class="btn danger" data-action="prog-clear">Remove program dates</button>` : ""}
  </form>`;
  if (!P.start)
    return `<div class="prog"><div><b>No program dates set</b><div class="small muted">Set a start date to train in blocks with rest weeks.</div></div><button class="btn" data-action="prog-edit">Set dates</button></div>`;
  return `<div class="prog"><div><b>${esc(programLabel(info))}</b>
    <div class="small muted">From ${fmtDate(P.start)}${P.end ? ", target end " + fmtDate(P.end) : ""} · ${P.block} weeks on, ${P.rest} off (grippers continue)</div></div>
    <button class="btn" data-action="prog-edit">Edit</button></div>`;
}

function chipFor(n: number, a: Activity, tappable: boolean): string {
  const d = state.data;
  const on = isDoneN(d, n, a, today()), ci = carriedIn(d, n, a);
  const label = `${on ? "✓ " : ""}${ci ? "↪ " : ""}${ACTS[a].label}`;
  if (tappable && !on)
    return ci
      ? `<button class="dchip moved" data-action="chip-back" data-n="${n}" data-a="${a}" aria-label="${ACTS[a].label}, pushed from ${dayLabel(d, ci.from)}. Tap to move back.">${label}</button>`
      : `<button class="dchip" data-action="chip-postpone" data-n="${n}" data-a="${a}" aria-label="${ACTS[a].label}. Tap to push to a later day.">${label}</button>`;
  return `<span class="dchip${on ? " on" : ""}${ci ? " moved" : ""}">${label}</span>`;
}

export function viewPlan(): string {
  const d = state.data, t = today();
  const e = todayEntry(d, t), n0 = activeN(d, t), st = recentStats(d, t);
  let body: string;
  if (state.editPlan) {
    const S = seq(d);
    body = `<p class="small muted">Your rotation repeats in this order. Use the arrows to reorder days, and tap a session to add or remove it. A day with nothing on it is a planned rest day.</p>
    <ul class="week">${S.map((items, i) => {
      const cur = new Set(items);
      return `<li class="day edit"><div class="dname"><b>Day ${i + 1}</b>
        <span class="reorder"><button data-action="seq-up" data-i="${i}" aria-label="Move Day ${i + 1} earlier" ${i === 0 ? "disabled" : ""}>↑</button><button data-action="seq-down" data-i="${i}" aria-label="Move Day ${i + 1} later" ${i === S.length - 1 ? "disabled" : ""}>↓</button></span></div>
        <div><div class="pchips">${ACT_ORDER.map((a) => `<button class="pchip" data-action="seq-toggle" data-i="${i}" data-a="${a}" aria-pressed="${cur.has(a)}">${ACTS[a].label}</button>`).join("")}</div>
        ${S.length > 1 ? `<button class="linkbtn" data-action="seq-remove" data-i="${i}">Remove Day ${i + 1}</button>` : ""}</div></li>`;
    }).join("")}</ul>
    <div class="row2" style="margin-top:12px"><button class="btn" data-action="seq-add">Add a day</button><button class="btn" data-action="plan-reset">Restore suggested plan</button></div>`;
  } else {
    const startN = e ? n0 + 1 : n0;
    const up = Array.from({ length: Math.min(7, Math.max(seqLen(d), 3)) }, (_, i) => startN + i)
      .map((n, i) => {
        const items = itemsFor(d, n, t), outs = carriedOut(d, n), rw = isRestWeek(d, n, t);
        const when = i === 0 ? (e ? "Next" : "Today") : "Then";
        let b = items.length
          ? `<div class="dchips">${rw ? `<span class="small muted" style="align-self:center">Rest week:</span>` : ""}${items.map((a) => chipFor(n, a, true)).join("")}</div>`
          : `<p class="small muted" style="margin:4px 0 0">${rw ? "Rest week" : "Rest"}</p>`;
        if (outs.length)
          b += `<p class="small muted" style="margin:6px 0 0">${outs.map((c) => `${ACTS[c.a] ? ACTS[c.a].label : c.a} → ${dayLabel(d, c.to)}`).join(", ")}</p>`;
        return `<li class="day${i === 0 && !e ? " today" : ""}"><div class="dname"><b>${dayLabel(d, n)}</b><span>${when}</span></div><div>${b}</div></li>`;
      })
      .join("");
    const recent = d.track.days
      .slice(-5)
      .reverse()
      .map((x) => {
        const its = itemsFor(d, x.n, t);
        return `<li class="day"><div class="dname"><b>Day ${x.idx + 1}</b><span>${shortDate(x.date)}</span></div>
      <div>${its.length ? `<div class="dchips">${its.map((a) => chipFor(x.n, a, false)).join("")}</div>` : `<p class="small muted" style="margin:4px 0 0">Rest</p>`}</div></li>`;
      })
      .join("");
    body = `${programCard()}
    ${st.days ? `<p class="adh"><b>${st.planned ? Math.round((st.done / st.planned) * 100) : 100}%</b> <span class="muted">Last 7 days: ${st.days} training day${st.days === 1 ? "" : "s"} finished, ${st.done} of ${st.planned} sessions done.</span></p>` : ""}
    <h2 style="margin-top:6px">Up next</h2>
    <p class="small muted" style="margin:-4px 0 10px">The rotation only moves forward when you finish a day, so missed days never pile up. Tap a session to push it to a later day.</p>
    <ul class="week">${up}</ul>
    ${recent ? `<h2>Recent</h2><ul class="week">${recent}</ul>` : ""}`;
  }
  return `
  <div class="top"><h1 class="page">Plan</h1>
    <button class="btn" data-action="plan-edit">${state.editPlan ? "Done editing" : "Edit rotation"}</button></div>
  ${body}
  <h2>What each session includes</h2>
  <dl class="guide">
    <dt>Grippers</dt><dd>Prometheus first, then Sisyphus, both hands. Follow each gripper’s next zone on Today. Train fresh, never right after climbing.</dd>
    <dt>Tension board</dt><dd>15 min warm-up on easy problems. 40–50 min on problems near your limit, 3 to 5 attempts each, 3 min rest. Keep both feet on and hold every foot placement for a beat before moving. Finish with 10 min core: hollow holds and hanging knee raises.</dd>
    <dt>Strength A</dt><dd>Goblet or front squat 3×6–8, Romanian deadlift 3×6–8 (straps are fine), push-ups or dumbbell press 3×8–10, overhead press 3×8. Core: ab wheel 3×6–10, dead bug 3×8 each side.</dd>
    <dt>Strength B</dt><dd>Pull-ups 4×4–6, one-arm row 3×8, Bulgarian split squat 3×8 each leg. Core: tuck front lever holds 4×8–10 s, hanging leg raises 3×6–10, Pallof press 3×10 each side.</dd>
    <dt>Open climbing</dt><dd>A freer gym session: projects, volume or climbing with friends. Treat it like a board day for recovery, so no gripper session straight after.</dd>
    <dt>Outdoor climbing</dt><dd>Real rock is usually the hardest climbing day of the week. Skip lifting that day and keep the next day easy if your fingers are worked.</dd>
    <dt>Easy cardio</dt><dd>30–45 min where you can still talk in full sentences. Bike or incline walk, so your forearms get a break.</dd>
    <dt>Mobility</dt><dd>Easy stretching or a walk. Nothing that tires your fingers.</dd>
  </dl>`;
}
