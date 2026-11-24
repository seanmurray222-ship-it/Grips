import { ACTS, GRIPPERS } from "../defaults";
import { fit, nextZoneIndex, otherHand, recentTrend, sessionCount, suggest, zoneCounts } from "../logic/curve";
import {
  activeN,
  canMoveBack,
  carriedIn,
  carriedOut,
  climbFor,
  dayLabel,
  gripAutoN,
  gripStatusN,
  isDoneN,
  isRestWeek,
  itemsFor,
  nextFreeN,
  noteFor,
  programInfo,
  seqLen,
  todayEntry,
} from "../logic/plan";
import { state, today } from "../store";
import type { Activity, Hand } from "../types";
import { esc, gColor, gInfo, gripperSwitch, gtag, handSeg, zoneColor } from "./common";
import { programLabel } from "./plan";

function itemActions(n: number, a: Activity): string {
  const d = state.data, t = today();
  const ci = carriedIn(d, n, a);
  if (ci)
    return canMoveBack(d, n, a)
      ? `<div class="ck-m">Pushed from ${dayLabel(d, ci.from)}. <button class="linkbtn" data-action="move-back" data-n="${n}" data-a="${a}">Move back</button></div>`
      : `<div class="ck-m">Pushed from ${dayLabel(d, ci.from)}.</div>`;
  if (isDoneN(d, n, a, t)) return "";
  return `<div class="ck-m"><button class="linkbtn" data-action="postpone" data-n="${n}" data-a="${a}">Push to ${dayLabel(d, nextFreeN(d, n, a, t))}</button></div>`;
}

/**
 * One checklist row. The box ticks it off in one tap; the rest of the row opens the session page
 * (what it includes, the done tick and a note).
 */
function planItem(n: number, a: Activity, interactive: boolean): string {
  const d = state.data, t = today();
  const on = isDoneN(d, n, a, t);
  const note = noteFor(d, n, a);
  const notePreview = note ? `<span class="ck-note">✎ ${esc(note)}</span>` : "";
  const label = ACTS[climbFor(d, n, a)].label;
  let detail: string;
  // Grippers tick themselves from logged sessions; until then they can be ticked by hand.
  const auto = a === "grip" && gripAutoN(d, n, t);
  if (a === "grip") {
    const st = gripStatusN(d, n, t);
    detail = `<span class="ck-d">${GRIPPERS.map(
      (g) => `<span class="gstat">${gtag(g.id)}${(["LH", "RH"] as Hand[]).map((h) => (st[g.id].has(h) ? h + " ✓" : h + " –")).join("  ")}</span>`,
    ).join("")}</span>
      <span class="ck-d">${auto ? "Ticked itself from your logged sessions." : on ? "Ticked by hand." : "Ticks itself when you log a session on each gripper, or tick it by hand."}</span>`;
  } else {
    detail = `<span class="ck-d">${ACTS[climbFor(d, n, a)].desc}</span>`;
  }
  const box =
    interactive && !auto
      ? `<button class="box${on ? " on" : ""}" data-action="check" data-n="${n}" data-a="${a}" aria-pressed="${on}" aria-label="${on ? "Unmark" : "Mark"} ${label} done">${on ? "✓" : ""}</button>`
      : `<span class="box${on ? " on" : ""}" aria-hidden="true">${on ? "✓" : ""}</span>`;
  const open = `<button class="ck-open" data-action="open-session" data-n="${n}" data-a="${a}" aria-label="${label}${on ? ", done" : ""}${note ? ", has a note" : ""}. Open session details and notes.">
      <span class="ck-text"><span class="ck-l">${label}</span>${detail}${notePreview}</span>
      <span class="ck-go" aria-hidden="true">›</span>
    </button>`;
  return `<li class="ck">${box}<div>${open}${interactive ? itemActions(n, a) : ""}</div></li>`;
}

function todayPlanCard(): string {
  const d = state.data, t = today();
  const e = todayEntry(d, t), n = activeN(d, t), info = programInfo(d, n, t), items = itemsFor(d, n, t);
  const sub = info ? programLabel(info) : `${seqLen(d)}-day rotation`;
  const head = `<div class="pt-head"><b>${e ? "Finished" : "Today"}: ${dayLabel(d, n)}</b><span class="small muted">${esc(sub)}</span></div>`;
  const rest = isRestWeek(d, n, t);
  const restNote = rest
    ? `<p class="small muted" style="margin:0 0 10px">Rest week for climbing, lifting and cardio. The grippers keep going.</p>`
    : "";
  const outs = carriedOut(d, n);
  const outNote = outs.length
    ? `<p class="small muted" style="margin:10px 0 0">${outs.map((c) => `${ACTS[c.a] ? ACTS[c.a].label : c.a} pushed to ${dayLabel(d, c.to)}.`).join(" ")}</p>`
    : "";
  const list = items.length
    ? `<ul class="checks">${items.map((a) => planItem(n, a, !e)).join("")}</ul>`
    : `<p class="small muted" style="margin:0">${rest ? "No gripper session on this day." : "Rest day in the rotation."}</p>`;
  const foot = e
    ? `<div class="pt-foot"><span class="small muted">Next time you train: ${dayLabel(d, n + 1)}.</span><button class="linkbtn" data-action="undo-finish">Undo</button></div>`
    : `<div class="pt-foot"><button class="btn" data-action="finish-day">Finish ${dayLabel(d, n)}</button><span class="small muted">Skipped a day? The plan waits until you finish this one.</span></div>`;
  return `<section class="plan-today${rest ? " rest" : ""}" aria-label="Today’s plan">${head}${restNote}${list}${outNote}${foot}</section>`;
}

