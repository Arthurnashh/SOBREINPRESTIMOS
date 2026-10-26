"use client";

import { useActionState, useEffect, useState } from "react";
import { pagarBoleto, type BancoState } from "@/app/actions/banco";
import { brl } from "@/lib/format";
import Comprovante from "./Comprovante";

export default function FormBoleto({ disponivel }: { disponivel: number }) {
  const [state, action, pending] = useActionState<BancoState, FormData>(pagarBoleto, undefined);
  const [codigo, setCodigo] = useState(state?.fields?.barcode ?? "");
  const [beneficiario, setBeneficiario] = useState(state?.fields?.beneficiary ?? "");
  const [valor, setValor] = useState(state?.fields?.amount ?? "");
  const [vencimento, setVencimento] = useState(state?.fields?.dueDate ?? "");
  const id = state?.comprovante?.id;

  useEffect(() => {
    if (id) {
      setCodigo("");
      setBeneficiario("");
      setValor("");
      setVencimento("");
    }
  }, [id]);

  const digitos = codigo.replace(/\D/g, "").length;

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
          <label htmlFor="bl-code">Código de barras</label>
          <input
            id="bl-code"
            name="barcode"
            required
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            maxLength={60}
            inputMode="numeric"
            placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000"
          />
          <span className="fine">{digitos} dígitos informados</span>
        </div>

        <div className="field">
          <label htmlFor="bl-beneficiary">Beneficiário</label>
          <input
            id="bl-beneficiary"
            name="beneficiary"
            required
            value={beneficiario}
            onChange={(e) => setBeneficiario(e.target.value)}
            maxLength={80}
            placeholder="Nome de quem recebe"
          />
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="bl-amount">Valor</label>
            <input
              id="bl-amount"
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
            <label htmlFor="bl-due">Vencimento (opcional)</label>
            <input
              id="bl-due"
              name="dueDate"
              type="date"
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
            />
          </div>
        </div>

        <span className="fine">Disponível: {brl(disponivel)}</span>

        <button className="btn btn-primary btn-block" disabled={pending}>
          {pending ? "Pagando…" : "Pagar boleto"}
        </button>
      </form>
    </div>
  );
}
