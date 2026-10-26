import { cookies } from "next/headers";
import { addDemoTransfer, DEMO_BALANCE_CENTS, DEMO_COOKIE, readDemoState } from "./demo-state";
import type { BankingProvider, Transaction } from "./types";

const SEED_STATEMENT: Transaction[] = [
  { id: "demo-3", date: "2026-10-22T12:00:00-03:00", description: "Compra de exemplo · simulação", amount: -500 },
  { id: "demo-2", date: "2026-10-21T12:00:00-03:00", description: "PIX de exemplo · simulação", amount: -250 },
  { id: "demo-1", date: "2026-10-20T12:00:00-03:00", description: "Crédito fictício inicial · simulação", amount: 5000 },
];

/** Sem chamadas bancárias ou gravações no banco. O cookie é descartável e não é um livro financeiro. */
export function createDemoProvider(userId?: string): BankingProvider {
  const getState = async () => readDemoState((await cookies()).get(DEMO_COOKIE)?.value, userId ?? "");
  return {
    isDemo: true,
    async getAccount() {
      const state = await getState();
      return { agency: "0000", number: "DEMO-000001", balance: (DEMO_BALANCE_CENTS - state.spent) / 100, status: "ativa" };
    },
    async getStatement() {
      const state = await getState();
      return [
        ...state.transfers.map((t) => ({ id: t.id, date: t.date, description: "PIX simulado · sem valor financeiro", amount: -t.cents / 100 })),
        ...SEED_STATEMENT,
      ];
    },
    async getCard() {
      return { last4: "0000", holder: "CLIENTE DEMONSTRAÇÃO", expiry: "12/30", brand: "DEMONSTRAÇÃO", status: "ativo" };
    },
    async sendPix(_externalId, req) {
      if (!userId) return { ok: false, error: "Entre na conta para usar a demonstração." };
      const transfer = { id: `DEMO-${crypto.randomUUID()}`, date: new Date().toISOString(), cents: Math.round(req.amount * 100) };
      const state = addDemoTransfer(await getState(), transfer);
      if (!state) return { ok: false, error: "Saldo fictício insuficiente para esta simulação." };
      (await cookies()).set(DEMO_COOKIE, JSON.stringify(state), {
        httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7,
      });
      return { ok: true, data: { id: transfer.id } };
    },
  };
}
