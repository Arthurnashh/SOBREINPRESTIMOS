import type { SupabaseClient } from "@supabase/supabase-js";
import type { PixKeyType } from "../validation";
import {
  mensagemBanco,
  type Account,
  type Boleto,
  type Card,
  type PixKey,
  type Result,
  type Summary,
  type Transaction,
} from "./types";

/**
 * Conta bancária do cliente.
 *
 * O saldo e o extrato vivem no Postgres (tabelas bank_*). Nenhuma operação
 * passa por estado no navegador: toda movimentação é atômica e fica
 * registrada. O saldo só muda através das funções bank_* (SECURITY DEFINER),
 * que validam saldo, limite e propriedade da conta.
 */
export class BankService {
  constructor(private readonly supabase: SupabaseClient) {}

  /** Abre a conta se ainda não existir. Idempotente. */
  async ensureAccount(): Promise<Account | null> {
    const existing = await this.getAccount();
    if (existing) return existing;

    const { error } = await this.supabase.rpc("bank_open_account");
    if (error) return null;
    return this.getAccount();
  }

  async getAccount(): Promise<Account | null> {
    const { data } = await this.supabase
      .from("bank_accounts")
      .select("agency, number, check_digit, balance, overdraft, status, opened_at")
      .maybeSingle<{
        agency: string;
        number: string;
        check_digit: string;
        balance: string | number;
        overdraft: string | number;
        status: Account["status"];
        opened_at: string;
      }>();

    if (!data) return null;
    const balance = Number(data.balance);
    const overdraft = Number(data.overdraft);
    return {
      agency: data.agency,
      number: data.number,
      checkDigit: data.check_digit,
      balance,
      overdraft,
      available: balance + overdraft,
      status: data.status,
      openedAt: data.opened_at,
    };
  }

  async getSummary(): Promise<Summary> {
    const { data } = await this.supabase.rpc("bank_summary");
    const s = (data ?? {}) as Record<string, unknown>;
    return {
      balance: Number(s.balance ?? 0),
      overdraft: Number(s.overdraft ?? 0),
      inflow: Number(s.inflow ?? 0),
      outflow: Math.abs(Number(s.outflow ?? 0)),
      transactions: Number(s.transactions ?? 0),
    };
  }

  async getStatement(limit = 50): Promise<Transaction[]> {
    const { data } = await this.supabase
      .from("bank_transactions")
      .select("id, kind, description, amount, counterparty, created_at")
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<
        { id: string; kind: Transaction["kind"]; description: string; amount: string | number; counterparty: string | null; created_at: string }[]
      >();

    return (data ?? []).map((t) => ({
      id: t.id,
      kind: t.kind,
      description: t.description,
      amount: Number(t.amount),
      counterparty: t.counterparty,
      createdAt: t.created_at,
    }));
  }

  /** Abre o cartão se ainda não existir. Idempotente. */
  async ensureCard(): Promise<Card | null> {
    const existing = await this.getCard();
    if (existing) return existing;

    const { error } = await this.supabase.rpc("bank_open_card");
    if (error) return null;
    return this.getCard();
  }

  async getCard(): Promise<Card | null> {
    const { data } = await this.supabase
      .from("bank_cards")
      .select("id, last4, brand, holder, expiry_month, expiry_year, status")
      .maybeSingle<{
        id: string;
        last4: string;
        brand: string;
        holder: string;
        expiry_month: number;
        expiry_year: number;
        status: Card["status"];
      }>();

    if (!data) return null;
    return {
      id: data.id,
      last4: data.last4,
      brand: data.brand,
      holder: data.holder,
      expiryMonth: data.expiry_month,
      expiryYear: data.expiry_year,
      status: data.status,
    };
  }

  async getPixKeys(): Promise<PixKey[]> {
    const { data } = await this.supabase
      .from("bank_pix_keys")
      .select("id, key_type, key_value, created_at")
      .order("created_at", { ascending: true })
      .returns<{ id: string; key_type: PixKeyType; key_value: string; created_at: string }[]>();

    return (data ?? []).map((k) => ({
      id: k.id,
      keyType: k.key_type,
      keyValue: k.key_value,
      createdAt: k.created_at,
    }));
  }

  async getBoletos(limit = 20): Promise<Boleto[]> {
    const { data } = await this.supabase
      .from("bank_boletos")
      .select("id, barcode, beneficiary, amount, due_date, paid_at")
      .order("paid_at", { ascending: false })
      .limit(limit)
      .returns<
        { id: string; barcode: string; beneficiary: string; amount: string | number; due_date: string | null; paid_at: string }[]
      >();

    return (data ?? []).map((b) => ({
      id: b.id,
      barcode: b.barcode,
      beneficiary: b.beneficiary,
      amount: Number(b.amount),
      dueDate: b.due_date,
      paidAt: b.paid_at,
    }));
  }

  // -------------------------------------------------------------------
  // Operações
  // -------------------------------------------------------------------

  async sendPix(key: string, amount: number, message?: string): Promise<Result<{ id: string }>> {
    const { data, error } = await this.supabase.rpc("bank_send_pix", {
      p_key: key,
      p_amount: amount,
      p_message: message ?? null,
    });
    if (error) return { ok: false, error: mensagemBanco(error.message) };
    return { ok: true, data: { id: (data as { id: string }).id } };
  }

  async transfer(
    agency: string,
    number: string,
    amount: number,
    message?: string
  ): Promise<Result<{ id: string }>> {
    const { data, error } = await this.supabase.rpc("bank_transfer", {
      p_agency: agency,
      p_number: number,
      p_amount: amount,
      p_message: message ?? null,
    });
    if (error) return { ok: false, error: mensagemBanco(error.message) };
    return { ok: true, data: { id: (data as { id: string }).id } };
  }

  async payBoleto(
    barcode: string,
    beneficiary: string,
    amount: number,
    dueDate?: string | null
  ): Promise<Result<{ id: string }>> {
    const { data, error } = await this.supabase.rpc("bank_pay_boleto", {
      p_barcode: barcode,
      p_beneficiary: beneficiary,
      p_amount: amount,
      p_due_date: dueDate ?? null,
    });
    if (error) return { ok: false, error: mensagemBanco(error.message) };
    return { ok: true, data: { id: (data as { id: string }).id } };
  }

  async addPixKey(keyType: PixKeyType, value: string): Promise<Result<{ id: string }>> {
    const { data, error } = await this.supabase.rpc("bank_add_pix_key", {
      p_type: keyType,
      p_value: value,
    });
    if (error) return { ok: false, error: mensagemBanco(error.message) };
    return { ok: true, data: { id: (data as { id: string }).id } };
  }

  async removePixKey(id: string): Promise<Result> {
    const { error } = await this.supabase.rpc("bank_remove_pix_key", { p_id: id });
    if (error) return { ok: false, error: mensagemBanco(error.message) };
    return { ok: true, data: undefined };
  }
}
