"use client";

import { useState, type ReactNode } from "react";
import FormPix from "./FormPix";
import FormTransferencia from "./FormTransferencia";
import FormBoleto from "./FormBoleto";
import FormDeposito from "./FormDeposito";
import FormSaque from "./FormSaque";
import FormRecarga from "./FormRecarga";
import FormCobranca from "./FormCobranca";
import FormAgendamento from "./FormAgendamento";
import {
  IconeEnviar,
  IconeReceber,
  IconeTransferir,
  IconeDepositar,
  IconeSacar,
  IconeBoleto,
  IconeRecarga,
  IconeAgendar,
} from "./Icones";

type Aba =
  | "pix"
  | "cobranca"
  | "transferencia"
  | "deposito"
  | "saque"
  | "boleto"
  | "recarga"
  | "agendamento";

const ABAS: { key: Aba; label: string; Icone: (p: { size?: number }) => ReactNode }[] = [
  { key: "pix", label: "Enviar PIX", Icone: IconeEnviar },
  { key: "cobranca", label: "Receber PIX", Icone: IconeReceber },
  { key: "transferencia", label: "Transferir", Icone: IconeTransferir },
  { key: "deposito", label: "Depositar", Icone: IconeDepositar },
  { key: "saque", label: "Sacar", Icone: IconeSacar },
  { key: "boleto", label: "Pagar boleto", Icone: IconeBoleto },
  { key: "recarga", label: "Recarga", Icone: IconeRecarga },
  { key: "agendamento", label: "Agendar", Icone: IconeAgendar },
];

export default function Operacoes({ disponivel }: { disponivel: number }) {
  const [aba, setAba] = useState<Aba>("pix");

  return (
    <div className="stack" style={{ ["--gap" as string]: "18px" }}>
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
        role="tablist"
        aria-label="Operações"
      >
        {ABAS.map((a) => {
          const ativa = aba === a.key;
          return (
            <button
              key={a.key}
              role="tab"
              aria-selected={ativa}
              className={`bank-acao${ativa ? " principal" : ""}`}
              onClick={() => setAba(a.key)}
            >
              <a.Icone size={17} />
              {a.label}
            </button>
          );
        })}
      </div>

      {aba === "pix" && <FormPix disponivel={disponivel} />}
      {aba === "cobranca" && <FormCobranca />}
      {aba === "transferencia" && <FormTransferencia disponivel={disponivel} />}
      {aba === "deposito" && <FormDeposito />}
      {aba === "saque" && <FormSaque disponivel={disponivel} />}
      {aba === "boleto" && <FormBoleto disponivel={disponivel} />}
      {aba === "recarga" && <FormRecarga disponivel={disponivel} />}
      {aba === "agendamento" && <FormAgendamento disponivel={disponivel} />}
    </div>
  );
}
