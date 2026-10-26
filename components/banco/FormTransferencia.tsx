"use client";

import { useActionState, useEffect, useState } from "react";
import { enviarTransferencia, type BancoState } from "@/app/actions/banco";
import { brl } from "@/lib/format";
import Comprovante from "./Comprovante";

export default function FormTransferencia({ disponivel }: { disponivel: number }) {
  const [state, action, pending] = useActionState<BancoState, FormData>(enviarTransferencia, undefined);
  const [agencia, setAgencia] = useState(state?.fields?.agency ?? "");
  const [conta, setConta] = useState(state?.fields?.number ?? "");
  const [valor, setValor] = useState(state?.fields?.amount ?? "");
  const [mensagem, setMensagem] = useState(state?.fields?.description ?? "");
  const id = state?.comprovante?.id;

  useEffect(() => {
    if (id) {
      setConta("");
      setValor("");
      setMensagem("");
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

        <div className="grid-2">
          <div className="field">
            <label htmlFor="tr-agency">Agência</label>
            <input
              id="tr-agency"
              name="agency"
              required
              value={agencia}
              onChange={(e) => setAgencia(e.target.value)}
              maxLength={6}
              inputMode="numeric"
              placeholder="0001"
            />
          </div>
          <div className="field">
            <label htmlFor="tr-number">Conta</label>
            <input
              id="tr-number"
              name="number"
              required
              value={conta}
              onChange={(e) => setConta(e.target.value)}
              maxLength={12}
              inputMode="numeric"
              placeholder="00000000"
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="tr-amount">Valor</label>
          <input
            id="tr-amount"
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

        <div className="field">
          <label htmlFor="tr-desc">Mensagem (opcional)</label>
          <textarea
            id="tr-desc"
            name="description"
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            maxLength={140}
            rows={2}
          />
        </div>

        <button className="btn btn-primary btn-block" disabled={pending}>
          {pending ? "Transferindo…" : "Transferir"}
        </button>
      </form>
    </div>
  );
}
