"use client";

import { useActionState, useEffect, useState } from "react";
import { depositar, type BancoState } from "@/app/actions/banco";
import { brl } from "@/lib/format";
import Comprovante from "./Comprovante";

const METODOS = [
  { value: "pix", label: "PIX" },
  { value: "ted", label: "TED" },
  { value: "boleto", label: "Boleto" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cheque", label: "Cheque" },
] as const;

export default function FormDeposito() {
  const [state, action, pending] = useActionState<BancoState, FormData>(depositar, undefined);
  const [metodo, setMetodo] = useState<string>(state?.fields?.method ?? "pix");
  const [origem, setOrigem] = useState(state?.fields?.origin ?? "");
  const [valor, setValor] = useState(state?.fields?.amount ?? "");
  const id = state?.comprovante?.id;

  useEffect(() => {
    if (id) {
      setOrigem("");
      setValor("");
    }
  }, [id]);

  const precisaOrigem = metodo !== "dinheiro";

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
          <label htmlFor="dp-method">Forma de depósito</label>
          <select id="dp-method" name="method" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            {METODOS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {precisaOrigem && (
          <div className="field">
            <label htmlFor="dp-origin">
              Origem {metodo === "pix" ? "(chave ou nome de quem enviou)" : "(identificação)"}
            </label>
            <input
              id="dp-origin"
              name="origin"
              value={origem}
              onChange={(e) => setOrigem(e.target.value)}
              maxLength={80}
              placeholder={metodo === "pix" ? "nome ou chave de quem depositou" : "identificação do depósito"}
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="dp-amount">Valor</label>
          <input
            id="dp-amount"
            name="amount"
            required
            maxLength={30}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
          />
        </div>

        <button className="btn btn-primary btn-block" disabled={pending}>
          {pending ? "Depositando…" : "Depositar"}
        </button>

        <p className="fine">
          O valor entra na sua conta assim que o depósito é identificado. Guardamos o comprovante no
          seu extrato.
        </p>
      </form>
    </div>
  );
}
