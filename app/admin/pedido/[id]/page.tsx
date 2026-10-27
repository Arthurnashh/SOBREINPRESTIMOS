import Link from "next/link";
import { notFound } from "next/navigation";
import AdminDecision from "@/components/AdminDecision";
import { requireAdmin, STATUS_LABEL, type LoanRequest, type Profile } from "@/lib/account";
import { LOAN } from "@/lib/config";
import { brl, date, formatCpf, pct } from "@/lib/format";

/** Rótulos das garantias. Espelha o check de loan_requests no banco. */
const SEGURO_TEXTO: Record<string, string> = {
  veiculo: "Veículo em seu nome",
  imovel: "Imóvel próprio",
  vida: "Seguro de vida",
  residencial: "Seguro residencial",
  consignado: "Margem consignável ou convênio",
  fiador: "Fiador",
  nenhum: "Nenhuma garantia",
  outro: "Outra situação",
};

export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const { data: loan } = await supabase
    .from("loan_requests")
    .select("id, user_id, amount, installments, status, monthly_rate, iof, installment_value, cet_yearly, decision_note, created_at, seguro_tipo, seguro_descricao")
    .eq("id", id)
    .maybeSingle<LoanRequest & { user_id: string; iof: number | null; seguro_tipo: string | null; seguro_descricao: string | null }>();

  if (!loan) notFound();

  const { data: client } = await supabase
    .from("profiles")
    .select("id, full_name, cpf, phone, external_account_id, is_admin")
    .eq("id", loan.user_id)
    .maybeSingle<Profile>();

  return (
    <div className="stack" style={{ ["--gap" as string]: "20px", maxWidth: 760 }}>
      <Link href="/admin" className="muted" style={{ textDecoration: "none" }}>
        ← Voltar aos pedidos
      </Link>
      <div>
        <h1 className="page-title">
          {brl(Number(loan.amount))} em {loan.installments}x
        </h1>
        <p className="muted">
          Solicitado em {date(loan.created_at)} ·{" "}
          <span className={`badge b-${loan.status}`}>{STATUS_LABEL[loan.status]}</span>
        </p>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>Cliente</h2>
          <dl className="rows">
            <div><dt>Nome</dt><dd>{client?.full_name ?? "—"}</dd></div>
            <div><dt>CPF</dt><dd>{client ? formatCpf(client.cpf) : "—"}</dd></div>
            <div><dt>Celular</dt><dd>{client?.phone ?? "—"}</dd></div>
          </dl>
        </section>

        <section className="card">
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>Pedido</h2>
          <dl className="rows">
            <div><dt>Valor</dt><dd>{brl(Number(loan.amount))}</dd></div>
            <div><dt>Parcelas</dt><dd>{loan.installments}x</dd></div>
            {loan.installment_value != null && (
              <>
                <div><dt>Parcela contratada</dt><dd>{brl(Number(loan.installment_value))}</dd></div>
                <div><dt>Taxa</dt><dd>{loan.monthly_rate != null ? `${pct(Number(loan.monthly_rate))} a.m.` : "—"}</dd></div>
                <div><dt>CET</dt><dd>{loan.cet_yearly != null ? `${pct(Number(loan.cet_yearly))} a.a.` : "—"}</dd></div>
              </>
            )}
          </dl>
          {loan.decision_note && <p className="fine" style={{ marginTop: 10 }}>Obs.: {loan.decision_note}</p>}
        </section>
      </div>

      <section className="card">
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>Garantias declaradas</h2>
        {loan.seguro_tipo ? (
          <dl className="rows">
            <div>
              <dt>Situação</dt>
              <dd>{SEGURO_TEXTO[loan.seguro_tipo] ?? loan.seguro_tipo}</dd>
            </div>
            {loan.seguro_descricao && (
              <div>
                <dt>Descrição</dt>
                <dd>{loan.seguro_descricao}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="muted">
            Este pedido é anterior à pergunta sobre garantias, então não há declaração.
          </p>
        )}
      </section>

      <AdminDecision
        id={loan.id}
        amount={Number(loan.amount)}
        installments={loan.installments}
        defaultRate={loan.monthly_rate != null ? Number(loan.monthly_rate) : LOAN.monthlyRate}
        status={loan.status}
      />
    </div>
  );
}
