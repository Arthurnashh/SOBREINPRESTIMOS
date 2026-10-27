import type { PixKeyType } from "../validation";

export type Account = {
  agency: string;
  number: string;
  checkDigit: string;
  balance: number;
  /** Parte do saldo retida (ex.: taxa de confiança aguardando confirmação). */
  blocked: number;
  overdraft: number;
  available: number;
  status: "ativa" | "bloqueada" | "encerrada";
  openedAt: string;
};

export type TransactionKind =
  | "pix_envio"
  | "pix_recebimento"
  | "transferencia_envio"
  | "transferencia_recebimento"
  | "boleto"
  | "credito_emprestimo"
  | "debito_automatico"
  | "estorno"
  | "abertura"
  | "tarifa"
  | "deposito"
  | "saque"
  | "recarga"
  | "agendamento"
  | "pix_cobranca"
  | "devolucao";

export type Transaction = {
  id: string;
  kind: TransactionKind;
  description: string;
  amount: number;
  counterparty: string | null;
  createdAt: string;
};

export type Card = {
  id: string;
  last4: string;
  brand: string;
  holder: string;
  expiryMonth: number;
  expiryYear: number;
  status: "ativo" | "bloqueado" | "cancelado";
};

/** Dados completos do cartão, buscados só quando o titular pede para ver. */
export type CardFull = {
  number: string;
  last4: string;
  cvv: string;
  brand: string;
  holder: string;
  expiry: string;
  expiryMonth: number;
  expiryYear: number;
  status: Card["status"];
};

export type PixKey = {
  id: string;
  keyType: PixKeyType;
  keyValue: string;
  createdAt: string;
};

export type Boleto = {
  id: string;
  barcode: string;
  beneficiary: string;
  amount: number;
  dueDate: string | null;
  paidAt: string;
};

export type Summary = {
  balance: number;
  blocked: number;
  available: number;
  overdraft: number;
  inflow: number;
  outflow: number;
  transactions: number;
};

export type Result<T = void> = { ok: true; data: T } | { ok: false; error: string };

export const KIND_LABEL: Record<TransactionKind, string> = {
  pix_envio: "PIX enviado",
  pix_recebimento: "PIX recebido",
  transferencia_envio: "Transferência enviada",
  transferencia_recebimento: "Transferência recebida",
  boleto: "Pagamento de boleto",
  credito_emprestimo: "Crédito de empréstimo",
  debito_automatico: "Débito automático",
  estorno: "Estorno",
  abertura: "Abertura de conta",
  tarifa: "Tarifa",
  deposito: "Depósito",
  saque: "Saque",
  recarga: "Recarga de celular",
  agendamento: "Agendamento",
  pix_cobranca: "PIX recebido por cobrança",
  devolucao: "Devolução",
};

export type Deposit = {
  id: string;
  amount: number;
  method: "pix" | "boleto" | "ted" | "dinheiro" | "cheque";
  origin: string | null;
  createdAt: string;
};

export type Withdrawal = {
  id: string;
  amount: number;
  method: "pix" | "caixa" | "ted";
  code: string;
  createdAt: string;
};

export type Topup = {
  id: string;
  carrier: string;
  phone: string;
  amount: number;
  createdAt: string;
};

export type Schedule = {
  id: string;
  kind: "pix" | "transferencia" | "boleto";
  target: string;
  amount: number;
  message: string | null;
  runsOn: string;
  status: "agendado" | "executado" | "cancelado" | "falhou";
  createdAt: string;
};

export type DdaBoleto = {
  id: string;
  barcode: string;
  beneficiary: string;
  amount: number;
  dueDate: string;
  status: "aberto" | "pago" | "vencido" | "cancelado";
};

export type PixCharge = {
  id: string;
  amount: number;
  description: string | null;
  emv: string;
  status: "aberta" | "paga" | "expirada" | "cancelada";
  createdAt: string;
};

