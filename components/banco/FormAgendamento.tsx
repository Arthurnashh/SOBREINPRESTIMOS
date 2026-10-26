"use client";

import { useActionState, useEffect, useState } from "react";
import { agendar, type BancoState } from "@/app/actions/banco";
import { brl } from "@/lib/format";
import Comprovante from "./Comprovante";

const TIPOS = [
  { value: "pix", label: "PIX", dica: "chave PIX de destino" },
  { value: "transferencia", label: "Transferência", dica: "agência e conta (ex.: 0001/12345678)" },
  { value: "boleto", label: "Boleto", dica: "código de barras" },
] as const;

export default function FormAgendamento({ disponivel }: { disponivel: number }) {
  const [state, action, pending] = useActionState<BancoState, FormData>(agendar, undefined);
  const [tipo, setTipo] = useState<string>(state?.fields?.kind ?? "pix");
  const [destino, setDestino] = useState(state?.fields?.target ?? "");
  const [valor, setValor] = useState(state?.fields?.amount ?? "");
  const [data, setData] = useState(state?.fields?.runsOn ?? "");
  const [mensagem, setMensagem] = useState(state?.fields?.message ?? "");
  const id = state?.comprovante?.id;

  useEffect(() => {
    if (id) {
      setDestino("");
      setValor("");
      setData("");
      setMensagem("");
    }
  }, [id]);

  const atual = TIPOS.find((t) => t.value === tipo)!;
  const hoje = new Date().toISOString().slice(0, 10);

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
          <label htmlFor="ag-kind">Tipo</label>
          <select id="ag-kind" name="kind" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="ag-target">Destino</label>
          <input
            id="ag-target"
            name="target"
            required
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            maxLength={120}
            placeholder={atual.dica}
          />
          <span className="fine">{atual.dica}</span>
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="ag-amount">Valor</label>
            <input
              id="ag-amount"
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
            <label htmlFor="ag-date">Data</label>
            <input
              id="ag-date"
              name="runsOn"
              type="date"
              required
              min={hoje}
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="ag-msg">Mensagem (opcional)</label>
          <input
            id="ag-msg"
            name="message"
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            maxLength={140}
          />
        </div>

        <span className="fine">Disponível hoje: {brl(disponivel)}</span>

        <button className="btn btn-primary btn-block" disabled={pending}>
          {pending ? "Agendando…" : "Agendar"}
        </button>

        <p className="fine">
          O valor é debitado na data escolhida, se houver saldo. Você pode cancelar antes disso.
        </p>
      </form>
    </div>
  );
}
