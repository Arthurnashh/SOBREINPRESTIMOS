"use client";

import { useActionState, useEffect, useState } from "react";
import { sendPix, type PixFormState } from "@/app/actions/pix";
import { brl } from "@/lib/format";

const TYPES = [
  { value: "cpf", label: "CPF", placeholder: "000.000.000-00", mode: "numeric" },
  { value: "email", label: "E-mail", placeholder: "nome@exemplo.com", mode: "email" },
  { value: "telefone", label: "Celular", placeholder: "(11) 90000-0000", mode: "tel" },
  { value: "aleatoria", label: "Chave aleatória", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", mode: "text" },
] as const;

export default function PixForm({ disabled, demo = false }: { disabled: boolean; demo?: boolean }) {
  const [state, action, pending] = useActionState<PixFormState, FormData>(sendPix, undefined);
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>(TYPES.find((t) => t.value === state?.fields?.keyType)?.value ?? "cpf");
  const [keyValue, setKeyValue] = useState(state?.fields?.key ?? "");
  const [amount, setAmount] = useState(state?.fields?.amount ?? "");
  const [description, setDescription] = useState(state?.fields?.description ?? "");
  const receiptId = state?.receipt?.id;
  useEffect(() => {
    if (receiptId) {
      setKeyValue("");
      setAmount("");
      setDescription("");
    }
  }, [receiptId]);
  const current = TYPES.find((t) => t.value === type)!;

  return (
    <form action={action} className="card stack" onReset={(event) => event.preventDefault()}>
      {state?.error && (
        <div className="alert alert-err" role="alert">
          {state.error}
        </div>
      )}
      {state?.receipt && (
        <section className="receipt stack" aria-label="Comprovante de PIX" role="status">
          <div>
            <span className="badge b-em_analise">{state.receipt.demo ? "SIMULAÇÃO · SEM VALOR FINANCEIRO" : "PIX enviado"}</span>
            <h2>{state.receipt.demo ? "Comprovante demonstrativo" : "Comprovante de PIX"}</h2>
          </div>
          {state.receipt.demo && <p>Nenhum dinheiro foi enviado. Este documento não comprova um pagamento.</p>}
          <dl className="rows">
            <div><dt>Valor{state.receipt.demo ? " fictício" : ""}</dt><dd>{brl(state.receipt.amount)}</dd></div>
            <div><dt>Data e hora</dt><dd>{new Date(state.receipt.date).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</dd></div>
            <div><dt>Chave mascarada</dt><dd>{state.receipt.destination}</dd></div>
            {state.receipt.description && <div><dt>Mensagem</dt><dd>{state.receipt.description}</dd></div>}
            <div><dt>Identificador{state.receipt.demo ? " de teste" : ""}</dt><dd>{state.receipt.id}</dd></div>
          </dl>
        </section>
      )}
      <div className="field">
        <label htmlFor="keyType">Tipo de chave</label>
        <select id="keyType" name="keyType" value={type} onChange={(e) => { setType(e.target.value as typeof type); setKeyValue(""); }}>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="key">Chave PIX</label>
        <input id="key" name="key" required value={keyValue} onChange={(e) => setKeyValue(e.target.value)} maxLength={77} placeholder={demo && type === "email" ? "teste@example.com" : current.placeholder} inputMode={current.mode} autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="amount">Valor (R$)</label>
        <input id="amount" name="amount" required maxLength={30} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" />
      </div>
      <div className="field">
        <label htmlFor="description">Mensagem (opcional)</label>
        <textarea id="description" name="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={140} />
      </div>
      <p className="fine">
        {demo ? "Use uma chave de teste, como teste@example.com. Somente o saldo fictício deste navegador será alterado." : "Confira os dados do recebedor na instituição parceira antes de enviar."}
      </p>
      <button className="btn btn-primary btn-block" disabled={pending || disabled}>
        {pending ? (demo ? "Simulando…" : "Enviando…") : (demo ? "Simular PIX" : "Enviar PIX")}
      </button>
    </form>
  );
}
