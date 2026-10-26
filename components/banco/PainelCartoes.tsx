"use client";

import { useState, useTransition } from "react";
import { alterarStatusCartao, dadosCompletosCartao } from "@/app/actions/banco";
import { brl } from "@/lib/format";
import type { Account, Card, CardFull } from "@/lib/banking";
import {
  IconeAproximacao,
  IconeCadeado,
  IconeCadeadoAberto,
  IconeChip,
  IconeCopiar,
  IconeOlho,
  IconeOlhoFechado,
} from "../Icones";

/** Painel "Meus cartões": ver dados, copiar, bloquear. */
export default function PainelCartoes({
  card,
  conta,
  nome,
  limite,
}: {
  card: Card | null;
  conta: Account;
  nome: string;
  limite: number;
}) {
  const [dados, setDados] = useState<CardFull | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [mostrando, setMostrando] = useState(false);
  const [pendente, iniciar] = useTransition();

  const ativo = card?.status === "ativo";

  const buscar = () => {
    setErro(null);
    iniciar(async () => {
      const r = await dadosCompletosCartao();
      if (r.ok) {
        setDados(r.dados);
        setMostrando(true);
      } else {
        setErro(r.error);
      }
    });
  };

  const esconder = () => {
    setMostrando(false);
    setDados(null);
    setCopiado(null);
  };

  const copiar = async (rotulo: string, valor: string) => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(rotulo);
      window.setTimeout(() => setCopiado(null), 1800);
    } catch {
      setErro("Não foi possível copiar. Selecione o texto manualmente.");
    }
  };

  const copiarTudo = async () => {
    if (!dados) return;
    const texto = [
      `Número: ${dados.number}`,
      `Titular: ${dados.holder}`,
      `Validade: ${dados.expiry}`,
      `CVV: ${dados.cvv}`,
    ].join("\n");
    await copiar("tudo", texto);
  };

  if (!card) {
    return (
      <section className="bank-secao">
        <header>
          <h2 className="titulo-com-icone">
            <span className="glifo">
              <IconeChip size={19} />
            </span>
            Meus cartões
          </h2>
        </header>
        <p className="fine">Seu cartão está sendo emitido. Ele aparece aqui em instantes.</p>
      </section>
    );
  }

  return (
    <div className="stack" style={{ ["--gap" as string]: "16px" }}>
      <section className="bank-secao">
        <header>
          <h2 className="titulo-com-icone">
            <span className="glifo">
              <IconeChip size={19} />
            </span>
            Meus cartões
          </h2>
          <form action={alterarStatusCartao}>
            <input type="hidden" name="status" value={ativo ? "bloqueado" : "ativo"} />
            <button className={`bank-acao ${ativo ? "perigo" : ""}`}>
              {ativo ? <IconeCadeado size={17} /> : <IconeCadeadoAberto size={17} />}
              {ativo ? "Bloquear cartão" : "Desbloquear cartão"}
            </button>
          </form>
        </header>

        {erro && (
          <div className="alert alert-err" role="alert">
            {erro}
          </div>
        )}

        <div className="bank-cards">
          <div className={`bank-card${ativo ? "" : " bloqueado"}`}>
            <div className="marca">
              <span>{card.brand}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <IconeAproximacao size={16} />
                {ativo ? "Ativo" : "Bloqueado"}
              </span>
            </div>

            {mostrando && dados ? (
              <div className="dados">
                <div className="par">
                  <span className="rot">Número</span>
                  <b>{dados.number}</b>
                </div>
                <div style={{ display: "flex", gap: 26 }}>
                  <div className="par">
                    <span className="rot">Validade</span>
                    <b>{dados.expiry}</b>
                  </div>
                  <div className="par">
                    <span className="rot">CVV</span>
                    <b>{dados.cvv}</b>
                  </div>
                </div>
              </div>
            ) : (
              <div className="numero">•••• •••• •••• {card.last4}</div>
            )}

            <div className="rodape">
              <span className="titular">
                <span className="rot">Titular</span>
                <span>{card.holder || nome}</span>
              </span>
              {!mostrando && (
                <span className="titular" style={{ textAlign: "right" }}>
                  <span className="rot">Validade</span>
                  <span>
                    {String(card.expiryMonth).padStart(2, "0")}/{String(card.expiryYear).slice(-2)}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="bank-acoes-cartao">
          {!mostrando ? (
            <button className="bank-acao principal" onClick={buscar} disabled={pendente}>
              <IconeOlho size={17} />
              {pendente ? "Abrindo…" : "Ver dados do cartão"}
            </button>
          ) : (
            <>
              <button className="bank-acao" onClick={esconder}>
                <IconeOlhoFechado size={17} />
                Esconder dados
              </button>
              <button className="bank-acao" onClick={() => dados && copiar("numero", dados.number)}>
                <IconeCopiar size={17} />
                {copiado === "numero" ? "Número copiado!" : "Copiar número"}
              </button>
              <button className="bank-acao" onClick={() => dados && copiar("cvv", dados.cvv)}>
                <IconeCopiar size={17} />
                {copiado === "cvv" ? "CVV copiado!" : "Copiar CVV"}
              </button>
              <button className="bank-acao" onClick={copiarTudo}>
                <IconeCopiar size={17} />
                {copiado === "tudo" ? "Dados copiados!" : "Copiar todos os dados"}
              </button>
            </>
          )}
        </div>

        <p className="fine">
          {mostrando
            ? "Não compartilhe estes dados. Ninguém legítimo pede o número e o CVV do seu cartão por telefone, SMS ou WhatsApp."
            : "O número completo e o CVV ficam escondidos até você pedir para ver."}
        </p>
      </section>

      <section className="bank-secao">
        <header>
          <h2>Informações do cartão</h2>
        </header>

        <div className="bank-linha">
          <div>
            <div className="quem">Status</div>
            <div className="quando">Compras {ativo ? "liberadas" : "recusadas"}</div>
          </div>
          <span className={`bank-chip ${ativo ? "ok" : "erro"}`}>{ativo ? "Ativo" : "Bloqueado"}</span>
        </div>

        <div className="bank-linha">
          <div>
            <div className="quem">Limite disponível para compras</div>
            <div className="quando">Saldo da conta {brl(conta.balance)}</div>
          </div>
          <span className="valor">{brl(limite)}</span>
        </div>

        <div className="bank-linha">
          <div>
            <div className="quem">Validade</div>
            <div className="quando">Vencimento do cartão</div>
          </div>
          <span className="valor">
            {String(card.expiryMonth).padStart(2, "0")}/{card.expiryYear}
          </span>
        </div>

        <div className="bank-linha">
          <div>
            <div className="quem">Tipo</div>
            <div className="quando">Débito direto na conta</div>
          </div>
          <span className="valor">Virtual</span>
        </div>

        <div className="bank-linha">
          <div>
            <div className="quem">Bandeira</div>
            <div className="quando">Rede de aceitação</div>
          </div>
          <span className="valor">{card.brand}</span>
        </div>
      </section>
    </div>
  );
}
