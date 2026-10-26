import Link from "next/link";
import { cancelLoan } from "@/app/actions/loans";
import { requireSession, STATUS_LABEL, type LoanRequest } from "@/lib/account";
import { getBanking } from "@/lib/banking";
import { brl, date, pct } from "@/lib/format";
import { simulate } from "@/lib/loan";

export default async function ContaPage({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string }>;
}) {
  const { pedido } = await searchParams;
  const { supabase, profile, user } = await requireSession();
  const banking = getBanking(user.id);
  const extId = profile?.external_account_id ?? null;

  const [{ data: loans }, account, statement] = await Promise.all([
    supabase
      .from("loan_requests")
      .select("id, amount, installments, status, monthly_rate, installment_value, cet_yearly, decision_note, created_at")
      .order("created_at", { ascending: false })
      .returns<LoanRequest[]>(),
    banking.getAccount(extId),
    banking.getStatement(extId),
  ]);

  const firstName = profile?.full_name.split(" ")[0] ?? "";
  const hasOpen = loans?.some((l) => l.status === "em_analise" || l.status === "aprovado");

  return (
    <div className="stack" style={{ ["--gap" as string]: "20px" }}>
      <div>
        <h1 className="page-title">Olá, {firstName}</h1>
        <p className="muted">Aqui está o resumo da sua conta.</p>
      </div>

      {pedido === "enviado" && (
        <div className="alert alert-ok" role="status">
          <div>
            <strong>Pedido enviado para análise.</strong>
            Você verá o resultado aqui. Nunca pediremos pagamento para liberar o valor.
          </div>
        </div>
      )}

      <div className="grid-2">
        <section className="card">
          <div className="kpi-label">{banking.isDemo ? "Saldo fictício · demonstração" : "Saldo disponível"}</div>
          {account ? (
            <>
              <div className="kpi">{brl(account.balance)}</div>
              <p className="muted" style={{ marginTop: 6 }}>
                Ag. {account.agency} · Conta {account.number}
              </p>
              <Link href="/conta/pix" className="btn btn-ghost" style={{ marginTop: 16 }}>
                {banking.isDemo ? "Simular PIX" : "Fazer PIX"}
              </Link>
            </>
          ) : (
            <>
              <div className="kpi muted">—</div>
              <p className="muted" style={{ marginTop: 6 }}>
                Sua conta digital é aberta pela instituição parceira após a validação do cadastro.
              </p>
            </>
          )}
        </section>

        <section className="card">
          <div className="kpi-label">Crédito</div>
          <div className="kpi">até {brl(20000)}</div>
          <p className="muted" style={{ marginTop: 6 }}>Sem taxa antecipada. Sujeito a análise.</p>
          {!hasOpen && (
            <Link href="/conta/emprestimo" className="btn btn-primary" style={{ marginTop: 16 }}>
              Simular e pedir
            </Link>
          )}
        </section>
      </div>

      <section className="card">
        <h2 style={{ fontSize: 22, marginBottom: 8 }}>Seus pedidos</h2>
        {!loans?.length ? (
          <div className="empty">Nenhum pedido ainda.</div>
        ) : (
          <ul className="list">
            {loans.map((l) => {
              const contracted = l.installment_value != null;
              const est = simulate(Number(l.amount), l.installments);
              return (
                <li key={l.id}>
                  <div>
                    <strong>{brl(Number(l.amount))}</strong>{" "}
                    <span className="muted">em {l.installments}x</span>
                    <div className="fine">
                      {contracted
                        ? `Parcela ${brl(Number(l.installment_value))}${
                            l.cet_yearly != null ? ` · CET ${pct(Number(l.cet_yearly))} a.a.` : ""
                          }`
                        : `Parcela estimada ${brl(est.installmentValue)}`}{" "}
                      · {date(l.created_at)}
                    </div>
                    {l.decision_note && <div className="fine">{l.decision_note}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span className={`badge b-${l.status}`}>{STATUS_LABEL[l.status]}</span>
                    {l.status === "em_analise" && (
                      <form action={cancelLoan} style={{ marginTop: 8 }}>
                        <input type="hidden" name="id" value={l.id} />
                        <button className="link-btn">Cancelar</button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 style={{ fontSize: 22, marginBottom: 8 }}>{banking.isDemo ? "Extrato demonstrativo" : "Extrato"}</h2>
        {banking.isDemo && <p className="fine">Movimentações fictícias. Mostramos as oito simulações de PIX mais recentes neste navegador.</p>}
        {!statement.length ? (
          <div className="empty">Sem movimentações.</div>
        ) : (
          <ul className="list">
            {statement.map((t) => (
              <li key={t.id}>
                <div>
                  <div>{t.description}</div>
                  <div className="fine">{date(t.date)}</div>
                </div>
                <span className={t.amount >= 0 ? "in" : "out"}>
                  {t.amount >= 0 ? "+ " : "− "}
                  {brl(Math.abs(t.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
