"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { gerarCobrancaParcela } from "@/app/actions/parcelas";
import { brl, date } from "@/lib/format";

export type Parcela = {
  id: string;
  numero: number;
  vencimento: string;
  valor: number;
  status: string;
  pago_em: string | null;
  pago_valor: number | null;
  charge_id: string | null;
};

const ROTULO_STATUS: Record<string, string> = {
  aberta: "Em aberto",
  paga: "Paga",
  atrasada: "Atrasada",
  cancelada: "Cancelada",
};

type Cobranca = {
  linha_digitavel: string;
  nosso_numero: string;
  valor: number;
  vencimento: string;
  qr_code: string;
};

export default function Parcelas({
  parcelas,
  hoje,
}: {
  parcelas: Parcela[];
  hoje: string;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  const [cobranca, setCobranca] = useState<Record<string, Cobranca>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [copiado, setCopiado] = useState<string | null>(null);

  const gerar = (id: string) => {
    setErro(null);
    iniciar(async () => {
      const r = await gerarCobrancaParcela(id);
      if (r?.error) {
        setErro(r.error);
        return;
      }
      if (r?.cobranca) {
        setCobranca((c) => ({ ...c, [id]: r.cobranca! }));
        setAberta(id);
      }
    });
  };

  const copiar = async (texto: string, chave: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(chave);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setErro("Não consegui copiar. Selecione o código e copie manualmente.");
    }
  };

  // Considera atrasada a parcela aberta cujo vencimento já passou.
  const efetivo = (p: Parcela) =>
    p.status === "aberta" && p.vencimento < hoje ? "atrasada" : p.status;

  return (
    <>
      {erro && (
        <div className="alert alert-err" role="alert" style={{ marginBottom: 12 }}>
          {erro}
        </div>
      )}

      <div className="table-scroll">
        <table className="users-table parcelas-tabela">
          <caption className="sr-only">Parcelas do empréstimo</caption>
          <thead>
            <tr>
              <th scope="col">Parcela</th>
              <th scope="col">Vencimento</th>
              <th scope="col">Valor</th>
              <th scope="col">Situação</th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {parcelas.map((p) => {
              const st = efetivo(p);
              const paga = st === "paga";
              return (
                <tr key={p.id} className={st === "atrasada" ? "linha-atrasada" : undefined}>
                  <th scope="row">
                    {p.numero}/{parcelas.length}
                  </th>
                  <td data-label="Vencimento">
                    {date(p.vencimento)}
                    {paga && p.pago_em && <div className="fine">paga em {date(p.pago_em)}</div>}
                  </td>
                  <td data-label="Valor">{brl(Number(p.valor))}</td>
                  <td data-label="Situação">
                    <span
                      className={
                        paga
                          ? "badge b-aprovado"
                          : st === "atrasada"
                          ? "badge b-recusado"
                          : "badge b-em_analise"
                      }
                    >
                      {ROTULO_STATUS[st] ?? st}
                    </span>
                  </td>
                  <td>
                    {!paga && st !== "cancelada" && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ height: 36 }}
                        disabled={pendente}
                        onClick={() => (cobranca[p.id] ? setAberta(aberta === p.id ? null : p.id) : gerar(p.id))}
                      >
                        {cobranca[p.id] ? (aberta === p.id ? "Ocultar" : "Ver boleto/PIX") : "Gerar boleto/PIX"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {aberta && cobranca[aberta] && (
        <div className="cobranca" style={{ marginTop: 16 }}>
          <div className="aviso-gateway">
            <strong>Cobrança ainda não está ativa.</strong> Este boleto/PIX foi gerado para
            consulta e <strong>não pode ser pago</strong> até a integração com o meio de pagamento
            ser concluída. Não pague nenhum valor fora deste aplicativo.
          </div>

          <div className="field">
            <label>Linha digitável</label>
            <div className="campo-copia">
              <code>{cobranca[aberta].linha_digitavel}</code>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => copiar(cobranca[aberta].linha_digitavel, `l${aberta}`)}
              >
                {copiado === `l${aberta}` ? "Copiado" : "Copiar"}
              </button>
            </div>
          </div>

          <div className="field">
            <label>PIX copia e cola</label>
            <div className="campo-copia">
              <code className="quebra">{cobranca[aberta].qr_code}</code>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => copiar(cobranca[aberta].qr_code, `q${aberta}`)}
              >
                {copiado === `q${aberta}` ? "Copiado" : "Copiar"}
              </button>
            </div>
          </div>

          <p className="fine">
            Nosso número {cobranca[aberta].nosso_numero} · valor{" "}
            {brl(Number(cobranca[aberta].valor))} · vencimento {date(cobranca[aberta].vencimento)}
          </p>
        </div>
      )}

      {!parcelas.length && (
        <p className="muted">
          As parcelas aparecem aqui depois que o empréstimo é liberado.{" "}
          <Link href="/conta">Voltar ao início</Link>
        </p>
      )}
    </>
  );
}
