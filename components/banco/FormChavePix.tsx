"use client";

import { useActionState, useEffect, useState } from "react";
import { adicionarChavePix, type BancoState } from "@/app/actions/banco";

const TIPOS = [
  { value: "cpf", label: "CPF", placeholder: "000.000.000-00", mode: "numeric" },
  { value: "email", label: "E-mail", placeholder: "nome@exemplo.com", mode: "email" },
  { value: "telefone", label: "Celular", placeholder: "(11) 90000-0000", mode: "tel" },
  { value: "aleatoria", label: "Chave aleatória", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", mode: "text" },
] as const;

export default function FormChavePix() {
  const [state, action, pending] = useActionState<BancoState, FormData>(adicionarChavePix, undefined);
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]["value"]>(
    (state?.fields?.keyType as (typeof TIPOS)[number]["value"]) ?? "cpf"
  );
  const [valor, setValor] = useState(state?.fields?.key ?? "");

  useEffect(() => {
    if (state?.ok) setValor("");
  }, [state?.ok]);

  const atual = TIPOS.find((t) => t.value === tipo)!;

  return (
    <form action={action} className="stack" style={{ ["--gap" as string]: "12px" }}>
      {state?.error && (
        <div className="alert alert-err" role="alert">
          {state.error}
        </div>
      )}
      {state?.ok && (
        <div className="alert alert-ok" role="status">
          {state.ok}
        </div>
      )}

      <div className="grid-2" style={{ alignItems: "end" }}>
        <div className="field">
          <label htmlFor="kp-type">Tipo</label>
          <select
            id="kp-type"
            name="keyType"
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value as typeof tipo);
              setValor("");
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
          <label htmlFor="kp-value">Chave</label>
          <input
            id="kp-value"
            name="key"
            required
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            maxLength={77}
            placeholder={atual.placeholder}
            inputMode={atual.mode}
            autoComplete="off"
          />
        </div>
      </div>

      <button className="btn btn-ghost" disabled={pending} style={{ justifySelf: "start" }}>
        {pending ? "Cadastrando…" : "Cadastrar chave"}
      </button>
    </form>
  );
}
