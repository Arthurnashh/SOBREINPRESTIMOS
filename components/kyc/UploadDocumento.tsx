"use client";

import { useRef, useState } from "react";
import { DOC_LABEL, PROOF_LABEL, type KycDocType, type KycProofType } from "@/lib/kyc";
import { IconeCartao, IconeCopiar, IconeEscudo } from "../Icones";

export type SlotUpload = "doc_frente" | "doc_verso" | "comprovante" | "selfie_doc";

type Props = {
  slot: SlotUpload;
  titulo: string;
  explicacao: string;
  jaEnviado?: boolean;
  pathAtual?: string | null;
  onUrl?: (path: string) => Promise<string | null>;
  onEnviar: (
    slot: SlotUpload,
    arquivo: File
  ) => Promise<{ ok: boolean; error?: string; detalhe?: string }>;
  /** escolha do tipo de comprovante */
  provaTipo?: KycProofType;
  onProvaTipo?: (t: KycProofType) => void;
  /** escolha do documento, só no primeiro slot */
  docTipo?: KycDocType;
  onDocTipo?: (t: KycDocType) => void;
};

export default function UploadDocumento({
  slot,
  titulo,
  explicacao,
  jaEnviado,
  pathAtual,
  onUrl,
  onEnviar,
  provaTipo,
  onProvaTipo,
  docTipo,
  onDocTipo,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState(Boolean(jaEnviado));
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState<string | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const escolher = () => inputRef.current?.click();

  const verArquivo = async () => {
    if (!pathAtual || !onUrl) return;
    setAbrindo(true);
    const url = await onUrl(pathAtual);
    setAbrindo(false);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else setErro("Não consegui abrir o arquivo agora.");
  };

  const receber = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setErro(null);
    setEnviando(true);
    setAviso(null);

    /*
     * Rede de segurança: se o envio travar (rede caindo, servidor sem
     * responder), o botão não pode ficar em "Enviando…" para sempre. Antes
     * disso acontecer, o arquivo atravessava a Server Action e estourava o
     * limite de 1 MB do Next — a barra girava indefinidamente.
     */
    let expirou = false;
    const alarme = setTimeout(() => {
      expirou = true;
      setEnviando(false);
      setErro(
        "O envio está demorando demais. Verifique sua conexão e tente novamente."
      );
    }, 45000);

    let r: { ok: boolean; error?: string; detalhe?: string };
    try {
      r = await onEnviar(slot, arquivo);
    } catch {
      r = { ok: false, error: "Falha inesperada no envio. Tente novamente." };
    } finally {
      clearTimeout(alarme);
    }

    if (expirou) return;
    setEnviando(false);

    if (!r.ok) {
      setErro(r.error ?? "Falha ao enviar.");
      return;
    }

    setFeito(true);
    setNome(arquivo.name);
    if (r.detalhe) setAviso(r.detalhe);
    // prévia só para imagem
    if (arquivo.type.startsWith("image/")) {
      const url = URL.createObjectURL(arquivo);
      setPrevia((antiga) => {
        if (antiga) URL.revokeObjectURL(antiga);
        return url;
      });
    }
  };

  return (
    <div className={`kyc-upload${feito ? " feito" : ""}`}>
      {docTipo !== undefined && onDocTipo && slot === "doc_frente" && (
        <div className="kyc-escolha">
          <span className="rot">Qual documento você vai enviar?</span>
          <div className="kyc-opcoes">
            {(["cnh", "rg"] as KycDocType[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`bank-acao${docTipo === t ? " principal" : ""}`}
                onClick={() => onDocTipo(t)}
              >
                <IconeCartao size={16} />
                {t.toUpperCase()}
              </button>
            ))}
          </div>
          <p className="fine">{docTipo ? DOC_LABEL[docTipo] : "Escolha CNH ou RG."}</p>
        </div>
      )}

      {provaTipo !== undefined && onProvaTipo && slot === "comprovante" && (
        <div className="kyc-escolha">
          <span className="rot">Que comprovante é esse?</span>
          <div className="kyc-opcoes">
            {(Object.keys(PROOF_LABEL) as KycProofType[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`bank-acao${provaTipo === t ? " principal" : ""}`}
                onClick={() => onProvaTipo(t)}
              >
                {PROOF_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="kyc-upload-topo">
        <div>
          <strong>{titulo}</strong>
          <p className="fine">{explicacao}</p>
        </div>
        {feito && <span className="bank-chip ok">Enviado</span>}
      </div>

      <div className="kyc-upload-area">
        {previa ? (
          <img src={previa} alt={titulo} className="kyc-previa" />
        ) : (
          <span className="kyc-upload-icone">
            <IconeCopiar size={26} />
          </span>
        )}

        <div className="kyc-upload-acoes">
          <button
            type="button"
            className="bank-acao principal"
            onClick={escolher}
            disabled={enviando}
          >
            {enviando ? "Enviando…" : feito ? "Trocar arquivo" : "Escolher arquivo"}
          </button>
          {feito && pathAtual && onUrl && (
            <button type="button" className="bank-acao" onClick={verArquivo} disabled={abrindo}>
              {abrindo ? "Abrindo…" : "Ver enviado"}
            </button>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          capture={slot === "selfie_doc" ? "user" : undefined}
          style={{ display: "none" }}
          onChange={(e) => {
            void receber(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {nome && <p className="fine">Arquivo: {nome}</p>}
      {aviso && <p className="fine">{aviso}</p>}
      {erro && (
        <div className="alert alert-err" role="alert">
          {erro}
        </div>
      )}

      {slot === "selfie_doc" && (
        <p className="fine kyc-privacidade">
          <IconeEscudo size={14} /> Segure o documento ao lado do rosto, com os dois bem visíveis e
          sem reflexo.
        </p>
      )}
    </div>
  );
}
