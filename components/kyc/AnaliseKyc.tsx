"use client";

import { useState, useTransition } from "react";
import { decidirKyc, urlArquivoKycAdmin } from "@/app/actions/kyc";
import { indiceValido, montarGaleria } from "@/lib/kyc/galeria";
import { PROOF_LABEL, KYC_STATUS_LABEL, type KycFilaItem } from "@/lib/kyc";
import { IconeEscudo, IconeCadeado, IconeCadeadoAberto } from "../Icones";
import ModalFoto from "../admin/ModalFoto";
import PainelIa from "./PainelIa";

const ROTULO_FOTO: Record<string, string> = {
  doc_frente: "Documento — frente",
  doc_verso: "Documento — verso",
  comprovante: "Comprovante",
  selfie_doc: "Selfie com documento",
  face_frontal: "Rosto — frontal",
  face_direita: "Rosto — direita",
  face_esquerda: "Rosto — esquerda",
  face_sorriso: "Rosto — sorrindo",
  face_perto: "Rosto — aproximado",
};

export default function AnaliseKyc({ itens }: { itens: KycFilaItem[] }) {
  const [aberto, setAberto] = useState<string | null>(null);

  return (
    <div className="kyc-fila">
      {itens.map((k) => (
        <ItemAnalise
          key={k.userId}
          item={k}
          aberto={aberto === k.userId}
          onAlternar={() => setAberto((a) => (a === k.userId ? null : k.userId))}
        />
      ))}
    </div>
  );
}

