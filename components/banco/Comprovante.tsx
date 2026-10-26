"use client";

import { brl } from "@/lib/format";
import type { Comprovante as Dados } from "@/app/actions/banco";

const TITULO: Record<Dados["tipo"], string> = {
  pix: "Comprovante de PIX",
  transferencia: "Comprovante de transferência",
  boleto: "Comprovante de pagamento",
};

export default function Comprovante({ dados }: { dados: Dados }) {
  return (
    <section className="receipt stack" role="status" aria-label={TITULO[dados.tipo]}>
      <div>
        <span className="badge b-aprovado">Concluído</span>
        <h2>{TITULO[dados.tipo]}</h2>
      </div>
      <dl className="rows">
        <div>
          <dt>Valor</dt>
          <dd>{brl(dados.valor)}</dd>
        </div>
        <div>
          <dt>Data e hora</dt>
          <dd>{new Date(dados.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</dd>
        </div>
        <div>
          <dt>{dados.tipo === "boleto" ? "Beneficiário" : "Destino"}</dt>
          <dd>{dados.destino}</dd>
        </div>
        {dados.descricao && (
          <div>
            <dt>Mensagem</dt>
            <dd>{dados.descricao}</dd>
          </div>
        )}
        <div>
          <dt>Identificador</dt>
          <dd style={{ wordBreak: "break-all" }}>{dados.id}</dd>
        </div>
      </dl>
    </section>
  );
}
