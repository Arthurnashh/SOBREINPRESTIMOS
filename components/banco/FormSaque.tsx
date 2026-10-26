"use client";

import { useActionState, useEffect, useState } from "react";
import { sacar, type BancoState } from "@/app/actions/banco";
import { brl } from "@/lib/format";
import Comprovante from "./Comprovante";

const METODOS = [
  { value: "pix", label: "PIX" },
  { value: "caixa", label: "Caixa eletrônico" },
  { value: "ted", label: "TED" },
] as const;

export default function FormSaque({ disponivel }: { disponivel: number }) {
  const [state, action, pending] = useActionState<BancoState, FormData>(sacar, undefined);
  const [metodo, setMetodo] = useState<string>(state?.fields?.method ?? "pix");
  const [valor, setValor] = useState(state?.fields?.amount ?? "");
  const id = state?.comprovante?.id;

  useEffect(() => {
    if (id) setValor("");
  }, [id]);

  return (
    <div className="stack" style={{ ["--gap" as string]: "16px" }}>
      {state?.comprovante && <Comprovante dados={state.comprovante} />}

      <form action={action} className="stack">
        {state?.error && (
          <div className="alert alert-err" role="alert">
            {state.error}
          </div>
        )}

        <div className="field">
          <label htmlFor="sq-method">Forma de saque</label>
          <select id="sq-method" name="method" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            {METODOS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="sq-amount">Valor</label>
          <input
            id="sq-amount"
            name="amount"
            required
            maxLength={30}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
          />
          <span className="fine">Disponível: {brl(disponivel)}</span>
        </div>

        <button className="btn btn-primary btn-block" disabled={pending}>
          {pending ? "Solicitando…" : "Sacar"}
        </button>

        <p className="fine">
          No saque em caixa você recebe um código de retirada. Nos demais, o valor é enviado na hora.
        </p>
      </form>
    </div>
  );
}
