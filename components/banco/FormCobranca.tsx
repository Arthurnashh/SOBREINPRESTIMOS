"use client";

import { useActionState, useEffect, useState } from "react";
import { criarCobranca, type BancoState } from "@/app/actions/banco";
import { brl } from "@/lib/format";

export default function FormCobranca() {
  const [state, action, pending] = useActionState<BancoState, FormData>(criarCobranca, undefined);
  const [valor, setValor] = useState(state?.fields?.amount ?? "");
  const [descricao, setDescricao] = useState(state?.fields?.description ?? "");
  const [copiado, setCopiado] = useState(false);
  const emv = state?.comprovante?.extra?.find((e) => e.rotulo === "PIX copia e cola")?.valor;

  useEffect(() => {
    if (emv) setCopiado(false);
  }, [emv]);

  async function copiar() {
    if (!emv) return;
    try {
      await navigator.clipboard.writeText(emv);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="stack" style={{ ["--gap" as string]: "16px" }}>
      {state?.comprovante && (
        <section className="receipt stack" role="status" aria-label="Cobrança PIX">
          <div>
            <span className="badge b-aprovado">Cobrança gerada</span>
            <h2>Receber {brl(state.comprovante.valor)}</h2>
          </div>
          {state.comprovante.descricao && <p>{state.comprovante.descricao}</p>}
          <p className="fine">
            Envie o código abaixo para quem vai pagar. O valor cai na sua conta assim que o PIX for
            confirmado.
          </p>
          <div className="field">
            <label htmlFor="cb-emv">PIX copia e cola</label>
            <textarea id="cb-emv" readOnly value={emv ?? ""} rows={3} style={{ fontSize: 12 }} />
          </div>
          <button type="button" className="btn btn-ghost" onClick={copiar}>
            {copiado ? "Copiado!" : "Copiar código"}
          </button>
        </section>
      )}

      <form action={action} className="stack">
        {state?.error && (
          <div className="alert alert-err" role="alert">
            {state.error}
          </div>
        )}

        <div className="field">
          <label htmlFor="cb-amount">Valor a receber</label>
          <input
            id="cb-amount"
            name="amount"
            required
            maxLength={30}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
          />
        </div>

        <div className="field">
          <label htmlFor="cb-desc">Descrição (opcional)</label>
          <input
            id="cb-desc"
            name="description"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            maxLength={140}
            placeholder="ex.: serviço prestado"
          />
        </div>

        <button className="btn btn-primary btn-block" disabled={pending}>
          {pending ? "Gerando…" : "Gerar cobrança"}
        </button>
      </form>
    </div>
  );
}
