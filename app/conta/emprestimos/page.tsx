import Link from "next/link";
import { requireSession } from "@/lib/account";
import { getBanking } from "@/lib/banking";
import { brl, date, pct } from "@/lib/format";
import { PERIODO, type Periodicidade } from "@/lib/loan";
import Parcelas, { type Parcela } from "@/components/Parcelas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meus empréstimos" };

type Contrato = {
  pedido: {
    id: string;
    amount: number;
    installments: number;
    status: string;
    monthly_rate: number | null;
    installment_value: number | null;
    cet_yearly: number | null;
    periodicidade: Periodicidade;
    taxa_periodo: number | null;
    created_at: string;
    seguro_tipo: string | null;
  };
  parcelas: Parcela[];
  total_pago: number;
  total_contrato: number;
  saldo_devedor: number;
  pagas: number;
  abertas: number;
  atrasadas: number;
  proximo_vencimento: string | null;
};

const ROTULO_SEGURO: Record<string, string> = {
  veiculo: "Veículo em seu nome",
  imovel: "Imóvel próprio",
  vida: "Seguro de vida",
  residencial: "Seguro residencial",
  consignado: "Margem consignável ou convênio",
  fiador: "Fiador",
  nenhum: "Nenhuma garantia",
  outro: "Outra situação",
};

export default async function MeusEmprestimosPage() {
  const { supabase } = await requireSession();
  const bank = getBanking(supabase);
  await bank.ensureAccount();

  // Só contratos liberados têm cronograma. Os demais aparecem como pedido.
  const { data: loans } = await supabase
    .from("loan_requests")
    .select("id, amount, installments, status, created_at")
    .order("created_at", { ascending: false })
    .returns<{ id: string; amount: number; installments: number; status: string; created_at: string }[]>();

  const liberados = (loans ?? []).filter((l) => l.status === "liberado");

  const contratos: Contrato[] = [];
  for (const l of liberados) {
    const { data } = await supabase.rpc("loan_contrato", { p_loan_id: l.id });
    if (data) contratos.push(data as Contrato);
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const emAberto = (loans ?? []).filter((l) => l.status === "em_analise" || l.status === "aprovado");

  const totalDevedor = contratos.reduce((s, c) => s + Number(c.saldo_devedor ?? 0), 0);

  return (
    <div className="stack" style={{ ["--gap" as string]: "20px" }}>
      <div>
        <h1 className="page-title">Meus empréstimos</h1>
        <p className="muted">
          Acompanhe o contrato, as parcelas e quanto falta pagar.
        </p>
      </div>

      {!contratos.length && !emAberto.length ? (
        <section className="card">
          <div className="empty">
            Você ainda não tem empréstimo contratado.
            <div style={{ marginTop: 14 }}>
              <Link href="/conta/emprestimo" className="btn btn-primary">
                Simular e pedir
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {emAberto.length > 0 && (
        <section className="card">
          <h2 style={{ fontSize: 20, marginBottom: 10 }}>Pedidos em andamento</h2>
          <ul className="list">
            {emAberto.map((l) => (
              <li key={l.id}>
                <div>
                  <strong>{brl(Number(l.amount))}</strong>{" "}
                  <span className="muted">em {l.installments}x</span>
                  <div className="fine">{date(l.created_at)}</div>
                </div>
                <span className={`badge b-${l.status}`}>
                  {l.status === "em_analise" ? "Em análise" : "Aprovado, aguardando liberação"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {contratos.length > 1 && (
        <section className="card">
          <div className="kpi-label">Saldo devedor total</div>
          <div className="kpi">{brl(totalDevedor)}</div>
        </section>
      )}

      {contratos.map((c) => {
        const p = c.pedido;
        const per = PERIODO[p.periodicidade] ?? PERIODO.mensal;
        const quitado = Number(c.saldo_devedor) <= 0 && c.parcelas.length > 0;
        const progresso =
          c.total_contrato > 0 ? Math.min(100, (Number(c.total_pago) / c.total_contrato) * 100) : 0;

        return (
          <section className="card stack" key={p.id} style={{ ["--gap" as string]: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ fontSize: 22, margin: 0 }}>
                  {brl(Number(p.amount))} em {p.installments} {per.unidade}
                </h2>
                <p className="muted" style={{ marginTop: 4 }}>
                  Contratado em {date(p.created_at)} · pagamento {per.label.toLowerCase()}
                </p>
              </div>
              <span className={`badge ${quitado ? "b-aprovado" : "b-em_analise"}`}>
                {quitado ? "Quitado" : c.atrasadas > 0 ? `${c.atrasadas} em atraso` : "Em dia"}
              </span>
            </div>

            <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
              <div>
                <div className="kpi-label">Valor da parcela</div>
                <div className="kpi" style={{ fontSize: 24 }}>
                  {brl(Number(p.installment_value ?? 0))}
                </div>
              </div>
              <div>
                <div className="kpi-label">Já pago</div>
                <div className="kpi" style={{ fontSize: 24 }}>{brl(Number(c.total_pago))}</div>
                <div className="fine">
                  {c.pagas} de {c.parcelas.length} parcela(s)
                </div>
              </div>
              <div>
                <div className="kpi-label">Saldo devedor</div>
                <div className="kpi" style={{ fontSize: 24 }}>{brl(Number(c.saldo_devedor))}</div>
              </div>
              <div>
                <div className="kpi-label">Próximo vencimento</div>
                <div className="kpi" style={{ fontSize: 24 }}>
                  {c.proximo_vencimento ? date(c.proximo_vencimento) : "—"}
                </div>
              </div>
            </div>

            {c.total_contrato > 0 && (
              <div>
                <div className="barra" aria-hidden="true">
                  <span style={{ width: `${progresso}%` }} />
                </div>
                <p className="fine">{progresso.toFixed(0)}% do contrato pago</p>
              </div>
            )}

            <dl className="rows">
              <div>
                <dt>Valor liberado</dt>
                <dd>{brl(Number(p.amount))}</dd>
              </div>
              <div>
                <dt>Taxa do período</dt>
                <dd>
                  {p.taxa_periodo != null
                    ? `${pct(Number(p.taxa_periodo))} ${per.porPeriodo}`
                    : p.monthly_rate != null
                    ? `${pct(Number(p.monthly_rate))} a.m.`
                    : "—"}
                </dd>
              </div>
              {p.cet_yearly != null && (
                <div>
                  <dt>CET</dt>
                  <dd>{pct(Number(p.cet_yearly))} a.a.</dd>
                </div>
              )}
              <div>
                <dt>Total do contrato</dt>
                <dd>{brl(Number(c.total_contrato))}</dd>
              </div>
              {p.seguro_tipo && (
                <div>
                  <dt>Garantia declarada</dt>
                  <dd>{ROTULO_SEGURO[p.seguro_tipo] ?? p.seguro_tipo}</dd>
                </div>
              )}
            </dl>

            <h3 style={{ fontSize: 17, marginTop: 6 }}>Parcelas</h3>
            <Parcelas parcelas={c.parcelas} hoje={hoje} />
          </section>
        );
      })}
    </div>
  );
}
