import { GRIPPERS } from "../defaults";
import { gOf, nextZoneIndex, sortedSessions, zoneIndex } from "../logic/curve";
import { fmtDate } from "../logic/dates";
import { state, today } from "../store";
import { esc, gInfo, gtag, zoneColor } from "./common";

export function viewLog(): string {
  const { sessions, settings } = state.data;
  const zones = settings.zones;
  const all = sortedSessions(sessions).reverse();
  const list = state.logFilter === "all" ? all : all.filter((s) => gOf(s) === state.logFilter);
  const nz = nextZoneIndex(sessions, settings, state.gripper, state.hand);
  const form = `
  <form class="form" id="addForm" ${state.showForm ? "" : "hidden"}>
    <div class="grid">
      <label class="f">Gripper<select name="gripper">${GRIPPERS.map((g) => `<option value="${g.id}"${g.id === state.gripper ? " selected" : ""}>${g.name}</option>`).join("")}</select></label>
      <label class="f">Date<input type="date" name="date" value="${today()}" max="${today()}" required></label>
    </div>
    <div class="grid">
      <label class="f">Hand<select name="hand"><option${state.hand === "LH" ? " selected" : ""}>LH</option><option${state.hand === "RH" ? " selected" : ""}>RH</option></select></label>
      <label class="f">Zone<select name="zone">${zones.map((z, i) => `<option${i === nz ? " selected" : ""}>${esc(z.name)}</option>`).join("")}</select></label>
    </div>
    <div class="grid">
      <label class="f">Weight (lbs)<input name="weight" inputmode="decimal" required></label>
      <span></span>
    </div>
    <div class="grid3">
      <label class="f">Rep 1 (s)<input name="r1" inputmode="numeric" required></label>
      <label class="f">Rep 2 (s)<input name="r2" inputmode="numeric"></label>
      <label class="f">Rep 3 (s)<input name="r3" inputmode="numeric"></label>
    </div>
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
          const i = zoneIndex(settings, s.zone), g = gInfo(gOf(s));
          return `<li class="item">
      <span class="swatch" style="background:${i >= 0 ? zoneColor(i) : "var(--line)"}"></span>
      <div>
        <div class="l1">${gtag(g.id)}${esc(s.zone)} · ${esc(s.hand)} · ${esc(s.weight)} lbs</div>
        <div class="l2">${fmtDate(s.date)} · ${(s.reps || []).map((r) => esc(r) + " s").join(", ")}</div>
      </div>
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
  <p class="small muted" style="margin:0 0 10px">${list.length} session${list.length === 1 ? "" : "s"}</p>
  ${items}`;
}
