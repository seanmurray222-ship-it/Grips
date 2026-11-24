import { GRIPPERS } from "../defaults";
import { stepFor } from "../logic/curve";
import { state } from "../store";
import { esc, plural, zoneColor } from "./common";

const DAY = 864e5;

export function exportReminderDue(now = Date.now()): boolean {
  const { sessions } = state.data;
  if (!sessions.length) return false;
  return !state.meta.lastExport || now - state.meta.lastExport > 30 * DAY;
}

function dataCard(): string {
  const { sessions } = state.data;
  const last = state.meta.lastExport;
  const lastTxt = last
    ? `Last export: ${new Date(last).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}.`
    : "Not exported from this app yet.";
  const remind = exportReminderDue()
    ? `<div class="notice">${last ? "It’s been over 30 days since your last export." : "You haven’t backed up yet."} Export a copy and keep it somewhere safe, like Google Drive.</div>`
    : "";
  const persist =
    state.meta.persisted === true
      ? "Android won’t clear this data to free up space."
      : state.meta.persisted === false
        ? "Android may clear this data if the phone runs low on space. Installing the app to the home screen helps."
        : "";
  return `<section class="form" aria-labelledby="dataH">
    <h2 id="dataH" class="sub">Your data</h2>
    ${remind}
    <p class="small muted" style="margin:0">${plural(sessions.length, "session")} stored on this device only. ${lastTxt} ${persist}</p>
    <div class="row2">
      <button type="button" class="btn primary" data-action="export">Export</button>
      <button type="button" class="btn" data-action="import">Import</button>
    </div>
    <input type="file" id="importFile" accept="application/json,.json" hidden>
    <p class="small muted" style="margin:0">Export saves everything (sessions, settings, rotation and plan progress) as one JSON file. Import replaces what’s on this device with a file you exported earlier.</p>
  </section>`;
}

export function viewSettings(): string {
  const s = state.data.settings;
  return `
  <h1 class="page" style="margin:4px 0 14px">Settings</h1>
  ${dataCard()}
  <form id="setForm" class="form zones-edit">
    <h2 class="sub">Zones</h2>
    <p class="small muted" style="margin:0">Zones apply to both grippers. Times in seconds.</p>
    ${s.zones
      .map(
        (z, i) => `<fieldset class="zrow">
      <legend><span class="dot" style="background:${zoneColor(i)}"></span>${esc(z.name)}</legend>
      <label class="f">From<input name="b${i}" value="${z.bottom}" inputmode="numeric"></label>
      <label class="f">To<input name="t${i}" value="${z.top}" inputmode="numeric"></label>
      <label class="f">Target<input name="g${i}" value="${z.target}" inputmode="numeric"></label>
      <label class="f">Reps<input name="r${i}" value="${z.reps}" inputmode="numeric"></label>
    </fieldset>`,
      )
      .join("")}
    <div class="grid">
      <label class="f">Rest between reps (s)<input name="rest" value="${s.rest}" inputmode="numeric"></label>
      <label class="f">1RM hold time (s)<input name="onerm" value="${s.oneRMTime}" inputmode="numeric"></label>
    </div>
    <div class="grid">
      ${GRIPPERS.map((g) => `<label class="f">${g.name} weight step (lbs)<input name="step-${g.id}" value="${stepFor(s, g.id)}" inputmode="decimal"></label>`).join("")}
    </div>
    <h2 class="sub">Starter weights</h2>
    <p class="small muted" style="margin:0">Suggested for the first sessions on each gripper and hand, before your curve has enough data. Set a weight to 0 to skip it.</p>
    <table>
      <thead><tr><th>Zone</th>${GRIPPERS.map((g) => `<th class="num">${g.name}</th>`).join("")}</tr></thead>
      <tbody>${s.zones
        .map(
          (z, i) =>
            `<tr><td><span class="dot" style="background:${zoneColor(i)}"></span>${esc(z.name)}</td>${GRIPPERS.map(
              (g) =>
                `<td><input name="st-${g.id}-${i}" value="${(s.starter && s.starter[g.id] && s.starter[g.id][i]) || 0}" inputmode="decimal" aria-label="${g.name} ${esc(z.name)} starter weight, lbs"></td>`,
            ).join("")}</tr>`,
        )
        .join("")}</tbody>
    </table>
    <label class="f">Use starter weights for the first this many sessions on each hand<input name="startercount" value="${s.starterCount}" inputmode="numeric"></label>
    <div class="row2">
      <button type="button" class="btn" data-action="reset-settings">Restore defaults</button>
      <button type="submit" class="btn primary">Save settings</button>
    </div>
  </form>
  <p class="small muted">Open Grips Trainer ${__APP_VERSION__}, built ${__BUILD__}. Works offline. No account, no server. The app updates itself when a new version is out.</p>`;
}
