import type { Account, BankingProvider, Card, Transaction } from "./types";

/**
 * Integração com a instituição parceira (Banking as a Service).
 *
 * Os caminhos e formatos abaixo são um ESQUELETO: cada provedor tem a própria
 * API (autenticação, rotas, idempotência, webhooks). Ajuste conforme a
 * documentação do parceiro contratado antes de ativar BAAS_PROVIDER=parceiro.
 */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const base = process.env.BAAS_API_URL;
  const key = process.env.BAAS_API_KEY;
  if (!base || !key) throw new Error("BAAS_API_URL e BAAS_API_KEY não configurados.");

  const res = await fetch(`${base}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`Provedor respondeu ${res.status}`);
  return res.json() as Promise<T>;
}

export const partnerProvider: BankingProvider = {
  isDemo: false,

  async getAccount(externalId) {
    if (!externalId) return null;
    return call<Account>(`/accounts/${encodeURIComponent(externalId)}`);
  },

  async getStatement(externalId) {
    if (!externalId) return [];
    return call<Transaction[]>(`/accounts/${encodeURIComponent(externalId)}/statement?limit=20`);
  },

  async getCard(externalId) {
    if (!externalId) return null;
    return call<Card | null>(`/accounts/${encodeURIComponent(externalId)}/cards/virtual`);
  },

  async sendPix(externalId, req) {
    if (!externalId) return { ok: false, error: "Sua conta digital ainda não foi aberta." };
    try {
      const data = await call<{ id: string }>(
        `/accounts/${encodeURIComponent(externalId)}/pix`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify(req),
        }
      );
      return { ok: true, data };
    } catch {
      return { ok: false, error: "Não foi possível enviar o PIX agora. Tente novamente." };
    }
  },
};
