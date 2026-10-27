"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { requestLoan, type LoanFormState } from "@/app/actions/loans";
import { LOAN } from "@/lib/config";
import { brl, pct } from "@/lib/format";
import { PERIODICIDADES, PERIODO, simulate, type Periodicidade } from "@/lib/loan";
import { SEGURO_LABEL, SEGURO_TIPOS } from "@/lib/seguro";

type Props = {
  mode: "landing" | "request";
  initialAmount?: number;
  initialInstallments?: number;
};

export default function Simulator({ mode, initialAmount = 5000, initialInstallments = 12 }: Props) {
  const [amount, setAmount] = useState(initialAmount);
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>("mensal");
  const [installments, setInstallments] = useState(initialInstallments);
  const [seguro, setSeguro] = useState("");
  const [state, action, pending] = useActionState<LoanFormState, FormData>(requestLoan, undefined);

  const per = PERIODO[periodicidade];
  const opcoes = per.opcoes;

  // Ao trocar a periodicidade, o prazo escolhido pode não existir na nova
  // modalidade (18 não existe em semanal, por exemplo). Ajusta para o mais
  // próximo disponível em vez de deixar o formulário num estado inválido.
  const trocarPeriodicidade = (p: Periodicidade) => {
    setPeriodicidade(p);
    if (!(PERIODO[p].opcoes as readonly number[]).includes(installments)) {
      setInstallments(PERIODO[p].opcoes[PERIODO[p].opcoes.length - 1]);
    }
  };

  const sim = useMemo(
    () => simulate(amount, installments, LOAN.monthlyRate, periodicidade),
    [amount, installments, periodicidade]
  );

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
        <span>Como prefere pagar?</span>
      </div>
      <div className="seg" role="radiogroup" aria-label="Periodicidade">
        {PERIODICIDADES.map((p) => (
          <label key={p}>
            <input
              type="radio"
              name="periodicidade"
              value={p}
              checked={periodicidade === p}
              onChange={() => trocarPeriodicidade(p)}
            />
            <span>{PERIODO[p].label}</span>
          </label>
        ))}
      </div>

      <div className="sim-label" style={{ marginTop: 24 }}>
        <span>Em quantas parcelas?</span>
        <span className="muted">({per.unidade})</span>
      </div>
      <div className="seg" role="radiogroup" aria-label="Número de parcelas">
        {opcoes.map((n) => (
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
          <span>
            {installments} {installments === 1 ? "parcela" : "parcelas"} de
          </span>
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
            <dd>
              {pct(sim.taxaPeriodo)} por {per.label.toLowerCase().replace("al", "")}
              <span className="fine"> ({pct(sim.monthlyRate)} a.m.)</span>
            </dd>
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

      {/* Declaração de garantias. Obrigatória: é o que permite à análise
          separar quem tem garantia real de quem não tem. */}
      <fieldset className="field" style={{ marginTop: 24, border: 0, padding: 0 }}>
        <legend style={{ fontWeight: 600, marginBottom: 4 }}>
          Você possui algum tipo de seguro ou garantia?
        </legend>
        <p className="hint" style={{ marginBottom: 10 }}>
          Marque a opção que se aplica. Ter garantia ajuda na análise do seu pedido.
        </p>

        <div className="opcoes-seguro">
          {SEGURO_TIPOS.map((t) => (
            <label key={t} className="opcao">
              <input
                type="radio"
                name="seguro_tipo"
                value={t}
                checked={seguro === t}
                onChange={() => setSeguro(t)}
                required
              />
              <span>{SEGURO_LABEL[t]}</span>
            </label>
          ))}
        </div>

        {seguro === "outro" && (
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="seguro_descricao">Descreva a sua situação</label>
            <textarea
              id="seguro_descricao"
              name="seguro_descricao"
              maxLength={300}
              required
              placeholder="Ex.: tenho uma moto em nome do meu pai e sou sócio de uma loja"
            />
            <span className="hint">Até 300 caracteres.</span>
          </div>
        )}
      </fieldset>

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
