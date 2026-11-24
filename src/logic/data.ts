import { DEFAULT_SEQ, DEFAULT_SETTINGS, clone, isActivity } from "../defaults";
import type { Data, ExportFile, Session, Settings, Track } from "../types";

/** Fill in defaults and migrate older settings shapes, as the prototype does. */
export function mergeSettings(d: any): Settings {
  const s = Object.assign(clone(DEFAULT_SETTINGS), clone(d || {}));
  s.steps = Object.assign(clone(DEFAULT_SETTINGS.steps), (d && d.steps) || {});
  s.starter = Object.assign(clone(DEFAULT_SETTINGS.starter), (d && d.starter) || {});
  if (d && d.step && !d.steps) {
    s.steps.prometheus = d.step;
    s.steps.sisyphus = d.step;
  }
  delete s.step;
  if (!d || !Array.isArray(d.seq) || !d.seq.length) {
    s.seq =
      d && d.plan && typeof d.plan === "object"
        ? ["1", "2", "3", "4", "5", "6", "0"].map((k) => ((d.plan[k] || []) as unknown[]).filter(isActivity))
        : clone(DEFAULT_SEQ);
  }
  delete s.plan;
  s.program = Object.assign(clone(DEFAULT_SETTINGS.program), (d && d.program) || {});
  delete s.program.postponed;
  delete s.program.moved;
  if (!Array.isArray(s.zones) || !s.zones.length) s.zones = clone(DEFAULT_SETTINGS.zones);
  return s as Settings;
}

export function emptyTrack(): Track {
  return { days: [], carry: [], done: {} };
}

export function readTrack(d: any): Track {
  const t = emptyTrack();
  if (!d || typeof d !== "object") return t;
  if (d.done && typeof d.done === "object")
    Object.keys(d.done).forEach((k) => {
      if (k[0] === "n") t.done[k] = d.done[k];
    });
  if (Array.isArray(d.days)) t.days = clone(d.days as Track["days"]).sort((a, b) => a.n - b.n);
  if (Array.isArray(d.carry)) t.carry = clone(d.carry as Track["carry"]);
  if (d.notes && typeof d.notes === "object") {
    const notes: NonNullable<Track["notes"]> = {};
    Object.keys(d.notes).forEach((k) => {
      const day = d.notes[k];
      if (k[0] !== "n" || !day || typeof day !== "object") return;
      Object.keys(day).forEach((a) => {
        if (isActivity(a) && typeof day[a] === "string" && day[a].trim()) (notes[k] = notes[k] || {})[a] = day[a];
      });
    });
    if (Object.keys(notes).length) t.notes = notes;
  }
  return t;
}

export function uid(): string {
  return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function readSession(s: any): Session | null {
  if (!s || typeof s !== "object") return null;
  if (typeof s.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) return null;
  return {
    id: typeof s.id === "string" && s.id ? s.id : uid(),
    created: Number(s.created) || 0,
    date: s.date,
    gripper: s.gripper === "sisyphus" ? "sisyphus" : "prometheus",
    zone: String(s.zone ?? ""),
    hand: s.hand === "RH" ? "RH" : "LH",
    weight: Number(s.weight) || 0,
    reps: Array.isArray(s.reps) ? s.reps.map((r: unknown) => Number(r) || 0) : [],
  };
}

export class ImportError extends Error {}

/** Parse an export file ({ version, sessions, settings, checks }). Throws ImportError if it isn't one. */
export function parseImport(text: string): Data {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError("That file isn’t valid JSON.");
  }
  const r = raw as any;
  if (!r || typeof r !== "object" || !Array.isArray(r.sessions)) {
    throw new ImportError("That file doesn’t look like an Open Grips export (no sessions list).");
  }
  const sessions = (r.sessions as unknown[]).map(readSession).filter((s): s is Session => !!s);
  const settings = r.settings && Array.isArray(r.settings.zones) ? mergeSettings(r.settings) : clone(DEFAULT_SETTINGS);
  const track = readTrack(r.checks);
  return { sessions, settings, track };
}

export function buildExport(d: Data, now = new Date()): ExportFile {
  return {
    version: 1,
    exportedFrom: "Open Grips Trainer (PWA)",
    exportedAt: now.toISOString(),
    sessions: clone(d.sessions),
    settings: clone(d.settings),
    checks: clone(d.track),
  };
}

