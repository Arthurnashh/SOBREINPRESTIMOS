"use client";

import { useState } from "react";
import FormPix from "./FormPix";
import FormTransferencia from "./FormTransferencia";
import FormBoleto from "./FormBoleto";
import FormDeposito from "./FormDeposito";
import FormSaque from "./FormSaque";
import FormRecarga from "./FormRecarga";
import FormCobranca from "./FormCobranca";
import FormAgendamento from "./FormAgendamento";

type Aba = "pix" | "cobranca" | "transferencia" | "deposito" | "saque" | "boleto" | "recarga" | "agendamento";

const ABAS: { key: Aba; label: string }[] = [
  { key: "pix", label: "Enviar PIX" },
  { key: "cobranca", label: "Receber PIX" },
  { key: "transferencia", label: "Transferir" },
  { key: "deposito", label: "Depositar" },
  { key: "saque", label: "Sacar" },
  { key: "boleto", label: "Pagar boleto" },
  { key: "recarga", label: "Recarga" },
  { key: "agendamento", label: "Agendar" },
];

export default function Operacoes({ disponivel }: { disponivel: number }) {
  const [aba, setAba] = useState<Aba>("pix");

  return (
    <section className="card stack" style={{ ["--gap" as string]: "18px" }}>
      <div className="nav" style={{ flexWrap: "wrap" }} role="tablist" aria-label="Operações">
        {ABAS.map((a) => (
          <button
            key={a.key}
            role="tab"
            aria-selected={aba === a.key}
            className={`btn ${aba === a.key ? "btn-primary" : "btn-ghost"}`}
            style={{ height: 38, fontSize: 14 }}
            onClick={() => setAba(a.key)}
          >
            {a.label}
          </button>
        ))}
      </div>

      {aba === "pix" && <FormPix disponivel={disponivel} />}
      {aba === "cobranca" && <FormCobranca />}
      {aba === "transferencia" && <FormTransferencia disponivel={disponivel} />}
      {aba === "deposito" && <FormDeposito />}
      {aba === "saque" && <FormSaque disponivel={disponivel} />}
      {aba === "boleto" && <FormBoleto disponivel={disponivel} />}
      {aba === "recarga" && <FormRecarga disponivel={disponivel} />}
      {aba === "agendamento" && <FormAgendamento disponivel={disponivel} />}
    </section>
  );
}
