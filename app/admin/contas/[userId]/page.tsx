import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import FichaConta from "@/components/admin/FichaConta";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ficha da conta" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ContaPage({ params }: { params: Promise<{ userId: string }> }) {
  await requireAdmin();
  const { userId } = await params;
  if (!UUID.test(userId)) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_ficha_conta", { p_user_id: userId });

  if (error || !data) {
    return (
      <main className="wrap" style={{ paddingTop: 28, paddingBottom: 56 }}>
        <p className="fine" style={{ marginBottom: 10 }}>
          <Link href="/admin/contas">← Voltar para as contas</Link>
        </p>
        <div className="alert alert-err" role="alert">
          {error?.message ?? "Não foi possível abrir esta conta."}
        </div>
      </main>
    );
  }

  return (
    <main className="wrap" style={{ paddingTop: 28, paddingBottom: 56 }}>
      <p className="fine" style={{ marginBottom: 10 }}>
        <Link href="/admin/contas">← Voltar para as contas</Link>
      </p>
      <FichaConta userId={userId} ficha={data as Record<string, unknown>} />
    </main>
  );
}
