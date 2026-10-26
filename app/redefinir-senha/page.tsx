import Link from "next/link";
import type { Metadata } from "next";
import Header from "@/components/Header";
import { ResetPasswordForm } from "@/components/AuthForms";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Redefinir senha", robots: { index: false } };

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <><Header /><main className="auth">
    {user ? <ResetPasswordForm /> : <div className="card stack">
      <h1>Link inválido ou expirado</h1>
      <p>Para escolher uma nova senha, solicite outro e-mail de recuperação.</p>
      <Link href="/esqueci-senha" className="btn btn-primary">Solicitar novo link</Link>
    </div>}
  </main></>;
}
