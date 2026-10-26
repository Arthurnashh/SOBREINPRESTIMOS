"use client";

import { useActionState, useEffect, useState } from "react";
import { salvarDadosCadastrais, type BancoState } from "@/app/actions/banco";
import type { BankProfile } from "@/lib/banking";

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR",
  "PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

export default function FormDadosCadastrais({ dados }: { dados: BankProfile | null }) {
  const [state, action, pending] = useActionState<BancoState, FormData>(salvarDadosCadastrais, undefined);

  const inicial = {
    addressLine: dados?.addressLine ?? "",
    addressNum: dados?.addressNum ?? "",
    complement: dados?.complement ?? "",
    district: dados?.district ?? "",
    city: dados?.city ?? "",
    state: dados?.state ?? "SP",
    zip: dados?.zip ?? "",
    occupation: dados?.occupation ?? "",
    income: dados?.income != null ? dados.income.toFixed(2).replace(".", ",") : "",
  };
  const [f, setF] = useState(inicial);
  const campo = (nome: keyof typeof inicial) => ({
    value: f[nome],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setF((v) => ({ ...v, [nome]: e.target.value })),
  });

  useEffect(() => {
    if (state?.ok) setF((v) => ({ ...v }));
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

      <div className="field">
        <label htmlFor="dc-address">Endereço</label>
        <input id="dc-address" name="addressLine" maxLength={120} placeholder="Rua, avenida…" {...campo("addressLine")} />
      </div>

      <div className="grid-2">
        <div className="field">
          <label htmlFor="dc-num">Número</label>
          <input id="dc-num" name="addressNum" maxLength={10} {...campo("addressNum")} />
        </div>
        <div className="field">
          <label htmlFor="dc-comp">Complemento</label>
          <input id="dc-comp" name="complement" maxLength={60} {...campo("complement")} />
        </div>
      </div>

      <div className="grid-2">
        <div className="field">
          <label htmlFor="dc-district">Bairro</label>
          <input id="dc-district" name="district" maxLength={60} {...campo("district")} />
        </div>
        <div className="field">
          <label htmlFor="dc-city">Cidade</label>
          <input id="dc-city" name="city" maxLength={60} {...campo("city")} />
        </div>
      </div>

      <div className="grid-2">
        <div className="field">
          <label htmlFor="dc-state">UF</label>
          <select id="dc-state" name="state" {...campo("state")}>
            {UFS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="dc-zip">CEP</label>
          <input id="dc-zip" name="zip" maxLength={9} inputMode="numeric" placeholder="00000-000" {...campo("zip")} />
        </div>
      </div>

      <div className="grid-2">
        <div className="field">
          <label htmlFor="dc-occupation">Profissão</label>
          <input id="dc-occupation" name="occupation" maxLength={60} {...campo("occupation")} />
        </div>
        <div className="field">
          <label htmlFor="dc-income">Renda mensal</label>
          <input id="dc-income" name="income" maxLength={30} inputMode="decimal" placeholder="0,00" {...campo("income")} />
        </div>
      </div>

      <button className="btn btn-ghost" disabled={pending} style={{ justifySelf: "start" }}>
        {pending ? "Salvando…" : "Salvar dados"}
      </button>
    </form>
  );
}
