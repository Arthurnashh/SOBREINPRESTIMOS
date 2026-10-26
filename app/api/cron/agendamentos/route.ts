import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * Executa os agendamentos bancários vencidos.
 *
 * Chamado pelo cron da Vercel. Protegido por CRON_SECRET: sem o header
 * correto ninguém dispara a fila de pagamentos pela internet.
 *
 * `bank_run_schedules` é SECURITY DEFINER e idempotente — ela marca o
 * agendamento como executado antes de mexer no saldo, então rodar duas
 * vezes no mesmo dia não debita em dobro.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Sem segredo configurado, o endpoint fica fechado em vez de aberto.
  if (!segredo) {
    return NextResponse.json({ erro: "cron não configurado" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  if (!url || !chave) {
    return NextResponse.json({ erro: "banco não configurado" }, { status: 503 });
  }

  const supabase = createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("bank_run_schedules");

  if (error) {
    console.error("bank_run_schedules falhou:", error.message);
    return NextResponse.json({ erro: "falha ao executar agendamentos" }, { status: 500 });
  }

  return NextResponse.json({ executados: Number(data ?? 0) });
}
