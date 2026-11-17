import { handAfterSave, nextZoneIndex, stepFor, suggest } from "../logic/curve";
import { uid } from "../logic/data";
import { saveSessions, state, today } from "../store";
import type { Gripper, Hand } from "../types";
import { gInfo, gtag, zoneColor } from "./common";

type Phase = "ready" | "hold" | "rest" | "done";

export const T = {
  open: false,
  phase: "ready" as Phase,
  startAt: 0,
  restEnd: 0,
  reps: [] as number[],
  zi: 0,
  hand: "LH" as Hand,
  gripper: "prometheus" as Gripper,
  raf: 0,
  buzzed: false,
  wake: null as WakeLockSentinel | null,
};

const CIRC = 2 * Math.PI * 88;
const $ = (id: string) => document.getElementById(id)!;
const weightInput = () => $("tWeight") as HTMLInputElement;

/* ---------- Hardware: sound, vibration, wake lock ---------- */

let audioCtx: AudioContext | null = null;
/** Create/resume the audio context from a tap so later beeps are allowed. */
function unlockAudio() {
  try {
    audioCtx = audioCtx || new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
  } catch {
    /* no audio */
  }
}
function beep(freq: number, ms: number) {
  try {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator(), gn = audioCtx.createGain();
    o.frequency.value = freq;
    o.connect(gn);
    gn.connect(audioCtx.destination);
    gn.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + ms / 1000);
    o.start();
    o.stop(audioCtx.currentTime + ms / 1000);
  } catch {
    /* no audio */
  }
}
function buzz(p: number | number[]) {
  try {
    if (navigator.vibrate) navigator.vibrate(p);
  } catch {
    /* no vibration */
  }
}
async function wakeOn() {
  try {
    if ("wakeLock" in navigator && !T.wake) {
      T.wake = await navigator.wakeLock.request("screen");
      T.wake.addEventListener("release", () => {
        T.wake = null;
      });
    }
  } catch {
    /* denied or unsupported */
  }
}
function wakeOff() {
  try {
    if (T.wake) void T.wake.release();
  } catch {
    /* already released */
  }
  T.wake = null;
}
/** The wake lock is dropped whenever the page is hidden; take it back when we return. */
export function onVisible() {
  if (T.open) {
    void wakeOn();
    if (T.phase === "hold" || T.phase === "rest") tick();
  }
}

/* ---------- Timer screen ---------- */

let rerender: () => void = () => {};
export function setRerender(fn: () => void) {
  rerender = fn;
}

export function openTimer() {
  const { sessions, settings } = state.data;
  const g = state.gripper, zi = nextZoneIndex(sessions, settings, g, state.hand);
  Object.assign(T, { open: true, phase: "ready", reps: [], zi, hand: state.hand, gripper: g, buzzed: false });
  const sg = suggest(sessions, settings, g, state.hand, zi);
  weightInput().value = sg ? String(sg.w) : "";
  $("timer").hidden = false;
  document.body.classList.add("timer-open");
  unlockAudio();
  void wakeOn();
  renderTimer();
}

export function closeTimer() {
  cancelAnimationFrame(T.raf);
  T.open = false;
  wakeOff();
  $("timer").hidden = true;
  document.body.classList.remove("timer-open");
  rerender();
}

const zoneT = () => state.data.settings.zones[T.zi];

function setRing(frac: number, color: string) {
  const fg = $("ringFg") as unknown as SVGCircleElement;
  fg.style.strokeDasharray = String(CIRC);
  fg.style.strokeDashoffset = String(CIRC * (1 - Math.max(0, Math.min(1, frac))));
  fg.style.stroke = color;
}