export function viewToday(): string {
  const { sessions, settings } = state.data;
  const g = state.gripper, gi = gInfo(g), hand = state.hand;
  const zi = nextZoneIndex(sessions, settings, g, hand), z = settings.zones[zi];
  const f = fit(sessions, g, hand);
  const sg = suggest(sessions, settings, g, hand, zi), w = sg ? sg.w : null;
  const oh = otherHand(hand);
  const ahead = sessionCount(sessions, g, hand) > sessionCount(sessions, g, oh);
  const pairNote = ahead
    ? `<div class="pairnote"><p>${hand} is a session ahead on ${gi.name}. ${oh} still has <b>${esc(settings.zones[nextZoneIndex(sessions, settings, g, oh)].name)}</b> to do, so do that next to keep both hands in step.</p><button class="btn" data-action="hand" data-hand="${oh}">Switch to ${oh}</button></div>`
    : "";
  const counts = zoneCounts(sessions, settings, g, hand);
  const tr = recentTrend(sessions, g, hand, f);
  let trendHtml = "";
  if (tr) {
    const word = tr.pct > 0 ? "above" : tr.pct < 0 ? "below" : "on";
    trendHtml = `<div class="trend"><b>${tr.pct > 0 ? "+" : ""}${tr.pct}%</b><span class="muted">Your last ${tr.n} ${gi.name} ${hand} holds were ${Math.abs(tr.pct)}% ${word} what this curve predicts.</span></div>`;
  }
  const other = GRIPPERS.find((x) => x.id !== g)!;
  const ozi = nextZoneIndex(sessions, settings, other.id, hand);
  const osg = suggest(sessions, settings, other.id, hand, ozi);
  const ow = osg ? osg.w + " lbs" + (osg.src === "starter" ? " (starter)" : "") : "no curve yet";
  const howto =
    w === null || !sg
      ? `Log at least 2 ${gi.name} ${hand} sessions at different weights to get a suggested weight. Until then, pick a weight you can hold for about ${z.target} s.`
      : sg.src === "starter"
        ? `Starter weight from your V5 estimate. Hold until the weight drops and rest ${settings.rest} s between reps. ${
            sg.left
              ? `Your curve takes over after ${sg.left} more ${gi.name} ${hand} session${sg.left === 1 ? "" : "s"}.`
              : `Log sessions at a few different weights so your curve can take over.`
          }`
        : `From your force curve. Hold until the weight drops. Rest ${settings.rest} s between reps.`;
  return `
  ${todayPlanCard()}
  ${gripperSwitch()}
  <section class="next" aria-labelledby="nz">
    <div class="next-head">
      <span class="small muted">Next ${gi.name} session</span>
      ${handSeg(hand, "hand")}
    </div>
    <h1 class="zone-name" id="nz" style="color:${zoneColor(zi)}">${esc(z.name)}</h1>
    <div class="figs">
      <div class="fig"><b>${w !== null ? w : "–"}</b><span>${sg && sg.src === "starter" ? "lbs, starter" : "lbs"}</span></div>
      <div class="fig"><b>${z.target}</b><span>target seconds</span></div>
      <div class="fig"><b>${z.reps}</b><span>reps max</span></div>
    </div>
    ${pairNote}
    <button class="btn ${ahead ? "" : "primary "}block" data-action="start">${
      ahead ? `Start ${gi.name} ${hand} ${esc(z.name)} anyway` : `Start ${gi.name} ${hand} session`
    }</button>
    <p class="howto">${howto}</p>
    ${trendHtml}
  </section>
  <p class="small muted" style="margin:12px 2px 0"><span class="gtag" style="--gc:${gColor(other.id)}">${other.name}</span>Next: ${esc(settings.zones[ozi].name)}, ${ow}.</p>
  <h2>${gi.name} ${hand} zone balance</h2>
  <p class="small muted" style="margin:-4px 0 12px">Sessions logged in each zone on ${gi.name}, ${hand}. Each hand has its own rotation; the least-trained zone is due next.</p>
  <div class="ladder">
    ${settings.zones
      .map(
        (zz, i) => `
      <div class="rung${i === zi ? " due" : ""}">
        <div class="bar" style="background:${zoneColor(i)}"></div>
        <div class="n">${counts[i]}</div>
        <span class="l">${esc(zz.name).replace("/", "/&#8203;")}</span>
      </div>`,
      )
      .join("")}
  </div>`;
}
