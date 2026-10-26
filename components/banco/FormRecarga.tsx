"use client";

import { useActionState, useEffect, useState } from "react";
import { recarregar, type BancoState } from "@/app/actions/banco";
import { brl } from "@/lib/format";
import Comprovante from "./Comprovante";

const OPERADORAS = ["Vivo", "Claro", "TIM", "Oi", "Nextel", "Algar"];
const VALORES = ["15,00", "20,00", "30,00", "40,00", "50,00", "100,00"];

export default function FormRecarga({ disponivel }: { disponivel: number }) {
  const [state, action, pending] = useActionState<BancoState, FormData>(recarregar, undefined);
  const [operadora, setOperadora] = useState(state?.fields?.carrier ?? OPERADORAS[0]);
  const [telefone, setTelefone] = useState(state?.fields?.phone ?? "");
  const [valor, setValor] = useState(state?.fields?.amount ?? "");
  const id = state?.comprovante?.id;

  useEffect(() => {
    if (id) {
      setTelefone("");
      setValor("");
    }
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
          <label htmlFor="rc-carrier">Operadora</label>
          <select id="rc-carrier" name="carrier" value={operadora} onChange={(e) => setOperadora(e.target.value)}>
            {OPERADORAS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="rc-phone">Celular</label>
          <input
            id="rc-phone"
            name="phone"
            required
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            maxLength={20}
            inputMode="tel"
            placeholder="(11) 90000-0000"
          />
        </div>

        <div className="field">
          <label htmlFor="rc-amount">Valor</label>
          <input
            id="rc-amount"
            name="amount"
            required
            maxLength={30}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {VALORES.map((v) => (
              <button
                key={v}
                type="button"
                className="btn btn-ghost"
                style={{ height: 34, fontSize: 13, padding: "0 12px" }}
                onClick={() => setValor(v)}
              >
                R$ {v}
              </button>
            ))}
          </div>
        </div>

        <span className="fine">Disponível: {brl(disponivel)}</span>

        <button className="btn btn-primary btn-block" disabled={pending}>
          {pending ? "Recarregando…" : "Recarregar"}
        </button>
      </form>
    </div>
  );
}
