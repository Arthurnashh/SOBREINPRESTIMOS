import type { SupabaseClient } from "@supabase/supabase-js";
import type { PixKeyType } from "../validation";
import {
  mensagemBanco,
  type Account,
  type BankProfile,
  type Boleto,
  type Card,
  type CardFull,
  type Deposit,
  type DdaBoleto,
  type Limits,
  type PixCharge,
  type PixKey,
  type Receipt,
  type Result,
  type Schedule,
  type Summary,
  type Topup,
  type Transaction,
  type Withdrawal,
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

  /**
   * Id do titular logado.
   *
   * As consultas abaixo filtram por ele de propósito. A RLS já garante que
   * ninguém lê a conta alheia, mas sozinha ela devolve MAIS DE UMA linha para
   * o admin (que enxerga todas as contas). Como usamos `.maybeSingle()`, isso
   * virava erro e derrubava a página da conta. O filtro explícito resolve.
   */
  private async uid(): Promise<string | null> {
    const { data } = await this.supabase.auth.getUser();
    return data.user?.id ?? null;
  }

  /** Abre a conta se ainda não existir. Idempotente. */
  async ensureAccount(): Promise<Account | null> {
    const existing = await this.getAccount();
    if (existing) return existing;

    const { error } = await this.supabase.rpc("bank_open_account");
    if (error) return null;
    return this.getAccount();
  }

  async getAccount(): Promise<Account | null> {
    // Filtra explicitamente pelo titular. Sem isto a consulta depende de a RLS
    // devolver exatamente uma linha — o que deixa de valer para o admin, que
    // enxerga todas as contas, e fazia a página dele quebrar.
    const uid = await this.uid();
    if (!uid) return null;

    /*
     * `select("*")` de propósito: a coluna `bloqueado` (taxa de confiança)
     * entra com o loan7.sql. Se o deploy chegar antes da migração, a consulta
     * com coluna explícita falharia e derrubaria a conta inteira; com `*` o
     * campo só vem ausente e é tratado como zero.
     */
    const { data } = await this.supabase
      .from("bank_accounts")
      .select("*")
      .eq("user_id", uid)
      .maybeSingle<{
        agency: string;
        number: string;
        check_digit: string;
        balance: string | number;
        bloqueado?: string | number;
        overdraft: string | number;
        status: Account["status"];
        opened_at: string;
      }>();

    if (!data) return null;
    const balance = Number(data.balance);
    const blocked = Number(data.bloqueado ?? 0);
    const overdraft = Number(data.overdraft);
    return {
      agency: data.agency,
      number: data.number,
      checkDigit: data.check_digit,
      balance,
      blocked,
      overdraft,
      available: balance - blocked + overdraft,
      status: data.status,
      openedAt: data.opened_at,
    };
  }

  async getSummary(): Promise<Summary> {
    const { data } = await this.supabase.rpc("bank_summary");
    const s = (data ?? {}) as Record<string, unknown>;
    return {
      balance: Number(s.balance ?? 0),
      blocked: Number(s.blocked ?? 0),
      available: Number(s.available ?? s.balance ?? 0),
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
    const uid = await this.uid();
    if (!uid) return null;

    const { data } = await this.supabase
      .from("bank_cards")
      .select("id, last4, brand, holder, expiry_month, expiry_year, status")
      .eq("user_id", uid)
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

  // -------------------------------------------------------------------
  // Depósito, saque, recarga
  // -------------------------------------------------------------------

  async deposit(amount: number, method: Deposit["method"], origin?: string): Promise<Result<{ id: string }>> {
    const { data, error } = await this.supabase.rpc("bank_deposit", {
      p_amount: amount,
      p_method: method,
      p_origin: origin ?? null,
    });
    if (error) return { ok: false, error: mensagemBanco(error.message) };
    return { ok: true, data: { id: (data as { id: string }).id } };
  }

  async withdraw(amount: number, method: Withdrawal["method"]): Promise<Result<Withdrawal>> {
    const { data, error } = await this.supabase.rpc("bank_withdraw", {
      p_amount: amount,
      p_method: method,
    });
    if (error) return { ok: false, error: mensagemBanco(error.message) };
    const w = data as { id: string; amount: string | number; method: Withdrawal["method"]; withdraw_code: string; created_at: string };
    return {
      ok: true,
      data: {
        id: w.id,
        amount: Number(w.amount),
        method: w.method,
        code: w.withdraw_code,
        createdAt: w.created_at,
      },
    };
  }

  async topup(carrier: string, phone: string, amount: number): Promise<Result<{ id: string }>> {
    const { data, error } = await this.supabase.rpc("bank_topup", {
      p_carrier: carrier,
      p_phone: phone,
      p_amount: amount,
    });
    if (error) return { ok: false, error: mensagemBanco(error.message) };
    return { ok: true, data: { id: (data as { id: string }).id } };
  }

  async getDeposits(limit = 20): Promise<Deposit[]> {
    const { data } = await this.supabase
      .from("bank_deposits")
      .select("id, amount, method, origin, created_at")
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<{ id: string; amount: string | number; method: Deposit["method"]; origin: string | null; created_at: string }[]>();

    return (data ?? []).map((d) => ({
      id: d.id,
      amount: Number(d.amount),
      method: d.method,
      origin: d.origin,
      createdAt: d.created_at,
    }));
  }

  async getWithdrawals(limit = 20): Promise<Withdrawal[]> {
    const { data } = await this.supabase
      .from("bank_withdrawals")
      .select("id, amount, method, withdraw_code, created_at")
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<{ id: string; amount: string | number; method: Withdrawal["method"]; withdraw_code: string; created_at: string }[]>();

    return (data ?? []).map((w) => ({
      id: w.id,
      amount: Number(w.amount),
      method: w.method,
      code: w.withdraw_code,
      createdAt: w.created_at,
    }));
  }

  async getTopups(limit = 20): Promise<Topup[]> {
    const { data } = await this.supabase
      .from("bank_topups")
      .select("id, carrier, phone, amount, created_at")
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<{ id: string; carrier: string; phone: string; amount: string | number; created_at: string }[]>();

    return (data ?? []).map((t) => ({
      id: t.id,
      carrier: t.carrier,
      phone: t.phone,
      amount: Number(t.amount),
      createdAt: t.created_at,
    }));
  }

  // -------------------------------------------------------------------
  // PIX recebido (cobrança)
  // -------------------------------------------------------------------

  async createPixCharge(amount: number, description?: string): Promise<Result<PixCharge>> {
    const { data, error } = await this.supabase.rpc("bank_create_pix_charge", {
      p_amount: amount,
      p_description: description ?? null,
    });
    if (error) return { ok: false, error: mensagemBanco(error.message) };
    const c = data as {
      id: string;
      amount: string | number;
      description: string | null;
      emv: string;
      status: PixCharge["status"];
      created_at: string;
    };
    return {
      ok: true,
      data: {
        id: c.id,
        amount: Number(c.amount),
        description: c.description,
        emv: c.emv,
        status: c.status,
        createdAt: c.created_at,
      },
    };
  }

  async cancelPixCharge(id: string): Promise<Result> {
    const { error } = await this.supabase.rpc("bank_cancel_pix_charge", { p_id: id });
    if (error) return { ok: false, error: mensagemBanco(error.message) };
    return { ok: true, data: undefined };
  }

  async getPixCharges(limit = 20): Promise<PixCharge[]> {
    const { data } = await this.supabase
      .from("bank_pix_charges")
      .select("id, amount, description, emv, status, created_at")
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<
        { id: string; amount: string | number; description: string | null; emv: string; status: PixCharge["status"]; created_at: string }[]
      >();

    return (data ?? []).map((c) => ({
      id: c.id,
      amount: Number(c.amount),
      description: c.description,
      emv: c.emv,
      status: c.status,
      createdAt: c.created_at,
    }));
  }

  // -------------------------------------------------------------------
  // Agendamento
  // -------------------------------------------------------------------

  async schedule(
    kind: Schedule["kind"],
    target: string,
    amount: number,
    runsOn: string,
    message?: string
  ): Promise<Result<{ id: string }>> {
    const { data, error } = await this.supabase.rpc("bank_schedule", {
      p_kind: kind,
      p_target: target,
      p_amount: amount,
      p_runs_on: runsOn,
      p_message: message ?? null,
    });
    if (error) return { ok: false, error: mensagemBanco(error.message) };
    return { ok: true, data: { id: (data as { id: string }).id } };
  }

  async cancelSchedule(id: string): Promise<Result> {
    const { error } = await this.supabase.rpc("bank_cancel_schedule", { p_id: id });
    if (error) return { ok: false, error: mensagemBanco(error.message) };
    return { ok: true, data: undefined };
  }

  async getSchedules(limit = 30): Promise<Schedule[]> {
    const { data } = await this.supabase
      .from("bank_schedules")
      .select("id, kind, target, amount, message, runs_on, status, created_at")
      .order("runs_on", { ascending: true })
      .limit(limit)
      .returns<
        {
          id: string;
          kind: Schedule["kind"];
          target: string;
          amount: string | number;
          message: string | null;
          runs_on: string;
          status: Schedule["status"];
          created_at: string;
        }[]
      >();

    return (data ?? []).map((s) => ({
      id: s.id,
      kind: s.kind,
      target: s.target,
      amount: Number(s.amount),
      message: s.message,
      runsOn: s.runs_on,
      status: s.status,
      createdAt: s.created_at,
    }));
  }

  // -------------------------------------------------------------------
  // DDA
  // -------------------------------------------------------------------

  async getDda(): Promise<DdaBoleto[]> {
    const { data } = await this.supabase
      .from("bank_dda")
      .select("id, barcode, beneficiary, amount, due_date, status")
      .order("due_date", { ascending: true })
      .returns<
        {
          id: string;
          barcode: string;
          beneficiary: string;
          amount: string | number;
          due_date: string;
          status: DdaBoleto["status"];
        }[]
      >();

    return (data ?? []).map((d) => ({
      id: d.id,
      barcode: d.barcode,
      beneficiary: d.beneficiary,
      amount: Number(d.amount),
      dueDate: d.due_date,
      status: d.status,
    }));
  }

  async payDda(id: string): Promise<Result<{ id: string }>> {
    const { data, error } = await this.supabase.rpc("bank_pay_dda", { p_id: id });
    if (error) return { ok: false, error: mensagemBanco(error.message) };
    return { ok: true, data: { id: (data as { id: string }).id } };
  }

  // -------------------------------------------------------------------
  // Cartão, comprovantes, cadastro e limites
  // -------------------------------------------------------------------

  async setCardStatus(status: "ativo" | "bloqueado"): Promise<Result> {
    const { error } = await this.supabase.rpc("bank_set_card_status", { p_status: status });
    if (error) return { ok: false, error: mensagemBanco(error.message) };
    return { ok: true, data: undefined };
  }

  /** Número completo, validade e CVV. Só o titular consegue (auth.uid()). */
  async getCardFull(): Promise<Result<CardFull>> {
    const { data, error } = await this.supabase.rpc("bank_card_full");
    if (error) return { ok: false, error: mensagemBanco(error.message) };

    const c = data as {
      number: string;
      last4: string;
      cvv: string;
      brand: string;
      holder: string;
      expiry: string;
      expiry_month: number;
      expiry_year: number;
      status: Card["status"];
    };

    return {
      ok: true,
      data: {
        number: c.number,
        last4: c.last4,
        cvv: c.cvv,
        brand: c.brand,
        holder: c.holder,
        expiry: c.expiry,
        expiryMonth: c.expiry_month,
        expiryYear: c.expiry_year,
        status: c.status,
      },
    };
  }

  async getReceipts(limit = 30): Promise<Receipt[]> {
    const { data } = await this.supabase
      .from("bank_receipts")
      .select("id, kind, title, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<{ id: string; kind: string; title: string; payload: Record<string, unknown>; created_at: string }[]>();

    return (data ?? []).map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      payload: r.payload ?? {},
      createdAt: r.created_at,
    }));
  }

  async getProfile(): Promise<BankProfile | null> {
    const uid = await this.uid();
    if (!uid) return null;

    const { data } = await this.supabase
      .from("bank_profiles")
      .select("address_line, address_num, complement, district, city, state, zip, occupation, income")
      .eq("user_id", uid)
      .maybeSingle<{
        address_line: string | null;
        address_num: string | null;
        complement: string | null;
        district: string | null;
        city: string | null;
        state: string | null;
        zip: string | null;
        occupation: string | null;
        income: string | number | null;
      }>();

    if (!data) return null;
    return {
      addressLine: data.address_line,
      addressNum: data.address_num,
      complement: data.complement,
      district: data.district,
      city: data.city,
      state: data.state,
      zip: data.zip,
      occupation: data.occupation,
      income: data.income === null ? null : Number(data.income),
    };
  }

  async saveProfile(p: Omit<BankProfile, "income"> & { income: number | null }): Promise<Result> {
    const { error } = await this.supabase.rpc("bank_save_profile", {
      p_address_line: p.addressLine ?? "",
      p_address_num: p.addressNum ?? "",
      p_complement: p.complement ?? "",
      p_district: p.district ?? "",
      p_city: p.city ?? "",
      p_state: p.state ?? "",
      p_zip: p.zip ?? "",
      p_occupation: p.occupation ?? "",
      p_income: p.income,
    });
    if (error) return { ok: false, error: mensagemBanco(error.message) };
    return { ok: true, data: undefined };
  }

  async getLimits(): Promise<Limits | null> {
    const uid = await this.uid();
    if (!uid) return null;

    const { data } = await this.supabase
      .from("bank_limits")
      .select("pix_per_tx, pix_per_day, transfer_per_tx, withdraw_per_day")
      .eq("user_id", uid)
      .maybeSingle<{
        pix_per_tx: string | number;
        pix_per_day: string | number;
        transfer_per_tx: string | number;
        withdraw_per_day: string | number;
      }>();

    if (!data) return null;
    return {
      pixPerTx: Number(data.pix_per_tx),
      pixPerDay: Number(data.pix_per_day),
      transferPerTx: Number(data.transfer_per_tx),
      withdrawPerDay: Number(data.withdraw_per_day),
    };
  }

  async setLimits(l: Limits): Promise<Result> {
    const { error } = await this.supabase.rpc("bank_set_limits", {
      p_pix_per_tx: l.pixPerTx,
      p_pix_per_day: l.pixPerDay,
      p_transfer_per_tx: l.transferPerTx,
      p_withdraw_per_day: l.withdrawPerDay,
    });
    if (error) return { ok: false, error: mensagemBanco(error.message) };
    return { ok: true, data: undefined };
  }
}
