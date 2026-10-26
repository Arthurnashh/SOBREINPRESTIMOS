/** Somente destinos internos conhecidos. Normaliza antes de validar para bloquear ../ e barras invertidas. */
export function safeAuthNext(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || /[\\\u0000-\u001f]/.test(value)) return "/conta";
  try {
    const url = new URL(value, "https://internal.invalid");
    if (url.origin !== "https://internal.invalid") return "/conta";
    if (!["/conta", "/admin"].some((root) => url.pathname === root || url.pathname.startsWith(`${root}/`))) return "/conta";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/conta";
  }
}
