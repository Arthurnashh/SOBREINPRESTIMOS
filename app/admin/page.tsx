import Link from "next/link";
import { requireAdmin, STATUS_LABEL, type LoanRequest } from "@/lib/account";
import { brl, date, formatCpf } from "@/lib/format";

type Row = LoanRequest & { user_id: string };

const FILTERS = [
  { key: "em_analise", label: "Em análise" },
  { key: "aprovado", label: "Aprovados" },
  { key: "liberado", label: "Liberados" },
  { key: "recusado", label: "Recusados" },
  { key: "todos", label: "Todos" },
] as const;

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const { status } = await searchParams;
  const filter = FILTERS.some((f) => f.key === status) ? status! : "em_analise";

  let query = supabase
    .from("loan_requests")
    .select("id, user_id, amount, installments, status, monthly_rate, installment_value, cet_yearly, decision_note, created_at");
  if (filter !== "todos") query = query.eq("status", filter);

  const { data: loans } = await query
    .order("created_at", { ascending: false })
    .returns<Row[]>();

  // Perfis dos clientes dos pedidos listados.
  const ids = [...new Set((loans ?? []).map((l) => l.user_id))];
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, full_name, cpf, phone").in("id", ids)
    : { data: [] as { id: string; full_name: string; cpf: string; phone: string | null }[] };
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  // Contadores por status (independente do filtro atual).
  const { data: all } = await supabase.from("loan_requests").select("status").returns<{ status: string }[]>();
  const count = (s: string) => (all ?? []).filter((r) => r.status === s).length;

  return (
    <div className="stack" style={{ ["--gap" as string]: "24px" }}>
      <div>
        <h1 className="page-title">Pedidos de empréstimo</h1>
        <p className="muted">Analise, aprove ou recuse as solicitações.</p>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        {([
          ["Em análise", count("em_analise")],
          ["Aprovados", count("aprovado")],
          ["Liberados", count("liberado")],
          ["Recusados", count("recusado")],
        ] as const).map(([label, n]) => (
          <div className="card" key={label}>
            <div className="kpi-label">{label}</div>
            <div className="kpi" style={{ fontSize: 32 }}>{n}</div>
          </div>
        ))}
      </div>

      <div className="nav" style={{ flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/admin?status=${f.key}`}
            className={`btn ${filter === f.key ? "btn-primary" : "btn-ghost"}`}
            style={{ height: 38, fontSize: 14 }}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <section className="card">
        {!loans?.length ? (
          <div className="empty">Nenhum pedido neste filtro.</div>
        ) : (
          <ul className="list">
            {loans.map((l) => {
              const p = byId.get(l.user_id);
              return (
                <li key={l.id}>
                  <div>
                    <strong>{p?.full_name ?? "—"}</strong>
                    <div className="fine">
                      CPF {p ? formatCpf(p.cpf) : "—"} · {date(l.created_at)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", display: "flex", gap: 16, alignItems: "center" }}>
                    <div>
                      <div>
                        <strong>{brl(Number(l.amount))}</strong>{" "}
                        <span className="muted">em {l.installments}x</span>
                      </div>
                      <span className={`badge b-${l.status}`}>{STATUS_LABEL[l.status]}</span>
                    </div>
                    <Link href={`/admin/pedido/${l.id}`} className="btn btn-ghost" style={{ height: 38 }}>
                      Analisar
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
