"use client";

import { useActionState, useEffect, useState } from "react";
import { salvarLimites, type BancoState } from "@/app/actions/banco";
import type { Limits } from "@/lib/banking";

const CAMPOS = [
  { name: "pixPerTx", label: "Limite por PIX", dica: "valor máximo em um único PIX" },
  { name: "pixPerDay", label: "Limite diário de PIX", dica: "soma de PIX enviados no dia" },
  { name: "transferPerTx", label: "Limite por transferência", dica: "valor máximo por TED interna" },
  { name: "withdrawPerDay", label: "Limite diário de saque", dica: "soma de saques no dia" },
] as const;

const formatar = (v: number) => (v > 0 ? v.toFixed(2).replace(".", ",") : "");

export default function FormLimites({ limites }: { limites: Limits }) {
  const [state, action, pending] = useActionState<BancoState, FormData>(salvarLimites, undefined);
  const inicial = {
    pixPerTx: formatar(limites.pixPerTx),
    pixPerDay: formatar(limites.pixPerDay),
    transferPerTx: formatar(limites.transferPerTx),
    withdrawPerDay: formatar(limites.withdrawPerDay),
  };
  const [valores, setValores] = useState<Record<string, string>>(inicial);

  useEffect(() => {
    if (state?.ok) setValores(inicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.ok]);

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

      <div className="grid-2">
        {CAMPOS.map((c) => (
          <div className="field" key={c.name}>
            <label htmlFor={`lm-${c.name}`}>{c.label}</label>
            <input
              id={`lm-${c.name}`}
              name={c.name}
              value={valores[c.name] ?? ""}
              onChange={(e) => setValores((v) => ({ ...v, [c.name]: e.target.value }))}
              maxLength={30}
              inputMode="decimal"
              placeholder="sem limite"
            />
            <span className="fine">{c.dica}</span>
          </div>
        ))}
      </div>

      <p className="fine">
        Deixe em branco para não ter limite. Os limites valem a partir da próxima operação.
      </p>

      <button className="btn btn-ghost" disabled={pending} style={{ justifySelf: "start" }}>
        {pending ? "Salvando…" : "Salvar limites"}
      </button>
    </form>
  );
}
