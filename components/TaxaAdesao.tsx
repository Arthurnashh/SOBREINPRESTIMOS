"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { aplicarTaxaAdesao, dispensarTaxaAdesao } from "@/app/actions/loans";
import { brl, pct } from "@/lib/format";

type Props = {
  loanId: string;
  /** Valor da parcela contratada. */
  parcela: number;
  /** Taxa de confiança calculada sobre a parcela. */
  taxa: number;
  /** Fração usada no cálculo (0,5 = 50%). */
  percentual: number;
  /** Cliente já fechou o aviso uma vez. */
  ciente: boolean;
};

/**
 * Aviso da taxa de confiança.
 *
 * Abre como modal na primeira vez que o cliente vê o empréstimo liberado.
 * Se ele fecha sem confirmar, vira uma faixa fixa — o saldo continua
 * bloqueado e a ação fica sempre à mão. Só sai da tela quando a taxa é
 * aplicada (aí o saldo libera e a 1ª parcela é abatida).
 */
export default function TaxaAdesao({ loanId, parcela, taxa, percentual, ciente }: Props) {
  const router = useRouter();
  const [aberto, setAberto] = useState(!ciente);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const aplicar = () =>
    iniciar(async () => {
      setErro(null);
      const r = await aplicarTaxaAdesao(loanId);
      if (r?.error) {
        setErro(r.error);
        return;
      }
      setAberto(false);
      router.refresh();
    });

  const depois = () =>
    iniciar(async () => {
      setErro(null);
      const r = await dispensarTaxaAdesao(loanId);
      if (r?.error) {
        setErro(r.error);
        return;
      }
      setAberto(false);
      router.refresh();
    });

  if (!aberto) {
    return (
      <div className="alert alert-warn" role="status">
        <div>
          <strong>Taxa de confiança pendente: {brl(taxa)}.</strong> Esse valor está bloqueado no
          seu saldo. Ele não é cobrança extra: é abatido na sua primeira parcela de{" "}
          {brl(parcela)}.
          {erro && (
            <div className="alert alert-err" role="alert" style={{ marginTop: 10 }}>
              {erro}
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-primary" onClick={aplicar} disabled={pendente}>
              {pendente ? "Liberando…" : `Confirmar ${brl(taxa)} e liberar o saldo`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="taxa-titulo">
      <div className="modal-caixa">
        <p className="eyebrow">Empréstimo liberado</p>
        <h2 id="taxa-titulo" style={{ marginTop: 10 }}>
          Taxa de confiança
        </h2>

        <div className="modal-valor">{brl(taxa)}</div>
        <p className="fine">
          {pct(percentual, 0)} da sua parcela de {brl(parcela)}.
        </p>

        <p className="muted" style={{ marginTop: 14 }}>
          O valor do empréstimo já está na sua conta, mas fica bloqueado até esta confirmação.
          Ao confirmar, a taxa é descontada e o restante é liberado na hora. O valor da taxa é
          abatido na <strong>primeira parcela</strong> — você não paga nada a mais por isso.
        </p>

        {erro && (
          <div className="alert alert-err" role="alert" style={{ marginTop: 14 }}>
            {erro}
          </div>
        )}

        <div className="modal-acoes">
          <button type="button" className="btn btn-primary" onClick={aplicar} disabled={pendente}>
            {pendente ? "Liberando…" : `Confirmar ${brl(taxa)} e liberar`}
          </button>
          <button type="button" className="btn btn-ghost" onClick={depois} disabled={pendente}>
            Agora não
          </button>
        </div>

        <p className="fine" style={{ marginTop: 12 }}>
          Enquanto a taxa não for confirmada, o saldo liberado não pode ser movimentado.
        </p>
      </div>
    </div>
  );
}