export function renderTimer() {
  const z = zoneT(), maxR = Number(z.reps) || 1, gi = gInfo(T.gripper);
  $("tZone").textContent = z.name;
  $("tZone").style.color = zoneColor(T.zi);
  $("tSub").innerHTML = `${gtag(gi.id)}${T.hand} · target ${z.target} s · up to ${maxR} rep${maxR === 1 ? "" : "s"}`;
  const chips: string[] = [];
  for (let i = 0; i < maxR; i++) {
    chips.push(
      T.reps[i] !== undefined
        ? `<span class="chip">Rep ${i + 1} <b>${T.reps[i]} s</b></span>`
        : `<span class="chip empty">Rep ${i + 1}</span>`,
    );
  }
  $("tReps").innerHTML = chips.join("");
  const big = $("tBig"), under = $("tUnder"), acts = $("tActions");
  const canSave = T.reps.length > 0;
  $("timer").dataset.phase = T.phase;
  if (T.phase === "ready") {
    big.textContent = "0";
    under.textContent = T.reps.length ? `Rep ${T.reps.length + 1}. Load up and start when ready.` : "Load up and start when ready.";
    setRing(0, zoneColor(T.zi));
    acts.innerHTML = `<button class="btn primary go" data-action="t-start">Start rep ${T.reps.length + 1}</button>
      ${canSave ? `<button class="btn" data-action="t-save">Finish and save session</button>` : ""}`;
  } else if (T.phase === "hold") {
    under.textContent = "Hold until the weight drops";
    acts.innerHTML = `<button class="btn go hold" data-action="t-drop">Weight dropped</button>`;
  } else if (T.phase === "rest") {
    acts.innerHTML = `<button class="btn go" data-action="t-skip">Start next rep now</button>
      <button class="btn" data-action="t-save">Finish and save session</button>`;
  } else {
    big.textContent = "✓";
    under.textContent = `${T.reps.length} rep${T.reps.length === 1 ? "" : "s"} done`;
    setRing(1, "var(--accent)");
    acts.innerHTML = `<button class="btn primary go" data-action="t-save">Save session</button>
      <button class="btn danger" data-action="t-discard">Discard session</button>`;
  }
  tick();
}

function tick() {
  cancelAnimationFrame(T.raf);
  const big = $("tBig"), under = $("tUnder"), z = zoneT();
  if (T.phase === "hold") {
    const el = (Date.now() - T.startAt) / 1000;
    big.textContent = String(Math.floor(el));
    const over = el >= z.target;
    setRing(el / z.target, over ? "var(--accent)" : zoneColor(T.zi));
    if (over && !T.buzzed) {
      T.buzzed = true;
      buzz([120, 80, 120]);
      beep(880, 160);
      under.textContent = "Target reached. Keep holding.";
    }
    T.raf = requestAnimationFrame(tick);
  } else if (T.phase === "rest") {
    const rest = Number(state.data.settings.rest) || 20;
    const left = Math.ceil((T.restEnd - Date.now()) / 1000);
    if (left <= 0) {
      T.phase = "ready";
      buzz(200);
      beep(660, 220);
      renderTimer();
      return;
    }
    big.textContent = String(left);
    under.textContent = "Rest";
    setRing(left / rest, "var(--muted)");
    T.raf = requestAnimationFrame(tick);
  }
}

const currentWeight = () => Number(String(weightInput().value).replace(",", "."));

export function tStart() {
  if (!(currentWeight() > 0)) {
    weightInput().focus();
    $("tUnder").textContent = "Enter the weight first.";
    return;
  }
  unlockAudio();
  beep(520, 90);
  T.phase = "hold";
  T.startAt = Date.now();
  T.buzzed = false;
  renderTimer();
}

export function tDrop() {
  T.reps.push(Math.round((Date.now() - T.startAt) / 1000));
  const maxR = Number(zoneT().reps) || 1;
  if (T.reps.length >= maxR) T.phase = "done";
  else {
    T.phase = "rest";
    T.restEnd = Date.now() + (Number(state.data.settings.rest) || 20) * 1000;
  }
  renderTimer();
}

export function tSkip() {
  T.phase = "ready";
  renderTimer();
}

export function tSave() {
  if (!T.reps.length) return;
  const w = currentWeight();
  if (!(w > 0)) {
    $("tUnder").textContent = "Enter the weight before saving.";
    return;
  }
  state.data.sessions = state.data.sessions.concat([
    { id: uid(), created: Date.now(), date: today(), gripper: T.gripper, zone: zoneT().name, hand: T.hand, weight: w, reps: T.reps.slice() },
  ]);
  state.gripper = T.gripper;
  state.hand = handAfterSave(state.data.sessions, T.gripper, T.hand);
  void saveSessions();
  closeTimer();
}

export function stepWeight(dir: 1 | -1) {
  const st = stepFor(state.data.settings, T.gripper), inp = weightInput();
  const v = (Number(String(inp.value).replace(",", ".")) || 0) + dir * st;
  inp.value = String(Math.max(0, Math.round(v * 100) / 100));
}
