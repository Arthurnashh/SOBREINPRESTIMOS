import { requireSession } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { getKyc } from "@/lib/kyc";
import VerificacaoKyc from "@/components/kyc/VerificacaoKyc";
import Header from "@/components/Header";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function VerificacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ depois?: string }>;
}) {
  const { supabase } = await requireSession();
  const r = await getKyc(supabase).meuStatus();

  // Destino informado pelo cadastro (ex.: o pedido de empréstimo que a pessoa
  // estava simulando). Só aceitamos caminho interno.
  const { depois } = await searchParams;
  const destino = depois && /^\/conta(\/[\w-]+)?(\?[\w=&%-]*)?$/.test(depois) ? depois : undefined;

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
          <Link href={destino ?? "/conta/banco"}>
            ← {destino ? "Continuar para o pedido" : "Voltar para a conta"}
          </Link>
        </p>
        <VerificacaoKyc inicial={r.data} depois={destino} />
      </main>
    </>
  );
}