export type Receipt = {
  id: string;
  kind: string;
  title: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type BankProfile = {
  addressLine: string | null;
  addressNum: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  occupation: string | null;
  income: number | null;
};

export type Limits = {
  pixPerTx: number;
  pixPerDay: number;
  transferPerTx: number;
  withdrawPerDay: number;
};

export const DEPOSIT_LABEL: Record<Deposit["method"], string> = {
  pix: "PIX",
  boleto: "Boleto",
  ted: "TED",
  dinheiro: "Dinheiro",
  cheque: "Cheque",
};

export const WITHDRAW_LABEL: Record<Withdrawal["method"], string> = {
  pix: "PIX",
  caixa: "Caixa eletrônico",
  ted: "TED",
};

export const SCHEDULE_STATUS_LABEL: Record<Schedule["status"], string> = {
  agendado: "Agendado",
  executado: "Executado",
  cancelado: "Cancelado",
  falhou: "Falhou",
};

/** Traduz o erro do Postgres para uma mensagem que o cliente entende. */
export function mensagemBanco(raw: string | undefined): string {
  const m = (raw ?? "").toLowerCase();

  if (/saldo insuficiente/.test(m)) return "Saldo insuficiente para esta operação.";
  if (/saldo insuficiente para agendar/.test(m)) return "Saldo insuficiente para agendar esta operação.";
  if (/conta de destino não encontrada/.test(m)) return "Conta de destino não encontrada.";
  if (/mesma da origem/.test(m)) return "A conta de destino é a mesma da origem.";
  if (/conta de destino não está ativa/.test(m)) return "A conta de destino não está disponível.";
  if (/conta não está ativa/.test(m)) return "Sua conta não está ativa. Fale com o atendimento.";
  if (/código de barras inválido/.test(m)) return "Código de barras inválido. Confira os 44 dígitos.";
  if (/acima do limite por operação/.test(m)) return "Valor acima do limite por operação.";
  if (/acima do limite por depósito/.test(m)) return "Valor acima do limite por depósito.";
  if (/acima do limite por recarga/.test(m)) return "Valor acima do limite por recarga.";
  if (/acima do seu limite por pix/.test(m)) return "Valor acima do seu limite por PIX. Ajuste em Limites.";
  if (/pix acima do seu limite diário/.test(m)) return "Você atingiu seu limite diário de PIX.";
  if (/acima do seu limite por transferência/.test(m)) return "Valor acima do seu limite por transferência.";
  if (/saque acima do limite diário/.test(m)) return "Você atingiu seu limite diário de saque.";
  if (/chave já está registrada/.test(m)) return "Esta chave PIX já está registrada.";
  if (/chave pix inválida/.test(m)) return "Chave PIX inválida.";
  if (/telefone inválido/.test(m)) return "Telefone inválido. Use DDD + número.";
  if (/operadora não informada/.test(m)) return "Informe a operadora.";
  if (/forma de depósito inválida/.test(m)) return "Forma de depósito inválida.";
  if (/forma de saque inválida/.test(m)) return "Forma de saque inválida.";
  if (/destino inválido/.test(m)) return "Informe o destino da operação.";
  if (/a data não pode estar no passado/.test(m)) return "A data não pode estar no passado.";
  if (/agendamento máximo de um ano/.test(m)) return "O agendamento pode ser de no máximo um ano.";
  if (/informe a data/.test(m)) return "Informe a data do agendamento.";
  if (/este boleto não está em aberto/.test(m)) return "Este boleto não está mais em aberto.";
  if (/boleto não encontrado/.test(m)) return "Boleto não encontrado.";
  if (/situação inválida/.test(m)) return "Situação inválida para o cartão.";
  if (/cartão não encontrado/.test(m)) return "Cartão não encontrado.";
  if (/informe o endereço/.test(m)) return "Informe o endereço.";
  if (/informe a cidade/.test(m)) return "Informe a cidade.";
  if (/uf inválida/.test(m)) return "UF inválida. Use a sigla de duas letras.";
  if (/cep inválido/.test(m)) return "CEP inválido. Informe os 8 dígitos.";
  if (/renda inválida/.test(m)) return "Renda inválida.";
  if (/limite acima do máximo permitido/.test(m)) return "Limite acima do máximo permitido.";
  if (/valor inválido/.test(m)) return "Informe um valor válido.";
  if (/não autenticado|jwt/.test(m)) return "Sua sessão expirou. Entre novamente.";
  if (/pedido não está liberado/.test(m)) return "O empréstimo ainda não foi liberado.";

  return "Não foi possível concluir a operação. Tente novamente.";
}
