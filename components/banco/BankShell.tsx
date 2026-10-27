"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { brl } from "@/lib/format";
import {
  IconeConfig,
  IconePerfil,
  IconeInicio,
  IconePix,
  IconeCartao,
  IconeExtrato,
  IconeOlho,
  IconeOlhoFechado,
} from "../Icones";

type Aba = "inicio" | "pix" | "cartoes" | "extrato" | "perfil" | "config";

const ABAS: { key: Aba; label: string; Icone: (p: { size?: number }) => ReactNode }[] = [
  { key: "inicio", label: "Início", Icone: IconeInicio },
  { key: "pix", label: "Área PIX", Icone: IconePix },
  { key: "cartoes", label: "Cartões", Icone: IconeCartao },
  { key: "extrato", label: "Extrato", Icone: IconeExtrato },
  { key: "perfil", label: "Perfil", Icone: IconePerfil },
  { key: "config", label: "Config", Icone: IconeConfig },
];

export type AbaBanco = Aba;

function abaValida(v: string | null): Aba | null {
  if (!v) return null;
  return ABAS.some((a) => a.key === v) ? (v as Aba) : null;
}

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
  // `?aba=pix` deixa o aviso do topo da conta abrir direto na Área PIX.
  const params = useSearchParams();
  const [aba, setAba] = useState<Aba>(() => abaValida(params?.get("aba")) ?? "inicio");
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
            <IconeConfig size={21} />
          </button>
          <button
            className="bank-icon-btn"
            onClick={() => irPara("perfil")}
            aria-label="Meu perfil"
            title="Meu perfil"
          >
            <IconePerfil size={21} />
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
              {visivel ? <IconeOlho size={17} /> : <IconeOlhoFechado size={17} />}
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
            <span className="icone">
              <a.Icone size={22} />
            </span>
            {a.label}
          </button>
        ))}
      </nav>

      <div className="bank-conteudo">{painel[aba]}</div>
    </div>
  );
}
