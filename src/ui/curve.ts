import { fit, gOf, predictTime, roundStep, weightFor, zoneIndex } from "../logic/curve";
import { state } from "../store";
import { esc, gInfo, gripperSwitch, handSeg, zoneColor } from "./common";

export function viewCurve(): string {
  const { sessions, settings } = state.data;
  const g = state.gripper, gi = gInfo(g), hand = state.curveHand, f = fit(sessions, g, hand), zones = settings.zones;
  const pts = sessions.filter((s) => gOf(s) === g && s.hand === hand && s.weight > 0 && s.reps && s.reps[0] > 0);
  const oneRM = f ? roundStep(settings, weightFor(f, settings.oneRMTime), g) : null;
  const yMax = Math.ceil((Math.max(...zones.map((z) => z.top), ...pts.map((p) => p.reps[0])) * 1.06) / 20) * 20;
  const wMax = Math.max(20, ...pts.map((p) => Number(p.weight)), oneRM || 0);
  const xMax = Math.ceil((wMax * 1.15) / 10) * 10;
  const W = 340, H = 250, L = 36, R = 10, Tp = 10, B = 30;
  const sx = (w: number) => L + (w / xMax) * (W - L - R);
  const sy = (t: number) => Tp + (1 - t / yMax) * (H - Tp - B);
  let svg = "";
  zones.forEach((z, i) => {
    const y1 = sy(Math.min(z.top, yMax)), y2 = sy(z.bottom);
    svg += `<rect x="${L}" y="${y1}" width="${W - L - R}" height="${Math.max(0, y2 - y1)}" fill="${zoneColor(i)}" opacity=".14"/>`;
  });
  for (let t = 0; t <= yMax; t += yMax > 200 ? 60 : 20) {
    svg += `<line x1="${L}" x2="${W - R}" y1="${sy(t)}" y2="${sy(t)}" stroke="var(--line)" stroke-width=".6"/><text x="${L - 5}" y="${sy(t) + 3}" text-anchor="end">${t}</text>`;
  }
  const xStep = xMax > 150 ? 50 : xMax > 60 ? 20 : 10;
  for (let w = 0; w <= xMax; w += xStep) {
    svg += `<text x="${sx(w)}" y="${H - B + 14}" text-anchor="middle">${w}</text>`;
  }
  svg += `<text x="${(L + W - R) / 2}" y="${H - 2}" text-anchor="middle">Weight (lbs)</text>`;
  svg += `<text x="10" y="${(Tp + H - B) / 2}" text-anchor="middle" transform="rotate(-90 10 ${(Tp + H - B) / 2})">Rep 1 (s)</text>`;
  if (f) {
    let d = "", started = false;
    for (let i = 0; i <= 120; i++) {
      const w = Math.max(0.5, (xMax * i) / 120), t = predictTime(f, w);
      if (t > yMax) {
        started = false;
        continue;
      }
      d += (started ? "L" : "M") + sx(w).toFixed(1) + " " + sy(t).toFixed(1) + " ";
      started = true;
    }
    svg += `<path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>`;
  }
  pts.forEach((p) => {
    const i = zoneIndex(settings, p.zone);
    svg += `<circle cx="${sx(p.weight)}" cy="${sy(Math.min(p.reps[0], yMax))}" r="4.5" fill="${i >= 0 ? zoneColor(i) : "var(--muted)"}" stroke="var(--surface)" stroke-width="1.5"/>`;
  });
  const table = f
    ? `<table>
      <thead><tr><th>Zone</th><th class="num">Target</th><th class="num">Weight</th></tr></thead>
      <tbody>${zones.map((z, i) => `<tr><td><span class="dot" style="background:${zoneColor(i)}"></span>${esc(z.name)}</td><td class="num">${z.target} s</td><td class="num">${roundStep(settings, weightFor(f, z.target), g)} lbs</td></tr>`).join("")}
      <tr><td><b>Estimated 1RM</b> <span class="muted small">(${settings.oneRMTime} s hold)</span></td><td></td><td class="num"><b>${oneRM} lbs</b></td></tr></tbody>
    </table>`
    : `<div class="empty-state">Log at least 2 ${gi.name} ${hand} sessions at different weights to draw this curve.</div>`;
  return `
  ${gripperSwitch()}
  <div class="top"><h1 class="page">${gi.name} curve</h1>${handSeg(hand, "curve-hand")}</div>
  <div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${gi.name} ${hand} force curve: rep 1 hold time against weight, with zone bands">${svg}</svg></div>
  <p class="small muted">Each dot is a ${gi.name} session’s first rep, colored by zone. The line is the fitted curve (time = a × weight<sup>b</sup>)${f ? `, from ${f.n} sessions` : ""}. Each gripper has its own curve.</p>
  <h2>Weights for each zone</h2>
  ${table}`;
}
