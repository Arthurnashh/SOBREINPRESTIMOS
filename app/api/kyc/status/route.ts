import { NextResponse } from "next/server";
import { requireSession } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { getKyc } from "@/lib/kyc";

export const dynamic = "force-dynamic";

/**
 * Estado do KYC de quem está logado.
 * Usado pela tela de verificação para se atualizar após cada etapa.
 */
export async function GET() {
  const { supabase } = await requireSession();
  const r = await getKyc(await createClient()).meuStatus();

  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  void supabase;

  return NextResponse.json(r.data, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
