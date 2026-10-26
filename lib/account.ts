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
