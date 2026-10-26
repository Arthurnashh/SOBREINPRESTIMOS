// Estado descartável da demonstração. Nunca representa dinheiro ou conta reais.
export const DEMO_BALANCE_CENTS = 425000;
export const DEMO_COOKIE = "demo-wallet-v1";

export type DemoTransfer = { id: string; date: string; cents: number };
export type DemoState = { owner: string; spent: number; transfers: DemoTransfer[] };

export function readDemoState(raw: string | undefined, owner: string): DemoState {
  const empty = { owner, spent: 0, transfers: [] };
  try {
    const state = JSON.parse(raw ?? "null") as DemoState | null;
    if (
      !state || state.owner !== owner ||
      !Number.isSafeInteger(state.spent) || state.spent < 0 || state.spent > DEMO_BALANCE_CENTS ||
      !Array.isArray(state.transfers) || state.transfers.length > 8 ||
      !state.transfers.every((t) =>
        t && typeof t.id === "string" && /^DEMO-[0-9a-f-]{36}$/.test(t.id) &&
        typeof t.date === "string" && t.date.length <= 30 && Number.isFinite(Date.parse(t.date)) &&
        Number.isSafeInteger(t.cents) && t.cents > 0 && t.cents <= state.spent
      ) ||
      state.transfers.reduce((sum, t) => sum + t.cents, 0) > state.spent
    ) return empty;
    return { owner, spent: state.spent, transfers: state.transfers.map(({ id, date, cents }) => ({ id, date, cents })) };
  } catch {
    return empty;
  }
}

export function addDemoTransfer(state: DemoState, transfer: DemoTransfer): DemoState | null {
  if (!Number.isSafeInteger(transfer.cents) || transfer.cents < 1 || transfer.cents > DEMO_BALANCE_CENTS - state.spent) return null;
  return { owner: state.owner, spent: state.spent + transfer.cents, transfers: [transfer, ...state.transfers].slice(0, 8) };
}

/** Aceita 1000,00, 1.000,00 ou 1000.00, sem arredondar entradas inválidas. */
export function parsePixAmount(input: string): number | null {
  const value = input.trim();
  if (!/^(?:\d+(?:[.,]\d{1,2})?|\d{1,3}(?:\.\d{3})+,\d{2})$/.test(value)) return null;
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 9999999999 ? cents / 100 : null;
}
