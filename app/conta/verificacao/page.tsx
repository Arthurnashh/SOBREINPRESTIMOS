import { requireSession } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { getKyc } from "@/lib/kyc";
import VerificacaoKyc from "@/components/kyc/VerificacaoKyc";
import Header from "@/components/Header";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function VerificacaoPage() {
  const { supabase } = await requireSession();
  const r = await getKyc(supabase).meuStatus();

  if (!r.ok) {
    return (
      <>
        <Header />
        <main className="wrap narrow">
          <div className="alert alert-err">{r.error}</div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="wrap narrow" style={{ paddingTop: 24, paddingBottom: 48 }}>
        <p className="fine" style={{ marginBottom: 12 }}>
          <Link href="/conta/banco">← Voltar para a conta</Link>
        </p>
        <VerificacaoKyc inicial={r.data} />
      </main>
    </>
  );
}
