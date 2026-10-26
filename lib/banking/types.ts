import type { PixKeyType } from "../validation";

export type Account = {
  agency: string;
  number: string;
  checkDigit: string;
  balance: number;
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
  | "tarifa";

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
};

/** Traduz o erro do Postgres para uma mensagem que o cliente entende. */
export function mensagemBanco(raw: string | undefined): string {
  const m = (raw ?? "").toLowerCase();

  if (/saldo insuficiente/.test(m)) return "Saldo insuficiente para esta operação.";
  if (/conta de destino não encontrada/.test(m)) return "Conta de destino não encontrada.";
  if (/mesma da origem/.test(m)) return "A conta de destino é a mesma da origem.";
  if (/conta de destino não está ativa/.test(m)) return "A conta de destino não está disponível.";
  if (/conta não está ativa/.test(m)) return "Sua conta não está ativa. Fale com o atendimento.";
  if (/código de barras inválido/.test(m)) return "Código de barras inválido. Confira os 44 dígitos.";
  if (/acima do limite por operação/.test(m)) return "Valor acima do limite por operação.";
  if (/chave já está registrada/.test(m)) return "Esta chave PIX já está registrada.";
  if (/valor inválido/.test(m)) return "Informe um valor válido.";
  if (/não autenticado|jwt/.test(m)) return "Sua sessão expirou. Entre novamente.";
  if (/pedido não está liberado/.test(m)) return "O empréstimo ainda não foi liberado.";

  return "Não foi possível concluir a operação. Tente novamente.";
}
