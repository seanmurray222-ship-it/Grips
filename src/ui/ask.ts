/* In-app confirmation sheet. Native confirm()/alert() can be blocked and silently answer "no". */

let askFn: (() => void) | null = null;
let askReturn: Element | null = null;
const $ = (id: string) => document.getElementById(id)!;

export function ask(msg: string, okLabel: string, fn: (() => void) | null, danger = false) {
  askFn = fn;
  askReturn = document.activeElement;
  $("askMsg").textContent = msg;
  $("askCancel").hidden = false;
  const ok = $("askOk");
  ok.textContent = okLabel || "OK";
  ok.className = "btn " + (danger ? "danger-fill" : "primary");
  $("ask").hidden = false;
  (ok as HTMLButtonElement).focus();
}

export function notify(msg: string) {
  ask(msg, "OK", null);
  $("askCancel").hidden = true;
}

export function closeAsk(run: boolean) {
  const fn = askFn;
  askFn = null;
  $("ask").hidden = true;
  if (askReturn instanceof HTMLElement) {
    try {
      askReturn.focus();
    } catch {
      /* element gone */
    }
  }
  if (run && fn) fn();
}

export const askOpen = () => !$("ask").hidden;
