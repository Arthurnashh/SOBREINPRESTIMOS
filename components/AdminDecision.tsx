"use client";

import { useActionState, useMemo, useState } from "react";
import { decideLoan, type AdminFormState } from "@/app/actions/admin";
import { LOAN } from "@/lib/config";
import { brl, pct } from "@/lib/format";
import { simulate } from "@/lib/loan";

type Props = {
  id: string;
  amount: number;
  installments: number;
  defaultRate: number;
  status: string;
};

export default function AdminDecision({ id, amount, installments, defaultRate, status }: Props) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(decideLoan, undefined);
  const [rate, setRate] = useState((defaultRate * 100).toString().replace(".", ","));

  const rateNum = Number(rate.replace(",", ".")) / 100;
  const valid = Number.isFinite(rateNum) && rateNum > 0 && rateNum <= LOAN.maxMonthlyRate;
  const sim = useMemo(
    () => (valid ? simulate(amount, installments, rateNum) : null),
    [valid, amount, installments, rateNum]
  );

  const done = status === "liberado" || status === "recusado" || status === "cancelado";

  return (
    <form action={action} className="card stack">
      <h2 style={{ fontSize: 22 }}>Decisão</h2>
      <input type="hidden" name="id" value={id} />

      {state?.error && <div className="alert alert-err" role="alert">{state.error}</div>}
      {state?.success && <div className="alert alert-ok" role="status">{state.success}</div>}

      {done ? (
        <p className="muted">Este pedido já foi finalizado ({status}).</p>
      ) : (
        <>
          <div className="field">
            <label htmlFor="monthly_rate">Taxa mensal aplicada (%)</label>
            <input
              id="monthly_rate"
              name="monthly_rate"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
            <span className="hint">
              Máximo permitido: {(LOAN.maxMonthlyRate * 100).toFixed(0)}% a.m. Acima disso
              caracteriza usura e é bloqueado.
            </span>
          </div>

          {sim ? (
            <div className="sim-result">
              <dl className="rows">
                <div><dt>Parcela</dt><dd>{brl(sim.installmentValue)} × {installments}</dd></div>
                <div><dt>IOF estimado</dt><dd>{brl(sim.iof)}</dd></div>
                <div><dt>Total a pagar</dt><dd>{brl(sim.total)}</dd></div>
                <div><dt>CET</dt><dd>{pct(sim.cetMonthly)} a.m. · {pct(sim.cetYearly)} a.a.</dd></div>
              </dl>
            </div>
          ) : (
            <div className="alert alert-warn">Informe uma taxa válida para calcular as condições.</div>
          )}

          <div className="field">
            <label htmlFor="note">Observação (opcional, vai para o cliente)</label>
            <textarea id="note" name="note" maxLength={200} />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              name="decision"
              value="aprovar"
              disabled={pending || !valid}
            >
              Aprovar com estas condições
            </button>
            <button className="btn btn-ghost" name="decision" value="recusar" disabled={pending}>
              Recusar
            </button>
          </div>
        </>
      )}

      {status === "aprovado" && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
          <p className="muted" style={{ marginBottom: 10 }}>
            Após a assinatura do contrato e o desembolso pela instituição parceira:
          </p>
          <button className="btn btn-primary" name="decision" value="liberar" disabled={pending}>
            Marcar como liberado
          </button>
        </div>
      )}
    </form>
  );
}
