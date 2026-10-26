"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/account";
import { getBanking } from "@/lib/banking";
import { isValidPixKey, onlyDigits, type PixKeyType } from "@/lib/validation";

export type Comprovante = {
  id: string;
  tipo: "pix" | "transferencia" | "boleto" | "deposito" | "saque" | "recarga" | "agendamento" | "cobranca";
  data: string;
  valor: number;
  destino: string;
  descricao: string;
  extra?: { rotulo: string; valor: string }[];
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

// ---------------------------------------------------------------------
// DEPÓSITO
// ---------------------------------------------------------------------
const METODOS_DEPOSITO = ["pix", "boleto", "ted", "dinheiro", "cheque"] as const;

export async function depositar(_prev: BancoState, formData: FormData): Promise<BancoState> {
  const metodo = String(formData.get("method") ?? "") as (typeof METODOS_DEPOSITO)[number];
  const origem = String(formData.get("origin") ?? "").trim().slice(0, 80);
  const rawAmount = String(formData.get("amount") ?? "");
  const valor = parseValor(rawAmount);

  const fields = { method: metodo, origin: origem, amount: rawAmount.slice(0, 30) };
  const fail = (error: string): BancoState => ({ error, fields });

  if (!METODOS_DEPOSITO.includes(metodo)) return fail("Escolha a forma de depósito.");
  if (valor === null) return fail("Informe um valor válido, com até duas casas decimais.");

  const { bank } = await ctx();
  const r = await bank.deposit(valor, metodo, origem || undefined);
  if (!r.ok) return fail(r.error);

  revalidarBanco();
  const rotulo: Record<string, string> = {
    pix: "PIX",
    boleto: "Boleto",
    ted: "TED",
    dinheiro: "Dinheiro",
    cheque: "Cheque",
  };
  return {
    ok: "Depósito confirmado.",
    comprovante: {
      id: r.data.id,
      tipo: "deposito",
      data: new Date().toISOString(),
      valor,
      destino: rotulo[metodo] ?? metodo,
      descricao: origem,
    },
  };
}

// ---------------------------------------------------------------------
// SAQUE
// ---------------------------------------------------------------------
const METODOS_SAQUE = ["pix", "caixa", "ted"] as const;

export async function sacar(_prev: BancoState, formData: FormData): Promise<BancoState> {
  const metodo = String(formData.get("method") ?? "") as (typeof METODOS_SAQUE)[number];
  const rawAmount = String(formData.get("amount") ?? "");
  const valor = parseValor(rawAmount);

  const fields = { method: metodo, amount: rawAmount.slice(0, 30) };
  const fail = (error: string): BancoState => ({ error, fields });

  if (!METODOS_SAQUE.includes(metodo)) return fail("Escolha a forma de saque.");
  if (valor === null) return fail("Informe um valor válido, com até duas casas decimais.");

  const { bank } = await ctx();
  const r = await bank.withdraw(valor, metodo);
  if (!r.ok) return fail(r.error);

  revalidarBanco();
  const rotulo: Record<string, string> = { pix: "PIX", caixa: "Caixa eletrônico", ted: "TED" };
  return {
    ok: "Saque autorizado.",
    comprovante: {
      id: r.data.id,
      tipo: "saque",
      data: r.data.createdAt,
      valor,
      destino: rotulo[metodo] ?? metodo,
      descricao: "",
      extra: [{ rotulo: "Código de retirada", valor: r.data.code }],
    },
  };
}

// ---------------------------------------------------------------------
// RECARGA DE CELULAR
// ---------------------------------------------------------------------
export async function recarregar(_prev: BancoState, formData: FormData): Promise<BancoState> {
  const operadora = String(formData.get("carrier") ?? "").trim().slice(0, 30);
  const telefone = String(formData.get("phone") ?? "").trim().slice(0, 20);
  const rawAmount = String(formData.get("amount") ?? "");
  const valor = parseValor(rawAmount);

  const fields = { carrier: operadora, phone: telefone, amount: rawAmount.slice(0, 30) };
  const fail = (error: string): BancoState => ({ error, fields });

  if (operadora.length < 2) return fail("Informe a operadora.");
  if (onlyDigits(telefone).length < 10) return fail("Telefone inválido. Use DDD + número.");
  if (valor === null) return fail("Informe um valor válido.");

  const { bank } = await ctx();
  const r = await bank.topup(operadora, telefone, valor);
  if (!r.ok) return fail(r.error);

  revalidarBanco();
  return {
    ok: "Recarga realizada.",
    comprovante: {
      id: r.data.id,
      tipo: "recarga",
      data: new Date().toISOString(),
      valor,
      destino: operadora,
      descricao: `••••${onlyDigits(telefone).slice(-4)}`,
    },
  };
}

// ---------------------------------------------------------------------
// PIX RECEBIDO (cobrança com QR)
// ---------------------------------------------------------------------
export async function criarCobranca(_prev: BancoState, formData: FormData): Promise<BancoState> {
  const rawAmount = String(formData.get("amount") ?? "");
  const descricao = String(formData.get("description") ?? "").trim().slice(0, 140);
  const valor = parseValor(rawAmount);

  const fields = { amount: rawAmount.slice(0, 30), description: descricao };
  const fail = (error: string): BancoState => ({ error, fields });

  if (valor === null) return fail("Informe um valor válido.");

  const { bank } = await ctx();
  const r = await bank.createPixCharge(valor, descricao || undefined);
  if (!r.ok) return fail(r.error);

  revalidatePath("/conta/banco");
  return {
    ok: "Cobrança gerada.",
    comprovante: {
      id: r.data.id,
      tipo: "cobranca",
      data: r.data.createdAt,
      valor,
      destino: "Cobrança PIX",
      descricao,
      extra: [{ rotulo: "PIX copia e cola", valor: r.data.emv }],
    },
  };
}

export async function cancelarCobranca(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  const { bank } = await ctx();
  await bank.cancelPixCharge(id);
  revalidatePath("/conta/banco");
}

// ---------------------------------------------------------------------
// AGENDAMENTO
// ---------------------------------------------------------------------
const TIPOS_AGENDAMENTO = ["pix", "transferencia", "boleto"] as const;

export async function agendar(_prev: BancoState, formData: FormData): Promise<BancoState> {
  const tipo = String(formData.get("kind") ?? "") as (typeof TIPOS_AGENDAMENTO)[number];
  const destino = String(formData.get("target") ?? "").trim().slice(0, 120);
  const data = String(formData.get("runsOn") ?? "");
  const mensagem = String(formData.get("message") ?? "").trim().slice(0, 140);
  const rawAmount = String(formData.get("amount") ?? "");
  const valor = parseValor(rawAmount);

  const fields = { kind: tipo, target: destino, runsOn: data, message: mensagem, amount: rawAmount.slice(0, 30) };
  const fail = (error: string): BancoState => ({ error, fields });

  if (!TIPOS_AGENDAMENTO.includes(tipo)) return fail("Escolha o tipo de agendamento.");
  if (destino.length < 4) return fail("Informe o destino.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return fail("Informe a data do agendamento.");
  if (valor === null) return fail("Informe um valor válido.");

  const { bank } = await ctx();
  const r = await bank.schedule(tipo, destino, valor, data, mensagem || undefined);
  if (!r.ok) return fail(r.error);

  revalidatePath("/conta/banco");
  return {
    ok: "Agendamento criado.",
    comprovante: {
      id: r.data.id,
      tipo: "agendamento",
      data: new Date().toISOString(),
      valor,
      destino,
      descricao: mensagem,
      extra: [{ rotulo: "Data agendada", valor: new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR") }],
    },
  };
}

export async function cancelarAgendamento(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  const { bank } = await ctx();
  await bank.cancelSchedule(id);
  revalidatePath("/conta/banco");
}

// ---------------------------------------------------------------------
// DDA
// ---------------------------------------------------------------------
export async function pagarBoletoDda(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  const { bank } = await ctx();
  await bank.payDda(id);
  revalidarBanco();
}

// ---------------------------------------------------------------------
// CARTÃO
// ---------------------------------------------------------------------
export async function alterarStatusCartao(formData: FormData) {
  const status = String(formData.get("status") ?? "");
  if (status !== "ativo" && status !== "bloqueado") return;

  const { bank } = await ctx();
  await bank.setCardStatus(status);
  revalidatePath("/conta/banco");
}

// ---------------------------------------------------------------------
// DADOS CADASTRAIS
// ---------------------------------------------------------------------
export async function salvarDadosCadastrais(_prev: BancoState, formData: FormData): Promise<BancoState> {
  const pegar = (campo: string, max = 120) => String(formData.get(campo) ?? "").trim().slice(0, max);

  const endereco = pegar("addressLine");
  const numero = pegar("addressNum", 10);
  const complemento = pegar("complement", 60);
  const bairro = pegar("district", 60);
  const cidade = pegar("city", 60);
  const uf = pegar("state", 2).toUpperCase();
  const cep = onlyDigits(pegar("zip", 9));
  const profissao = pegar("occupation", 60);
  const rendaBruta = String(formData.get("income") ?? "").trim();
  const renda = rendaBruta ? parseValor(rendaBruta) : null;

  const fields = {
    addressLine: endereco,
    addressNum: numero,
    complement: complemento,
    district: bairro,
    city: cidade,
    state: uf,
    zip: cep,
    occupation: profissao,
    income: rendaBruta.slice(0, 30),
  };
  const fail = (error: string): BancoState => ({ error, fields });

  if (endereco.length < 3) return fail("Informe o endereço.");
  if (cidade.length < 2) return fail("Informe a cidade.");
  if (!/^[A-Z]{2}$/.test(uf)) return fail("UF inválida. Use a sigla de duas letras.");
  if (cep.length !== 8) return fail("CEP inválido. Informe os 8 dígitos.");
  if (rendaBruta && renda === null) return fail("Renda inválida.");

  const { bank } = await ctx();
  const r = await bank.saveProfile({
    addressLine: endereco,
    addressNum: numero,
    complement: complemento,
    district: bairro,
    city: cidade,
    state: uf,
    zip: cep,
    occupation: profissao,
    income: renda,
  });
  if (!r.ok) return fail(r.error);

  revalidatePath("/conta/banco");
  return { ok: "Dados atualizados." };
}

// ---------------------------------------------------------------------
// LIMITES
// ---------------------------------------------------------------------
export async function salvarLimites(_prev: BancoState, formData: FormData): Promise<BancoState> {
  const campos = ["pixPerTx", "pixPerDay", "transferPerTx", "withdrawPerDay"] as const;
  const valores: Record<string, number | null> = {};
  const fields: Record<string, string> = {};

  for (const c of campos) {
    const bruto = String(formData.get(c) ?? "").trim();
    fields[c] = bruto.slice(0, 30);
    // vazio = sem limite (0)
    valores[c] = bruto ? parseValor(bruto) : 0;
    if (bruto && valores[c] === null) {
      return { error: "Informe valores válidos, com até duas casas decimais.", fields };
    }
  }

  const { bank } = await ctx();
  const r = await bank.setLimits({
    pixPerTx: valores.pixPerTx as number,
    pixPerDay: valores.pixPerDay as number,
    transferPerTx: valores.transferPerTx as number,
    withdrawPerDay: valores.withdrawPerDay as number,
  });
  if (!r.ok) return { error: r.error, fields };

  revalidatePath("/conta/banco");
  return { ok: "Limites atualizados." };
}
