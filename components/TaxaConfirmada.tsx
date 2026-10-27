"use client";

import { useRouter } from "next/navigation";
import { brl } from "@/lib/format";

/**
 * Confirmação de que a taxa de confiança foi paga e a conta liberada.
 *
 * Dois caminhos chegam aqui:
 *  - quem estava com o QR aberto e viu o polling confirmar;
 *  - quem pagou no app do banco e fechou a página — nesse caso o webhook
 *    liberou o saldo e este bloco reaparece na próxima visita, por até 24 h
 *    (`getTaxaConfirmada`), para o cliente não ficar sem explicação.
 */
export default function TaxaConfirmada({
  taxa,
  parcela,
}: {
  taxa: number;
  parcela: number;
}) {
  const router = useRouter();

  return (
    <section className="bank-secao taxa-bloco taxa-pago" aria-live="polite">
      <p className="eyebrow">Pagamento confirmado</p>
      <h2 style={{ marginTop: 8 }}>Conta liberada</h2>
      <p className="muted" style={{ marginTop: 10 }}>
        Recebemos o pagamento da taxa de confiança de {brl(taxa)}. O valor do empréstimo já está
        disponível na sua conta e a taxa foi abatida na primeira parcela
        {parcela > 0 ? (
          <>
            , que passou a ser de <strong>{brl(Math.max(parcela - taxa, 0))}</strong>
          </>
        ) : null}
        .
      </p>
      <div className="modal-acoes" style={{ marginTop: 14 }}>
        <button type="button" className="btn btn-primary" onClick={() => router.refresh()}>
          Continuar
        </button>
      </div>
    </section>
  );
}
