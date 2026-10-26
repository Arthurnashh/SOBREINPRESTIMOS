"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isValidCpf, isValidEmail, isValidPhone, onlyDigits } from "@/lib/validation";
import { safeAuthNext } from "@/lib/auth-redirect";

export type FormState = { error?: string; message?: string; fields?: Record<string, string> } | undefined;

async function siteOrigin() {
  const h = await headers();
  return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get("x-forwarded-proto") === "http" ? "http" : "https"}://${h.get("host")}`).origin;
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!isValidEmail(email) || !password) {
    return { error: "Informe e-mail e senha.", fields: { email } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const msg = /confirm/i.test(error.message)
      ? "Confirme seu e-mail pelo link que enviamos antes de entrar."
      : "E-mail ou senha incorretos.";
    return { error: msg, fields: { email } };
  }

  redirect(safeAuthNext(formData.get("next")));
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const fullName = String(formData.get("full_name") ?? "").trim().replace(/\s+/g, " ");
  const cpf = onlyDigits(String(formData.get("cpf") ?? ""));
  const phone = onlyDigits(String(formData.get("phone") ?? ""));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const terms = formData.get("terms") === "on";
  const fields = { full_name: fullName, cpf, phone, email };

  if (fullName.split(" ").length < 2) return { error: "Informe seu nome completo.", fields };
  if (!isValidCpf(cpf)) return { error: "CPF inválido.", fields };
  if (!isValidPhone(phone)) return { error: "Celular inválido. Use DDD + número.", fields };
  if (!isValidEmail(email)) return { error: "E-mail inválido.", fields };
  if (password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres.", fields };
  if (!terms) return { error: "É preciso aceitar os termos e a política de privacidade.", fields };

  const intent = String(formData.get("intent") ?? "");
  const afterSignup = /^valor=\d+&parcelas=\d+$/.test(intent)
    ? `/conta/emprestimo?${intent}`
    : "/conta";

  const origin = await siteOrigin();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(afterSignup)}`,
      data: { full_name: fullName, cpf, phone },
    },
  });

  if (error) {
    if (/already registered/i.test(error.message)) {
      return { error: "Este e-mail já tem cadastro. Faça login.", fields };
    }
    if (/database error/i.test(error.message)) {
      return { error: "Este CPF já está cadastrado.", fields };
    }
    return { error: "Não foi possível concluir o cadastro. Tente novamente.", fields };
  }

  if (data.session) redirect(afterSignup);

  return {
    message: `Enviamos um link de confirmação para ${email}. Abra o e-mail para ativar sua conta.`,
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!isValidEmail(email) || email.length > 254) return { error: "Informe um e-mail válido.", fields: { email } };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${await siteOrigin()}/auth/callback?next=/redefinir-senha`,
    });
    if (error) return { error: "Não foi possível solicitar a recuperação agora. Aguarde alguns minutos e tente novamente.", fields: { email } };
  } catch {
    return { error: "O serviço de recuperação está indisponível. Tente novamente mais tarde.", fields: { email } };
  }
  return { message: "Se este e-mail tiver uma conta, você receberá as instruções para redefinir a senha. Confira também a pasta de spam." };
}

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (password.length < 8 || password.length > 128) return { error: "Use uma senha de 8 a 128 caracteres." };
  if (password !== confirmation) return { error: "As senhas precisam ser iguais." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Seu link expirou. Solicite outro em Esqueci minha senha." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Não foi possível atualizar a senha. Use uma senha diferente da anterior ou solicite um novo link." };
  await supabase.auth.signOut();
  redirect("/entrar?senha=alterada");
}
