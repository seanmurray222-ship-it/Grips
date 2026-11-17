import { GRIPPERS, type GripperInfo } from "../defaults";
import type { Gripper, Hand } from "../types";
import { state } from "../store";

export function esc(s: unknown): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
export const zoneColor = (i: number) => "var(--z" + i + ")";
export const gColor = (id: Gripper) => "var(--g-" + id + ")";
export const gInfo = (id: Gripper): GripperInfo => GRIPPERS.find((g) => g.id === id) || GRIPPERS[0];
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function gtag(id: Gripper): string {
  return `<span class="gtag" style="--gc:${gColor(id)}">${gInfo(id).name}</span>`;
}

export function handSeg(current: Hand, action: string): string {
  return `<div class="seg" role="group" aria-label="Hand">
    ${(["LH", "RH"] as Hand[]).map((h) => `<button data-action="${action}" data-hand="${h}" aria-pressed="${h === current}">${h}</button>`).join("")}
  </div>`;
}

export function gripperSwitch(): string {
  return `<div class="gswitch" role="group" aria-label="Gripper">
    ${GRIPPERS.map(
      (g) => `<button data-action="gripper" data-g="${g.id}" aria-pressed="${g.id === state.gripper}" style="--gc:${gColor(g.id)}">
      <span class="gn">${g.name}</span><span class="gk">${g.kind}, ${g.muscle}</span>
    </button>`,
    ).join("")}
  </div>`;
}
