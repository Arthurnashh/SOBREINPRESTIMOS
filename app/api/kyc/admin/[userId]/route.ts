import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { getKyc } from "@/lib/kyc";

export const dynamic = "force-dynamic";

/**
 * Detalhe de uma verificação para o admin, com URLs assinadas dos arquivos.
 * Só requireAdmin() passa daqui.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  await requireAdmin();
  const { userId } = await params;

  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    return NextResponse.json({ error: "identificador inválido" }, { status: 400 });
  }

  const supabase = await createClient();
  const kyc = getKyc(supabase);

  const r = await kyc.detalhe(userId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

  // assina cada arquivo por 10 minutos
  const urls: Record<string, string | null> = {};
  for (const [slot, path] of Object.entries(r.data.paths)) {
    urls[slot] = path ? await kyc.urlAssinada(path, 600) : null;
  }

  return NextResponse.json(
    { detalhe: r.data, urls },
    { headers: { "cache-control": "no-store, max-age=0" } }
  );
}
