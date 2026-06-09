// Console helpers: a one-time version banner and a gated debug logger. Kept tiny
// and dependency-free so the card, badge and adapters can all share them.

/**
 * Print a styled `%c` banner with the build version, mushroom/pollenprognos
 * style. Callers guard the call so it fires once per instance and only when the
 * user hasn't opted out (`show_version !== false`). `__VERSION__` is injected at
 * build time by Vite (see vite.config.ts).
 */
export function logVersionBanner(name: string): void {
  console.info(
    `%c♨️ ${name}: version ${__VERSION__}`,
    "background:#b3541e;color:#fff;padding:2px 6px;border-radius:3px;font-weight:600;",
  );
}

/**
 * Verbose debug logger, a no-op unless `enabled`. Keeps the `[sauna-card]`
 * prefix used by the existing error/warn logs (controls.ts, i18n.ts) so debug
 * lines are filterable in the console alongside them.
 */
export function dlog(enabled: boolean, ...args: unknown[]): void {
  if (enabled) console.debug("[sauna-card]", ...args);
}
