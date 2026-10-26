"use client";

import { useActionState, useEffect, useState } from "react";
import { enviarPix, type BancoState } from "@/app/actions/banco";
import { brl } from "@/lib/format";
import Comprovante from "./Comprovante";

const TIPOS = [
  { value: "cpf", label: "CPF", placeholder: "000.000.000-00", mode: "numeric" },
  { value: "email", label: "E-mail", placeholder: "nome@exemplo.com", mode: "email" },
  { value: "telefone", label: "Celular", placeholder: "(11) 90000-0000", mode: "tel" },
  { value: "aleatoria", label: "Chave aleatória", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", mode: "text" },
] as const;

export default function FormPix({ disponivel }: { disponivel: number }) {
  const [state, action, pending] = useActionState<BancoState, FormData>(enviarPix, undefined);
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]["value"]>(
    (state?.fields?.keyType as (typeof TIPOS)[number]["value"]) ?? "cpf"
  );
  const [chave, setChave] = useState(state?.fields?.key ?? "");
  const [valor, setValor] = useState(state?.fields?.amount ?? "");
  const [mensagem, setMensagem] = useState(state?.fields?.description ?? "");
  const idComprovante = state?.comprovante?.id;

  useEffect(() => {
    if (idComprovante) {
      setChave("");
      setValor("");
      setMensagem("");
    }
  }, [idComprovante]);

  const atual = TIPOS.find((t) => t.value === tipo)!;

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
          <label htmlFor="pix-type">Tipo de chave</label>
          <select
            id="pix-type"
            name="keyType"
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value as typeof tipo);
              setChave("");
            }}
          >
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="pix-key">Chave de destino</label>
          <input
            id="pix-key"
            name="key"
            required
            value={chave}
            onChange={(e) => setChave(e.target.value)}
            maxLength={77}
            placeholder={atual.placeholder}
            inputMode={atual.mode}
            autoComplete="off"
          />
        </div>

        <div className="field">
          <label htmlFor="pix-amount">Valor</label>
          <input
            id="pix-amount"
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
          <label htmlFor="pix-desc">Mensagem (opcional)</label>
          <textarea
            id="pix-desc"
            name="description"
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            maxLength={140}
            rows={2}
          />
        </div>

        <button className="btn btn-primary btn-block" disabled={pending}>
          {pending ? "Enviando…" : "Enviar PIX"}
        </button>
      </form>
    </div>
  );
}
