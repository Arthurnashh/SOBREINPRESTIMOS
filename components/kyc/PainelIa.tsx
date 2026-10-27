"use client";

import { useState, useTransition } from "react";
import { reanalisarKycAdmin, type ResultadoTriagem } from "@/app/actions/kyc-ia";
import { CONFIANCA_MINIMA_APROVAR } from "@/lib/kyc/ia";

type Props = {
  userId: string;
  /** Resumo gravado por `kyc_registrar_triagem`, vindo da ficha. */
  triagem: Record<string, unknown> | null;
  /** O provedor está configurado? */
  disponivel: boolean;
};

/**
 * Painel da triagem automática.
 *
 * Mostra o que a IA concluiu e deixa o admin reanalisar. O ponto principal é a
 * TRANSPARÊNCIA: quando a IA aprova sozinha, o admin precisa ver que foi
 * automático, com qual confiança e quais ressalvas — inclusive as verificações
 * que não puderam ser feitas.
 */
export default function PainelIa({ userId, triagem, disponivel }: Props) {
  const [resultado, setResultado] = useState<ResultadoTriagem | null>(null);
  const [pendente, iniciar] = useTransition();

  // Depois de reanalisar, mostra o novo resultado; antes disso, o gravado.
  const decisao = resultado?.decisao ?? (triagem?.decisao as string | undefined) ?? null;
  const confianca =
    resultado?.confianca ??
    (typeof triagem?.confianca === "number" ? triagem.confianca : null) ??
    (typeof triagem?.confianca === "string" ? Number(triagem.confianca) : null);
  const alertas =
    resultado?.alertas ??
    (Array.isArray(triagem?.alertas) ? (triagem?.alertas as string[]) : []);
  const naoVerificado = Array.isArray(triagem?.nao_verificado)
    ? (triagem?.nao_verificado as string[])
    : [];
  const motivos = resultado?.motivos ?? (Array.isArray(triagem?.motivos) ? (triagem?.motivos as string[]) : []);

  const reanalisar = () => {
    iniciar(async () => {
      const r = await reanalisarKycAdmin(userId);
      setResultado(r);
    });
  };

  if (!disponivel && !decisao) {
    return (
      <div className="kyc-bloco ia-bloco">
        <header>
          <h2>Triagem automática</h2>
        </header>
        <p className="fine">
          A análise automática de documentos não está configurada. Defina{" "}
          <code>IA_API_KEY</code> nas variáveis de ambiente para ativar. Sem ela, toda
          verificação segue para análise manual — nada quebra.
        </p>
      </div>
    );
  }

  const classe =
    decisao === "aprovar" ? "ok" : decisao === "recusar" ? "erro" : decisao ? "alerta" : "";

  const rotulo =
    decisao === "aprovar"
      ? "Aprovado automaticamente"
      : decisao === "recusar"
        ? "Recusado automaticamente"
        : decisao === "revisar"
          ? "Requer conferência humana"
          : "Sem análise registrada";

  const pct = confianca !== null && Number.isFinite(confianca) ? Math.round(confianca * 100) : null;
  const minimaPct = Math.round(CONFIANCA_MINIMA_APROVAR * 100);

  return (
    <div className="kyc-bloco ia-bloco">
      <header>
        <h2>Triagem automática</h2>
        <p>Análise dos documentos por IA. Registrada na auditoria.</p>
      </header>

      <div className={`ia-estado ${classe}`}>
        <div>
          <strong>{rotulo}</strong>
          {pct !== null && (
            <span className="fine">
              Confiança {pct}% · mínimo para aprovar sozinho: {minimaPct}%
            </span>
          )}
        </div>
        {disponivel && (
          <button type="button" className="bank-acao" onClick={reanalisar} disabled={pendente}>
            {pendente ? "Analisando…" : "Reanalisar"}
          </button>
        )}
      </div>

      {resultado && !resultado.ok && (
        <div className="alert alert-err" role="alert">
          {resultado.error ?? "Não foi possível reanalisar."}
        </div>
      )}

      {motivos.length > 0 && (
        <ul className="ia-lista">
          {motivos.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}

      {alertas.length > 0 && (
        <>
          <h3 className="ia-sub">Pontos de atenção</h3>
          <ul className="ia-lista alerta">
            {alertas.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </>
      )}

      {naoVerificado.length > 0 && (
        <>
          <h3 className="ia-sub">Não foi possível verificar</h3>
          <ul className="ia-lista">
            {naoVerificado.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </>
      )}

      <p className="fine ia-aviso">
        A análise automática confere legibilidade, tipo de documento e se os dados batem com o
        cadastro. <strong>Ela não detecta documento falsificado</strong> — uma falsificação bem
        feita passa. Use como triagem, não como prova.
      </p>
    </div>
  );
}
