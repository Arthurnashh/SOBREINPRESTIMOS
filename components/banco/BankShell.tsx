"use client";

import { useState, type ReactNode } from "react";
import { brl } from "@/lib/format";

type Aba = "inicio" | "pix" | "cartoes" | "extrato" | "perfil" | "config";

const ABAS: { key: Aba; label: string; icone: string }[] = [
  { key: "inicio", label: "Início", icone: "🏠" },
  { key: "pix", label: "Área PIX", icone: "⚡" },
  { key: "cartoes", label: "Cartões", icone: "💳" },
  { key: "extrato", label: "Extrato", icone: "📄" },
  { key: "perfil", label: "Perfil", icone: "👤" },
  { key: "config", label: "Config", icone: "⚙️" },
];

export type AbaBanco = Aba;

export default function BankShell({
  nome,
  inicial,
  agencia,
  conta,
  status,
  saldo,
  painel,
}: {
  nome: string;
  inicial: string;
  agencia: string;
  conta: string;
  status: string;
  saldo: number;
  painel: Record<Aba, ReactNode>;
}) {
  const [aba, setAba] = useState<Aba>("inicio");
  const [visivel, setVisivel] = useState(true);

  const irPara = (destino: Aba) => {
    setAba(destino);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="bank-shell">
      <div className="bank-top">
        <div className="bank-user">
          <div className="bank-avatar" aria-hidden>
            {inicial}
          </div>
          <div>
            <strong>{nome}</strong>
            <span>
              Ag. {agencia} · Conta {conta} · {status}
            </span>
          </div>
        </div>
        <div className="bank-actions">
          <button
            className="bank-icon-btn"
            onClick={() => irPara("config")}
            aria-label="Configurações da conta"
            title="Configurações"
          >
            ⚙️
          </button>
          <button
            className="bank-icon-btn"
            onClick={() => irPara("perfil")}
            aria-label="Meu perfil"
            title="Meu perfil"
          >
            👤
          </button>
        </div>
      </div>

      {aba === "inicio" && (
        <div className="bank-balance">
          <div className="rotulo">
            Saldo disponível
            <button
              className="olho"
              onClick={() => setVisivel((v) => !v)}
              aria-label={visivel ? "Ocultar saldo" : "Mostrar saldo"}
              title={visivel ? "Ocultar saldo" : "Mostrar saldo"}
            >
              {visivel ? "🙈" : "👁️"}
            </button>
          </div>
          <div className={`valor${visivel ? "" : " oculto"}`}>
            {visivel ? brl(saldo) : "R$ ••••"}
          </div>
        </div>
      )}

      <nav className="bank-grid" aria-label="Navegação da conta">
        {ABAS.map((a) => (
          <button
            key={a.key}
            className={`bank-tile${aba === a.key ? " destaque" : ""}`}
            onClick={() => irPara(a.key)}
            aria-current={aba === a.key ? "page" : undefined}
          >
            <span className="icone" aria-hidden>
              {a.icone}
            </span>
            {a.label}
          </button>
        ))}
      </nav>

      <div className="bank-conteudo">{painel[aba]}</div>
    </div>
  );
}
