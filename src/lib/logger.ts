import {
  error as tauriError,
  warn as tauriWarn,
  info as tauriInfo,
  debug as tauriDebug,
} from "@tauri-apps/plugin-log";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function error(message: string, ...args: unknown[]): void {
  const full = args.length > 0 ? `${message} ${args.map(String).join(" ")}` : message;
  console.error(full);
  if (isTauri()) tauriError(full).catch(() => {});
}

export function warn(message: string, ...args: unknown[]): void {
  const full = args.length > 0 ? `${message} ${args.map(String).join(" ")}` : message;
  console.warn(full);
  if (isTauri()) tauriWarn(full).catch(() => {});
}

export function info(message: string, ...args: unknown[]): void {
  const full = args.length > 0 ? `${message} ${args.map(String).join(" ")}` : message;
  console.info(full);
  if (isTauri()) tauriInfo(full).catch(() => {});
}

export function debug(message: string, ...args: unknown[]): void {
  const full = args.length > 0 ? `${message} ${args.map(String).join(" ")}` : message;
  console.debug(full);
  if (isTauri()) tauriDebug(full).catch(() => {});
}
