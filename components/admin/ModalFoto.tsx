"use client";

import { useCallback, useEffect, useState } from "react";
import { modalAberto, passo, type FotoGaleria } from "@/lib/kyc/galeria";

export type { FotoGaleria };

type Props = {
  /** Todas as fotos disponÃ­veis, na ordem em que devem ser navegadas. */
  fotos: FotoGaleria[];
  /** Ãndice aberto, ou null para fechado. */
  indice: number | null;
  onFechar: () => void;
  onIr: (indice: number) => void;
};

/**
 * Visualizador de foto em modal.
 *
 * Antes, cada foto era um <a target="_blank">: abria outra aba, perdia o
 * contexto da anÃ¡lise e a URL assinada do Supabase expirava enquanto o admin
 * conferia os outros documentos. Aqui a foto abre sobre a prÃ³pria tela, com
 * navegaÃ§Ã£o entre as etapas do KYC (documento, comprovante, selfie, rostos)
 * sem sair da ficha.
 *
 * Fecha com clique no fundo, botÃ£o, Esc. Navega com as setas do teclado.
 * O zoom Ã© feito por CSS (classe), nÃ£o por biblioteca.
 */
export default function ModalFoto({ fotos, indice, onFechar, onIr }: Props) {
  const [zoom, setZoom] = useState(false);

  const total = fotos.length;
  const aberto = modalAberto(total, indice);

  const anterior = useCallback(() => {
    const p = passo(total, indice, -1);
    if (p === null) return;
    setZoom(false);
    onIr(p);
  }, [indice, total, onIr]);

  const proxima = useCallback(() => {
    const p = passo(total, indice, 1);
    if (p === null) return;
    setZoom(false);
    onIr(p);
  }, [indice, total, onIr]);

  // Teclado: Esc fecha, setas navegam. Registrado sÃ³ enquanto o modal existe.
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
      else if (e.key === "ArrowLeft") anterior();
      else if (e.key === "ArrowRight") proxima();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto, onFechar, anterior, proxima]);

  // Trava o scroll do fundo enquanto o modal estÃ¡ aberto.
  useEffect(() => {
    if (!aberto) return;
    const anteriorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anteriorOverflow;
    };
  }, [aberto]);

  // O zoom Ã© por foto: ao trocar de imagem, volta ao tamanho normal.
  useEffect(() => {
    setZoom(false);
  }, [indice]);

  // `aberto` jÃ¡ garantiu o intervalo, mas o TS nÃ£o estreita atravÃ©s da funÃ§Ã£o:
  // o Ã­ndice real fica guardado aqui para uso no JSX.
  if (!aberto || indice === null) return null;

  const atual = indice;
  const foto = fotos[atual];

  return (
    <div
      className="modal-foto-fundo"
      role="dialog"
      aria-modal="true"
      aria-label={foto.legenda}
      onClick={onFechar}
    >
      <div className="modal-foto" onClick={(e) => e.stopPropagation()}>
        <header className="modal-foto-topo">
          <div>
            <strong>{foto.legenda}</strong>
            <span className="fine">
              {atual + 1} de {total}
            </span>
          </div>
          <div className="modal-foto-acoes">
            <button
              type="button"
              className="bank-acao"
              onClick={() => setZoom((z) => !z)}
              aria-label={zoom ? "Reduzir" : "Ampliar"}
            >
              {zoom ? "Reduzir" : "Ampliar"}
            </button>
            <button
              type="button"
              className="bank-acao"
              onClick={() => window.open(foto.url, "_blank", "noopener")}
            >
              Abrir original
            </button>
            <button type="button" className="bank-acao" onClick={onFechar} aria-label="Fechar">
              Fechar
            </button>
          </div>
        </header>

        <div className={`modal-foto-palco${zoom ? " ampliado" : ""}`}>
          {total > 1 && (
            <button
              type="button"
              className="modal-foto-seta esq"
              onClick={anterior}
              aria-label="Foto anterior"
            >
              â€¹
            </button>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={foto.url}
            alt={foto.legenda}
            className={zoom ? "ampliada" : ""}
            onClick={() => setZoom((z) => !z)}
          />

          {total > 1 && (
            <button
              type="button"
              className="modal-foto-seta dir"
              onClick={proxima}
              aria-label="PrÃ³xima foto"
            >
              â€º
            </button>
          )}
        </div>

        {total > 1 && (
          <div className="modal-foto-miniaturas">
            {fotos.map((f, i) => (
              <button
                type="button"
                key={f.chave}
                className={`modal-foto-mini${i === atual ? " ativa" : ""}`}
                onClick={() => onIr(i)}
                title={f.legenda}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.legenda} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
