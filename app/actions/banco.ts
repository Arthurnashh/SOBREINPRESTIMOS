"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/account";
import { getBanking } from "@/lib/banking";
import { isValidPixKey, onlyDigits, type PixKeyType } from "@/lib/validation";

export type Comprovante = {
  id: string;
  tipo: "pix" | "transferencia" | "boleto";
  data: string;
  valor: number;
  destino: string;
  descricao: string;
};

export type BancoState = {
  error?: string;
  ok?: string;
  comprovante?: Comprovante;
  fields?: Record<string, string>;
} | undefined;

const KEY_TYPES: PixKeyType[] = ["cpf", "email", "telefone", "aleatoria"];

/** Aceita 1000,00 · 1.000,00 · 1000.00 e recusa o resto. */
function parseValor(input: string): number | null {
  const v = input.trim().replace(/^R\$\s*/i, "");
  if (!/^(?:\d+(?:[.,]\d{1,2})?|\d{1,3}(?:\.\d{3})+,\d{2})$/.test(v)) return null;
  const normalized = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 9999999999 ? cents / 100 : null;
}

async function ctx() {
  const { supabase, user } = await requireSession();
  return { supabase, user, bank: getBanking(supabase) };
}

function revalidarBanco() {
  revalidatePath("/conta");
  revalidatePath("/conta/banco");
}

// ---------------------------------------------------------------------
// PIX
// ---------------------------------------------------------------------
export async function enviarPix(_prev: BancoState, formData: FormData): Promise<BancoState> {
  const keyType = String(formData.get("keyType") ?? "") as PixKeyType;
  const rawKey = String(formData.get("key") ?? "").trim();
  const rawAmount = String(formData.get("amount") ?? "");
  const descricao = String(formData.get("description") ?? "").slice(0, 140);
  const valor = parseValor(rawAmount);

  const fields = { keyType, key: rawKey.slice(0, 77), amount: rawAmount.slice(0, 30), description: descricao };
  const fail = (error: string): BancoState => ({ error, fields });

  if (!KEY_TYPES.includes(keyType)) return fail("Escolha o tipo de chave.");
  if (rawKey.length > 77 || !isValidPixKey(keyType, rawKey)) return fail("Chave PIX inválida para o tipo escolhido.");
  if (valor === null) return fail("Informe um valor válido, com até duas casas decimais.");

  const key = keyType === "cpf" || keyType === "telefone" ? onlyDigits(rawKey) : rawKey;
  const { bank } = await ctx();

  const r = await bank.sendPix(key, valor, descricao || undefined);
  if (!r.ok) return fail(r.error);

  revalidarBanco();
  return {
    ok: "PIX enviado.",
    comprovante: {
      id: r.data.id,
      tipo: "pix",
      data: new Date().toISOString(),
      valor,
      destino: `••••${key.slice(-4)}`,
      descricao,
    },
  };
}

// ---------------------------------------------------------------------
// TRANSFERÊNCIA
// ---------------------------------------------------------------------
export async function enviarTransferencia(_prev: BancoState, formData: FormData): Promise<BancoState> {
  const agencia = onlyDigits(String(formData.get("agency") ?? "")).slice(0, 6);
  const conta = onlyDigits(String(formData.get("number") ?? "")).slice(0, 12);
  const rawAmount = String(formData.get("amount") ?? "");
  const descricao = String(formData.get("description") ?? "").slice(0, 140);
  const valor = parseValor(rawAmount);

  const fields = { agency: agencia, number: conta, amount: rawAmount.slice(0, 30), description: descricao };
  const fail = (error: string): BancoState => ({ error, fields });

  if (agencia.length < 3) return fail("Informe a agência de destino.");
  if (conta.length < 4) return fail("Informe a conta de destino.");
  if (valor === null) return fail("Informe um valor válido, com até duas casas decimais.");

  const { bank } = await ctx();
  const r = await bank.transfer(agencia, conta, valor, descricao || undefined);
  if (!r.ok) return fail(r.error);

  revalidarBanco();
  return {
    ok: "Transferência enviada.",
    comprovante: {
      id: r.data.id,
      tipo: "transferencia",
      data: new Date().toISOString(),
      valor,
      destino: `Ag ${agencia} · Conta ${conta}`,
      descricao,
    },
  };
}

// ---------------------------------------------------------------------
// BOLETO
// ---------------------------------------------------------------------
export async function pagarBoleto(_prev: BancoState, formData: FormData): Promise<BancoState> {
  const barcode = onlyDigits(String(formData.get("barcode") ?? "")).slice(0, 48);
  const beneficiario = String(formData.get("beneficiary") ?? "").trim().slice(0, 80);
  const rawAmount = String(formData.get("amount") ?? "");
  const vencimento = String(formData.get("dueDate") ?? "");
  const valor = parseValor(rawAmount);

  const fields = { barcode, beneficiary: beneficiario, amount: rawAmount.slice(0, 30), dueDate: vencimento };
  const fail = (error: string): BancoState => ({ error, fields });

  if (barcode.length !== 44 && barcode.length !== 47 && barcode.length !== 48)
    return fail("O código de barras precisa ter 44, 47 ou 48 dígitos.");
  if (beneficiario.length < 3) return fail("Informe o nome do beneficiário.");
  if (valor === null) return fail("Informe o valor do boleto.");

  const due = /^\d{4}-\d{2}-\d{2}$/.test(vencimento) ? vencimento : null;
  const { bank } = await ctx();
  const r = await bank.payBoleto(barcode, beneficiario, valor, due);
  if (!r.ok) return fail(r.error);

  revalidarBanco();
  return {
    ok: "Boleto pago.",
    comprovante: {
      id: r.data.id,
      tipo: "boleto",
      data: new Date().toISOString(),
      valor,
      destino: beneficiario,
      descricao: `Código ••••${barcode.slice(-6)}`,
    },
  };
}

// ---------------------------------------------------------------------
// CHAVES PIX
// ---------------------------------------------------------------------
export async function adicionarChavePix(_prev: BancoState, formData: FormData): Promise<BancoState> {
  const keyType = String(formData.get("keyType") ?? "") as PixKeyType;
  const rawKey = String(formData.get("key") ?? "").trim();
  const fail = (error: string): BancoState => ({ error, fields: { keyType, key: rawKey.slice(0, 77) } });

  if (!KEY_TYPES.includes(keyType)) return fail("Escolha o tipo de chave.");
  if (rawKey.length > 77 || !isValidPixKey(keyType, rawKey)) return fail("Chave inválida para o tipo escolhido.");

  const value = keyType === "cpf" || keyType === "telefone" ? onlyDigits(rawKey) : rawKey;
  const { bank } = await ctx();
  const r = await bank.addPixKey(keyType, value);
  if (!r.ok) return fail(r.error);

  revalidatePath("/conta/banco");
  return { ok: "Chave PIX cadastrada." };
}

export async function removerChavePix(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  const { bank } = await ctx();
  await bank.removePixKey(id);
  revalidatePath("/conta/banco");
}
