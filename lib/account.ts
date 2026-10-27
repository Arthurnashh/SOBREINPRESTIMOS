import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";

export type Profile = {
  id: string;
  full_name: string;
  cpf: string;
  phone: string | null;
  external_account_id: string | null;
  is_admin: boolean;
};

export type LoanRequest = {
  id: string;
  amount: number;
  installments: number;
  status: "em_analise" | "aprovado" | "recusado" | "liberado" | "cancelado";
  monthly_rate: number | null;
  installment_value: number | null;
  cet_yearly: number | null;
  decision_note: string | null;
  created_at: string;
  /** Taxa de confiança criada na liberação. Null em pedidos anteriores. */
  taxa_adesao?: number | null;
  taxa_adesao_pct?: number | null;
  taxa_adesao_status?: "pendente" | "aplicada" | "cancelada" | null;
  taxa_adesao_ciente_em?: string | null;
};

export const STATUS_LABEL: Record<LoanRequest["status"], string> = {
  em_analise: "Em análise",
  aprovado: "Aprovado",
  recusado: "Não aprovado",
  liberado: "Liberado",
  cancelado: "Cancelado",
};

/** Usuário logado + perfil. Redireciona para o login se não houver sessão. */
export const requireSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, cpf, phone, external_account_id, is_admin")
    .eq("id", user.id)
    .single<Profile>();

  return { supabase, user, profile };
});

/** Exige sessão + papel de administrador. */
export const requireAdmin = cache(async () => {
  const ctx = await requireSession();
  if (!ctx.profile?.is_admin) redirect("/conta");
  return ctx;
});

/** Cobrança da taxa de confiança pendente, como devolvida pela RPC. */
type TaxaPendenteRow = {
  ok: boolean;
  pendente: boolean;
  loan_id?: string;
  parcela?: number | string | null;
  taxa?: number | string | null;
  pct?: number | string | null;
  cobranca?: {
    id: string;
    amount: string | number;
    status: "pending";
    copy_paste: string | null;
    qr_code: string | null;
    expires_at: string | null;
  } | null;
};

export type TaxaPendente = {
  loanId: string;
  taxa: number;
  parcela: number;
  percentual: number;
  cobrancaInicial: {
    id: string;
    amount: number;
    status: "pending";
    copyPaste: string | null;
    qrCode: string | null;
    expiresAt: string | null;
    providerChargeId: null;
  } | null;
};

/** Taxa paga recentemente e ainda não confirmada ao cliente na interface. */
export type TaxaConfirmada = {
  taxa: number;
  parcela: number;
};

/**
 * Janela em que a confirmação continua sendo mostrada ao cliente.
 *
 * Cobre quem paga o PIX no app do banco e fecha a página: o webhook libera o
 * saldo, mas a tela de "Conta liberada" só existia para quem estava olhando.
 * Sem esta janela, o cliente volta, a cobrança sumiu e ninguém explicou nada.
 * Passado o prazo, insistir na mensagem vira ruído em toda visita.
 */
const CONFIRMACAO_HORAS = 24;

/**
 * Taxa de confiança em aberto do cliente, pronta para os componentes de UI.
 *
 * O saldo do empréstimo fica creditado e bloqueado no banco até o PIX ser
 * confirmado (`loan_taxa_pagar`, chamado pelo webhook). A cobrança aparece na
 * Área PIX e no aviso do topo da conta — deixar de bloquear a navegação não
 * expõe o dinheiro, porque quem impede o gasto é `bank_accounts.bloqueado`,
 * não a tela.
 *
 * A RPC pode não existir antes do loan8.sql; nesse caso devolve null e o site
 * segue no fluxo antigo, sem quebrar o deploy.
 */
export const getTaxaPendente = cache(
  async (supabase: Awaited<ReturnType<typeof createClient>>, pctPadrao: number): Promise<TaxaPendente | null> => {
    try {
      const { data } = await supabase.rpc("loan_taxa_pendente");
      const row = (data ?? null) as TaxaPendenteRow | null;
      if (!row?.pendente || !row.loan_id) return null;

      const cob = row.cobranca;
      return {
        loanId: row.loan_id,
        taxa: Number(row.taxa ?? 0),
        parcela: Number(row.parcela ?? 0),
        percentual: Number(row.pct ?? pctPadrao),
        cobrancaInicial: cob
          ? {
              id: cob.id,
              amount: Number(cob.amount),
              status: "pending",
              copyPaste: cob.copy_paste,
              qrCode: cob.qr_code,
              expiresAt: cob.expires_at,
              providerChargeId: null,
            }
          : null,
      };
    } catch {
      return null;
    }
  }
);

/**
 * Taxa paga nas últimas 24 h, para confirmar o pagamento a quem não estava na
 * tela quando o webhook confirmou.
 *
 * A verdade vem de `loan_requests`: `loan_taxa_pagar` grava
 * `taxa_adesao_status = 'aplicada'` e `taxa_adesao_ciente_em`. Só as colunas
 * do próprio usuário são lidas, e a RLS de `loan_requests` já restringe ao dono.
 */
export const getTaxaConfirmada = cache(
  async (supabase: Awaited<ReturnType<typeof createClient>>): Promise<TaxaConfirmada | null> => {
    try {
      const desde = new Date(Date.now() - CONFIRMACAO_HORAS * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from("loan_requests")
        .select("taxa_adesao, installment_value, taxa_adesao_ciente_em")
        .eq("taxa_adesao_status", "aplicada")
        .gte("taxa_adesao_ciente_em", desde)
        .order("taxa_adesao_ciente_em", { ascending: false })
        .limit(1)
        .maybeSingle<{
          taxa_adesao: number | string | null;
          installment_value: number | string | null;
          taxa_adesao_ciente_em: string | null;
        }>();

      if (!data) return null;
      return {
        taxa: Number(data.taxa_adesao ?? 0),
        parcela: Number(data.installment_value ?? 0),
      };
    } catch {
      return null;
    }
  }
);
