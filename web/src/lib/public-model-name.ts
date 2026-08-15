/** Public display name. Voice/locale tags stay in admin; this only trims marketing suffixes. */
export function publicModelName(name: string): string {
  if (!/fish/i.test(name)) return name;
  return name.replace(/\s+Free\b/gi, "").replace(/\s+/g, " ").trim();
}
