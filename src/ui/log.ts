import { GRIPPERS } from "../defaults";
import { gOf, nextZoneIndex, sortedSessions, zoneIndex } from "../logic/curve";
import { fmtDate } from "../logic/dates";
import { state, today } from "../store";
import type { Session } from "../types";
import { esc, gInfo, gtag, zoneColor } from "./common";

/** The fields shared by "Add a past session" and editing a logged one. */
function sessionFields(v: Partial<Session>): string {
  const zones = state.data.settings.zones;
  const zoneKnown = zones.some((z) => z.name === v.zone);
  const reps = v.reps || [];
  const nReps = Math.max(3, reps.length);
  const repInputs = Array.from({ length: nReps }, (_, i) =>
    `<label class="f">Rep ${i + 1} (s)<input name="r${i + 1}" value="${reps[i] ? esc(reps[i]) : ""}" inputmode="numeric"${i === 0 ? " required" : ""}></label>`,
  ).join("");
  return `
    <div class="grid">
      <label class="f">Gripper<select name="gripper">${GRIPPERS.map((g) => `<option value="${g.id}"${g.id === v.gripper ? " selected" : ""}>${g.name}</option>`).join("")}</select></label>
      <label class="f">Date<input type="date" name="date" value="${esc(v.date || today())}" max="${today()}" required></label>
    </div>
    <div class="grid">
      <label class="f">Hand<select name="hand"><option${v.hand === "LH" ? " selected" : ""}>LH</option><option${v.hand === "RH" ? " selected" : ""}>RH</option></select></label>
      <label class="f">Zone<select name="zone">${zoneKnown ? "" : `<option selected>${esc(v.zone || "")}</option>`}${zones.map((z) => `<option${z.name === v.zone ? " selected" : ""}>${esc(z.name)}</option>`).join("")}</select></label>
    </div>
    <div class="grid">
      <label class="f">Weight (lbs)<input name="weight" value="${v.weight ? esc(v.weight) : ""}" inputmode="decimal" required></label>
      <span></span>
    </div>
    <div class="grid3">${repInputs}</div>`;
}

function editRow(s: Session): string {
  const g = gInfo(gOf(s));
  return `<li class="item editing">
    <form class="form edit-form" id="editForm" data-id="${esc(s.id)}" aria-label="Edit ${g.name} session from ${esc(fmtDate(s.date))}">
      <h2 class="sub">Edit session</h2>
      ${sessionFields(s)}
      <div class="row2">
        <button type="button" class="btn" data-action="edit-cancel">Cancel</button>
        <button type="submit" class="btn primary">Save changes</button>
      </div>
      <button type="button" class="linkbtn danger-link" data-action="del" data-id="${esc(s.id)}">Delete this session</button>
    </form>
  </li>`;
}

export function viewLog(): string {
  const { sessions, settings } = state.data;
  const zones = settings.zones;
  const all = sortedSessions(sessions).reverse();
  const list = state.logFilter === "all" ? all : all.filter((s) => gOf(s) === state.logFilter);
  const nz = nextZoneIndex(sessions, settings, state.gripper, state.hand);
  const form = `
  <form class="form" id="addForm" ${state.showForm ? "" : "hidden"}>
    ${sessionFields({ gripper: state.gripper, hand: state.hand, zone: zones[nz] && zones[nz].name, date: today() })}
    <div class="row2">
      <button type="button" class="btn" data-action="form-cancel">Cancel</button>
      <button type="submit" class="btn primary">Save session</button>
    </div>
  </form>`;
  const filters = `<div class="filters" role="group" aria-label="Show sessions from">
    ${[{ id: "all", name: "All" }, ...GRIPPERS]
      .map((g) => `<button data-action="log-filter" data-g="${g.id}" aria-pressed="${state.logFilter === g.id}">${g.name}</button>`)
      .join("")}
  </div>`;
  const items = list.length
    ? `<ul class="list">${list
        .map((s) => {
          if (state.editSession === s.id) return editRow(s);
          const i = zoneIndex(settings, s.zone), g = gInfo(gOf(s));
          return `<li class="item">
      <button class="item-open" data-action="edit-session" data-id="${esc(s.id)}" aria-label="Edit ${g.name} ${esc(s.hand)} ${esc(s.zone)} session from ${esc(fmtDate(s.date))}: ${esc(s.weight)} lbs, ${(s.reps || []).map((r) => esc(r) + " s").join(", ")}">
        <span class="swatch" style="background:${i >= 0 ? zoneColor(i) : "var(--line)"}"></span>
        <span class="item-text">
          <span class="l1">${gtag(g.id)}${esc(s.zone)} · ${esc(s.hand)} · ${esc(s.weight)} lbs</span>
          <span class="l2">${fmtDate(s.date)} · ${(s.reps || []).map((r) => esc(r) + " s").join(", ")}</span>
        </span>
      </button>
      <button class="del" data-action="del" data-id="${esc(s.id)}" aria-label="Delete ${g.name} session from ${esc(fmtDate(s.date))}">Delete</button>
    </li>`;
        })
        .join("")}</ul>`
    : `<div class="empty-state">No ${state.logFilter === "all" ? "" : gInfo(state.logFilter).name + " "}sessions yet. Start one from Today, or add a past session above.</div>`;
  return `
  <div class="top"><h1 class="page">Log</h1>
    ${state.showForm ? "" : `<button class="btn" data-action="form-open">Add a past session</button>`}</div>
  ${form}
  ${filters}
  <p class="small muted" style="margin:0 0 10px">${list.length} session${list.length === 1 ? "" : "s"}${list.length ? ". Tap one to edit it." : ""}</p>
  ${items}`;
}
