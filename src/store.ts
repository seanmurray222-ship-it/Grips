import { getAll, putAll } from "./db";
import { DEFAULT_SETTINGS, clone } from "./defaults";
import { emptyTrack, mergeSettings, readTrack } from "./logic/data";
import { todayStr } from "./logic/dates";
import { pruneDone } from "./logic/plan";
import type { Activity, Data, Gripper, Hand, Session } from "./types";

export type View = "today" | "log" | "plan" | "curve" | "settings";

export interface Meta {
  lastExport: number; // ms timestamp, 0 = never
  persisted: boolean | null; // result of navigator.storage.persist()
}

export const state = {
  data: { sessions: [], settings: clone(DEFAULT_SETTINGS), track: emptyTrack() } as Data,
  meta: { lastExport: 0, persisted: null } as Meta,
  gripper: readPref("og-gripper", ["prometheus", "sisyphus"], "prometheus") as Gripper,
  hand: "LH" as Hand,
  curveHand: "LH" as Hand,
  logFilter: "all" as "all" | Gripper,
  view: "today" as View,
  loaded: false,
  error: "",
  /** A new version has taken over but the page is busy, so we offer a reload instead of forcing one. */
  updateReady: false,
  showForm: false,
  editPlan: false,
  editProgram: false,
  /** The open session page, or null. It sits on top of whichever tab opened it. */
  session: null as null | { n: number; a: Activity },
};

export const today = () => todayStr();

function readPref(k: string, ok: string[], d: string): string {
  try {
    const v = localStorage.getItem(k);
    return v && ok.includes(v) ? v : d;
  } catch {
    return d;
  }
}
export function writePref(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode: fine */
  }
}

export async function load(): Promise<void> {
  try {
    const r = await getAll(["sessions", "settings", "track", "meta"]);
    state.data = {
      sessions: Array.isArray(r.sessions) ? (r.sessions as Session[]) : [],
      settings: r.settings && Array.isArray((r.settings as { zones?: unknown }).zones) ? mergeSettings(r.settings) : clone(DEFAULT_SETTINGS),
      track: readTrack(r.track),
    };
    if (r.meta && typeof r.meta === "object") Object.assign(state.meta, r.meta);
  } catch {
    state.error = "Your data couldn’t be loaded from this device. Reopen the app to try again.";
  }
  state.loaded = true;
}

async function put(entries: Record<string, unknown>) {
  try {
    await putAll(entries);
    state.error = "";
  } catch (e) {
    state.error =
      e instanceof DOMException && e.name === "QuotaExceededError"
        ? "Storage is full. Export your data, then delete some old sessions."
        : "Couldn’t save that change. Try again.";
    onError();
  }
}

let onError: () => void = () => {};
export function setErrorHandler(fn: () => void) {
  onError = fn;
}

export const saveSessions = () => put({ sessions: state.data.sessions });
export const saveSettings = () => put({ settings: state.data.settings });
export function saveTrack() {
  state.data.track = pruneDone(state.data, today());
  return put({ track: state.data.track });
}
export const saveMeta = () => put({ meta: state.meta });

/** Replace everything with imported data in one transaction. */
export async function replaceAll(d: Data) {
  state.data = d;
  await put({ sessions: d.sessions, settings: d.settings, track: d.track });
}

/** Ask Android not to evict our data under storage pressure. */
export async function requestPersist() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return;
    let p = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    if (!p) p = await navigator.storage.persist();
    if (p !== state.meta.persisted) {
      state.meta.persisted = p;
      await saveMeta();
    }
  } catch {
    /* not supported */
  }
}
