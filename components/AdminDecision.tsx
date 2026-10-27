"use client";

import { useMemo, useState, useTransition } from "react";
import { decideLoan } from "@/app/actions/admin";
import { LOAN } from "@/lib/config";
import { brl, pct } from "@/lib/format";
import { simulate, taxaAdesao } from "@/lib/loan";

type Props = {
  id: string;
  amount: number;
  installments: number;
  defaultRate: number;
  status: string;
};

type Aviso = { tipo: "ok" | "erro"; texto: string } | null;

/*
 * Os botões chamam a action direto, passando a decisão por argumento.
 *
 * Antes usávamos `useActionState` + `<button name="decision" value="...">`, e
 * o valor do botão clicado se perdia no caminho: o React envia o FormData
 * capturado na renderização, e o `value` do botão só entra no envio nativo do
 * navegador — que aqui não acontece. Toda aprovação caía em "Ação inválida.".
 */
export default function AdminDecision({ id, amount, installments, defaultRate, status }: Props) {
  /*
   * Arredonda na exibição. `defaultRate * 100` produz coisas como
   * 3,9899999999999998 por causa do ponto flutuante, e o admin via esse lixo
   * no campo de taxa. Duas casas bastam para a taxa mensal.
   */
  const [rate, setRate] = useState((defaultRate * 100).toFixed(2).replace(".", ","));
  const [note, setNote] = useState("");
  const [aviso, setAviso] = useState<Aviso>(null);
  const [pendente, iniciar] = useTransition();

  const rateNum = Number(rate.replace(",", ".")) / 100;
  const valid = Number.isFinite(rateNum) && rateNum > 0 && rateNum <= LOAN.maxMonthlyRate;
  const sim = useMemo(
    () => (valid ? simulate(amount, installments, rateNum) : null),
    [valid, amount, installments, rateNum]
  );

  const done = status === "liberado" || status === "recusado" || status === "cancelado";

  const agir = (decisao: "aprovar" | "recusar" | "liberar") => {
    setAviso(null);
    iniciar(async () => {
      const r = await decideLoan(decisao, id, valid ? rateNum : null, note.trim() || null);
      if (r?.error) setAviso({ tipo: "erro", texto: r.error });
      else if (r?.success) setAviso({ tipo: "ok", texto: r.success });
    });
  };

  return (
    <section className="card stack">
      <h2 style={{ fontSize: 22 }}>Decisão</h2>

      {aviso?.tipo === "erro" && <div className="alert alert-err" role="alert">{aviso.texto}</div>}
      {aviso?.tipo === "ok" && <div className="alert alert-ok" role="status">{aviso.texto}</div>}

      {done ? (
        <p className="muted">Este pedido já foi finalizado ({status}).</p>
      ) : (
        <>
          <div className="field">
            <label htmlFor="monthly_rate">Taxa mensal aplicada (%)</label>
            <input
              id="monthly_rate"
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
                <div>
                  <dt>Taxa de confiança</dt>
                  <dd>
                    {brl(taxaAdesao(sim.installmentValue))} ({pct(LOAN.taxaAdesaoPct, 0)} da
                    parcela, abatida na 1ª)
                  </dd>
                </div>
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
            <textarea id="note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => agir("aprovar")}
              disabled={pendente || !valid}
            >
              {pendente ? "Processando…" : "Aprovar com estas condições"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => agir("recusar")} disabled={pendente}>
              Recusar
            </button>
          </div>
        </>
      )}

      {status === "aprovado" && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
          <p className="muted" style={{ marginBottom: 10 }}>
            Após a assinatura do contrato e o desembolso pela instituição parceira. A liberação
            credita o valor integral e mantém o saldo bloqueado até o cliente confirmar a taxa de
            confiança — o valor é abatido na primeira parcela.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => agir("liberar")} disabled={pendente}>
            {pendente ? "Processando…" : "Marcar como liberado"}
          </button>
        </div>
      )}
    </section>
  );
}
