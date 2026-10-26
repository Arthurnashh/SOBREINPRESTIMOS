"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { requestLoan, type LoanFormState } from "@/app/actions/loans";
import { LOAN } from "@/lib/config";
import { brl, pct } from "@/lib/format";
import { simulate } from "@/lib/loan";

type Props = {
  mode: "landing" | "request";
  initialAmount?: number;
  initialInstallments?: number;
};

export default function Simulator({ mode, initialAmount = 5000, initialInstallments = 12 }: Props) {
  const [amount, setAmount] = useState(initialAmount);
  const [installments, setInstallments] = useState(initialInstallments);
  const [state, action, pending] = useActionState<LoanFormState, FormData>(requestLoan, undefined);
  const sim = useMemo(() => simulate(amount, installments), [amount, installments]);

  const body = (
    <>
      <div className="sim-label">
        <span>Quanto você precisa?</span>
        <span className="muted">de {brl(LOAN.min)} a {brl(LOAN.max)}</span>
      </div>
      <div className="sim-amount" aria-live="polite">{brl(amount)}</div>
      <input
        type="range"
        name="amount"
        min={LOAN.min}
        max={LOAN.max}
        step={LOAN.step}
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
        aria-label="Valor do empréstimo"
      />
      <div className="range-ends">
        <span>{brl(LOAN.min)}</span>
        <span>{brl(LOAN.max)}</span>
      </div>

      <div className="sim-label" style={{ marginTop: 24 }}>
        <span>Em quantas parcelas?</span>
      </div>
      <div className="seg" role="radiogroup" aria-label="Número de parcelas">
        {LOAN.installmentOptions.map((n) => (
          <label key={n}>
            <input
              type="radio"
              name="installments"
              value={n}
              checked={installments === n}
              onChange={() => setInstallments(n)}
            />
            <span>{n}x</span>
          </label>
        ))}
      </div>

      <div className="sim-result">
        <div className="sim-label">
          <span>{installments} parcelas fixas de</span>
        </div>
        <div className="big">{brl(sim.installmentValue)}</div>
        <dl className="rows">
          <div className="zero">
            <dt>Taxa antecipada para liberar</dt>
            <dd>R$ 0,00</dd>
          </div>
          <div>
            <dt>Você recebe na conta</dt>
            <dd>{brl(sim.amount)}</dd>
          </div>
          <div>
            <dt>Juros</dt>
            <dd>{pct(sim.monthlyRate)} a.m.</dd>
          </div>
          <div>
            <dt>IOF (incluso nas parcelas)</dt>
            <dd>{brl(sim.iof)}</dd>
          </div>
          <div>
            <dt>Total a pagar</dt>
            <dd>{brl(sim.total)}</dd>
          </div>
          <div>
            <dt>CET</dt>
            <dd>
              {pct(sim.cetMonthly)} a.m. · {pct(sim.cetYearly)} a.a.
            </dd>
          </div>
        </dl>
      </div>
    </>
  );

  if (mode === "landing") {
    return (
      <div className="card stack" style={{ ["--gap" as string]: "0px" }}>
        {body}
        <Link
          href={`/cadastro?valor=${amount}&parcelas=${installments}`}
          className="btn btn-primary btn-block"
          style={{ marginTop: 20 }}
        >
          Quero esse empréstimo
        </Link>
        <p className="fine" style={{ marginTop: 12 }}>
          Simulação ilustrativa. Taxa, IOF e CET definitivos são apresentados após a análise de
          crédito, antes da assinatura do contrato.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="card">
      {body}
      <label className="checkbox" style={{ marginTop: 20 }}>
        <input type="checkbox" name="confirm" required />
        <span>
          Li as condições da simulação e entendo que o crédito está sujeito a análise. Nenhum
          valor será cobrado antes da liberação.
        </span>
      </label>
      {state?.error && (
        <div className="alert alert-err" role="alert" style={{ marginTop: 16 }}>
          {state.error}
        </div>
      )}
      <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} disabled={pending}>
        {pending ? "Enviando…" : "Enviar pedido para análise"}
      </button>
    </form>
  );
}