function ItemAnalise({
  item,
  aberto,
  onAlternar,
}: {
  item: KycFilaItem;
  aberto: boolean;
  onAlternar: () => void;
}) {
  const [fotos, setFotos] = useState<Record<string, string | null> | null>(null);
  const [detalhe, setDetalhe] = useState<Record<string, unknown> | null>(null);
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [fotoAberta, setFotoAberta] = useState<number | null>(null);
  const [triagem, setTriagem] = useState<Record<string, unknown> | null>(null);
  const [iaLigada, setIaLigada] = useState(false);

  const galeria = montarGaleria(ROTULO_FOTO, fotos);

  const carregar = async () => {
    if (fotos) return;
    setCarregando(true);
    setErro(null);

    const r = await fetch(`/api/kyc/admin/${item.userId}`, { cache: "no-store" });
    if (!r.ok) {
      setCarregando(false);
      setErro("Não consegui carregar os dados desta verificação.");
      return;
    }

    const d = (await r.json()) as {
      detalhe: Record<string, unknown>;
      urls: Record<string, string | null>;
      triagem?: Record<string, unknown> | null;
      iaDisponivel?: boolean;
    };
    setDetalhe(d.detalhe);
    setFotos(d.urls);
    setTriagem(d.triagem ?? null);
    setIaLigada(Boolean(d.iaDisponivel));
    setCarregando(false);
  };

  const abrir = () => {
    onAlternar();
    if (!aberto) void carregar();
  };

  const decidir = (decisao: "aprovado" | "recusado" | "pendente") => {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await decidirKyc(item.userId, decisao, nota || undefined);
      if (!r.ok) {
        setErro(r.error ?? "Não foi possível registrar a decisão.");
        return;
      }
      setAviso(
        decisao === "aprovado"
          ? "Verificação aprovada. O cliente já pode movimentar a conta."
          : decisao === "recusado"
            ? "Verificação recusada."
            : "Correção solicitada ao cliente."
      );
      setNota("");
    });
  };

  const precisaNota = nota.trim().length < 5;

  return (
    <div className="kyc-fila-item">
      <header>
        <div>
          <div className="nome">{item.nome}</div>
          <div className="meta">
            CPF {item.cpf ?? "—"} · {item.docType?.toUpperCase() ?? "—"} ·{" "}
            {item.cidade ? `${item.cidade}/${item.state ?? ""}` : "—"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <StatusChip status={item.status} />
          <button type="button" className="bank-acao" onClick={abrir}>
            {aberto ? "Fechar" : "Analisar"}
          </button>
        </div>
      </header>

      {item.reviewNote && <p className="fine">Observação registrada: {item.reviewNote}</p>}

      {aberto && (
        <>
          {carregando && <p className="fine">Carregando documentos…</p>}
          {erro && (
            <div className="alert alert-err" role="alert">
              {erro}
            </div>
          )}
          {aviso && (
            <div className="alert alert-ok" role="status">
              {aviso}
            </div>
          )}

          {detalhe && (
            <PainelIa userId={item.userId} triagem={triagem} disponivel={iaLigada} />
          )}

          {detalhe && (
            <div className="kyc-resumo">
              <Linha rotulo="Nome completo" valor={String(detalhe.full_name ?? "—")} />
              <Linha rotulo="Nascimento" valor={String(detalhe.birth_date ?? "—")} />
              <Linha rotulo="CPF" valor={String(detalhe.cpf ?? "—")} />
              <Linha rotulo="Nome da mãe" valor={String(detalhe.mother_name ?? "—")} />
              <Linha
                rotulo="Contato"
                valor={`${String(detalhe.phone ?? "—")} · ${String(detalhe.email ?? "—")}`}
              />
              <Linha
                rotulo="Endereço"
                valor={`${String(detalhe.address ?? "—")}, ${String(
                  detalhe.address_number ?? "s/n"
                )} — ${String(detalhe.neighborhood ?? "")} ${String(detalhe.city ?? "")}/${String(
                  detalhe.state ?? ""
                )} · CEP ${String(detalhe.cep ?? "—")}`}
              />
              <Linha
                rotulo="Documento"
                valor={`${String(detalhe.doc_type ?? "").toUpperCase()} ${
                  detalhe.doc_number ?? "—"
                } · ${detalhe.doc_issuer ?? ""}/${detalhe.doc_state ?? ""}`}
              />
              <Linha
                rotulo="Comprovante"
                valor={
                  detalhe.proof_type
                    ? PROOF_LABEL[detalhe.proof_type as keyof typeof PROOF_LABEL]
                    : "—"
                }
              />
              <Linha
                rotulo="Biometria"
                valor={`prova de vida ${
                  detalhe.liveness_passed ? "confirmada" : "não confirmada"
                } · qualidade ${detalhe.quality_score ?? "—"}`}
              />
            </div>
          )}

          {fotos && (
            <div className="kyc-fotos">
              {Object.entries(ROTULO_FOTO).map(([chave, legenda]) => {
                const url = fotos[chave];
                const indiceModal = indiceValido(galeria, chave);
                return (
                  <div className="kyc-foto" key={chave}>
                    {url ? (
                      <button
                        type="button"
                        className="kyc-foto-btn"
                        onClick={() => {
                          if (indiceModal !== null) setFotoAberta(indiceModal);
                        }}
                        title="Clique para ampliar"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={legenda} />
                      </button>
                    ) : (
                      <span className="sem-foto">não enviado</span>
                    )}
                    <span className="legenda">{legenda}</span>
                  </div>
                );
              })}
            </div>
          )}

          <ModalFoto
            fotos={galeria}
            indice={fotoAberta}
            onFechar={() => setFotoAberta(null)}
            onIr={setFotoAberta}
          />

          {fotos && (
            <div className="kyc-decisao">
              <textarea
                placeholder="Observação (obrigatória para recusar ou pedir correção)"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
              />
              <button
                type="button"
                className="bank-acao principal"
                onClick={() => decidir("aprovado")}
                disabled={pendente}
              >
                <IconeEscudo size={17} />
                Aprovar
              </button>
              <button
                type="button"
                className="bank-acao"
                onClick={() => decidir("pendente")}
                disabled={pendente || precisaNota}
              >
                <IconeCadeadoAberto size={17} />
                Pedir correção
              </button>
              <button
                type="button"
                className="bank-acao perigo"
                onClick={() => decidir("recusado")}
                disabled={pendente || precisaNota}
              >
                <IconeCadeado size={17} />
                Recusar
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="kyc-item">
      <div>
        <div className="quem">{rotulo}</div>
        <div className="det">{valor}</div>
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: KycFilaItem["status"] }) {
  const classe =
    status === "aprovado" ? "ok" : status === "recusado" ? "erro" : status === "pendente" ? "alerta" : "";
  return <span className={`bank-chip ${classe}`}>{KYC_STATUS_LABEL[status]}</span>;
}

export { urlArquivoKycAdmin };
