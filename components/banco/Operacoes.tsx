"use client";

import { useState } from "react";
import FormPix from "./FormPix";
import FormTransferencia from "./FormTransferencia";
import FormBoleto from "./FormBoleto";

type Aba = "pix" | "transferencia" | "boleto";

const ABAS: { key: Aba; label: string }[] = [
  { key: "pix", label: "PIX" },
  { key: "transferencia", label: "Transferir" },
  { key: "boleto", label: "Pagar boleto" },
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
      {aba === "transferencia" && <FormTransferencia disponivel={disponivel} />}
      {aba === "boleto" && <FormBoleto disponivel={disponivel} />}
    </section>
  );
}
