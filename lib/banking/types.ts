import type { PixKeyType } from "../validation";

export type Account = {
  agency: string;
  number: string;
  balance: number;
  status: "ativa" | "bloqueada" | "em_abertura";
};

export type Transaction = {
  id: string;
  date: string;
  description: string;
  amount: number; // positivo = entrada, negativo = saída
};

export type Card = {
  last4: string;
  holder: string;
  expiry: string;
  brand: string;
  status: "ativo" | "bloqueado";
};

export type PixRequest = {
  keyType: PixKeyType;
  key: string;
  amount: number;
  description?: string;
};

export type Result<T = void> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Toda movimentação de dinheiro passa por uma instituição autorizada pelo
 * Banco Central (BaaS). O site nunca guarda saldo próprio.
 */
export interface BankingProvider {
  readonly isDemo: boolean;
  getAccount(externalId: string | null): Promise<Account | null>;
  getStatement(externalId: string | null): Promise<Transaction[]>;
  getCard(externalId: string | null): Promise<Card | null>;
  sendPix(externalId: string | null, req: PixRequest): Promise<Result<{ id: string }>>;
}
