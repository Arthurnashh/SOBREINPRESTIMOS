import Link from "next/link";
import { brl, date } from "@/lib/format";
import { KIND_LABEL, type Account, type Summary, type Transaction } from "@/lib/banking";
import type { KycStatus } from "@/lib/kyc";
import { IconeEscudo } from "../Icones";

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[partes.length - 1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Painel "Início": resumo do mês, últimas movimentações e atalhos. */
export default function PainelInicio({
  resumo,
  extrato,
  nome,
  mes,
  kycStatus,
}: {
  resumo: Summary;
  extrato: Transaction[];
  nome: string;
  mes: string;
  kycStatus?: KycStatus;
}) {
  const bloqueado = kycStatus !== undefined && kycStatus !== "aprovado";

  return (
    <div className="stack" style={{ ["--gap" as string]: "16px" }}>
      {bloqueado && (
        <div className="kyc-bloqueio">
          <IconeEscudo size={20} />
          <span>
            <strong>Sua conta ainda não pode movimentar.</strong> Você já pode receber depósitos e
            PIX, mas para enviar, pagar boleto, sacar ou pedir empréstimo é preciso concluir a
            verificação de identidade.{" "}
            <Link href="/conta/verificacao">
              {kycStatus === "nao_iniciado"
                ? "Começar verificação"
                : kycStatus === "recusado"
                  ? "Corrigir e reenviar"
                  : kycStatus === "pendente"
                    ? "Ver o que ajustar"
                    : "Acompanhar a análise"}
            </Link>
          </span>
        </div>
      )}

      <section className="bank-secao">
        <header>
          <h2>Movimentação em {mes}</h2>
        </header>
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          <div>
            <div className="fine">Entradas</div>
            <div className="valor entra" style={{ fontSize: 22, fontWeight: 700 }}>
              + {brl(resumo.inflow)}
            </div>
          </div>
          <div>
            <div className="fine">Saídas</div>
            <div className="valor sai" style={{ fontSize: 22, fontWeight: 700 }}>
              − {brl(resumo.outflow)}
            </div>
          </div>
          <div>
            <div className="fine">Movimentações</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{resumo.transactions}</div>
          </div>
        </div>
      </section>

      <section className="bank-secao">
        <header>
          <h2>Últimas movimentações</h2>
        </header>
        {!extrato.length ? (
          <p className="fine">
            Nada por aqui ainda, {nome.split(" ")[0]}. Suas entradas e saídas aparecem nesta lista.
          </p>
        ) : (
          <div>
            {extrato.map((t) => (
              <div className="bank-linha" key={t.id}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                  <span className="bank-avatar-linha" aria-hidden>
                    {iniciais(t.description.replace(/^(PIX|Transferência|Depósito|Saque|Recarga|Pagamento|Crédito|Estorno|Agendamento)[^A-Za-z]*/i, "") || t.description)}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="quem">{t.description}</div>
                    <div className="quando">
                      {KIND_LABEL[t.kind]} · {date(t.createdAt)}
                    </div>
                  </div>
                </div>
                <span className={`valor ${t.amount >= 0 ? "entra" : "sai"}`}>
                  {t.amount >= 0 ? "+ " : "− "}
                  {brl(Math.abs(t.amount))}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bank-secao">
        <header>
          <h2>Precisa de crédito?</h2>
        </header>
        <p className="fine">
          Você tem até {brl(20000)} disponíveis para simular. Sujeito a análise: na liberação, a
          conta fica bloqueada até o pagamento da taxa de confiança por PIX, que depois é abatida
          na primeira parcela.
        </p>
        <Link href="/conta/emprestimo" className="btn btn-primary" style={{ justifySelf: "start" }}>
          Simular empréstimo
        </Link>
      </section>
    </div>
  );
}
