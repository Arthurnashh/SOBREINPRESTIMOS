"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import {
  salvarDadosKyc,
  salvarEnderecoKyc,
  salvarDocumentoKyc,
  salvarProvaTipo,
  enviarArquivoKyc,
  enviarFaceKyc,
  registrarBiometriaKyc,
  enviarKycParaAnalise,
  urlArquivoKyc,
} from "@/app/actions/kyc";
import {
  FACE_SHOTS,
  KYC_STATUS_LABEL,
  type FaceAngle,
  type KycDocType,
  type KycProofType,
  type KycSubmission,
} from "@/lib/kyc";
import type { KycSlot } from "@/lib/kyc/service";
import CapturaFacial from "./CapturaFacial";
import UploadDocumento, { type SlotUpload } from "./UploadDocumento";
import { IconeEscudo, IconeCartao, IconePerfil, IconeCadeado, IconeInicio } from "../Icones";

type Etapa = 1 | 2 | 3 | 4;

export default function VerificacaoKyc({
  inicial,
  depois,
}: {
  inicial: KycSubmission;
  /** Para onde ir quando a verificação terminar (vem do cadastro). */
  depois?: string;
}) {
  const [k, setK] = useState<KycSubmission>(inicial);
  const [etapa, setEtapa] = useState<Etapa>(
    inicial.status === "aprovado" || inicial.status === "em_analise" ? 4 : 1
  );
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [docTipo, setDocTipo] = useState<KycDocType>(inicial.docType ?? "cnh");
  const [provaTipo, setProvaTipo] = useState<KycProofType>(inicial.proofType ?? "luz");
  const [pendente, iniciar] = useTransition();

  const recarregar = async () => {
    const r = await fetch("/api/kyc/status", { cache: "no-store" });
    if (r.ok) setK((await r.json()) as KycSubmission);
  };

  const rodar = (fn: () => Promise<{ ok: boolean; error?: string }>, sucesso?: string) => {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) {
        setErro(r.error ?? "Não foi possível concluir.");
        return;
      }
      if (sucesso) setAviso(sucesso);
      await recarregar();
    });
  };

  const registrarSlot = async (slot: SlotUpload, arquivo: File) => {
    const r = await enviarArquivoKyc(slot as KycSlot, arquivo);
    if (r.ok) await recarregar();
    return r;
  };

  const registrarFace = async (angle: FaceAngle, blob: Blob) => {
    const arquivo = new File([blob], `${angle}.jpg`, { type: "image/jpeg" });
    const r = await enviarFaceKyc(angle, arquivo);
    return r;
  };

  const concluirBiometria = (dados: {
    livenessPassed: boolean;
    livenessScore: number;
    qualityScore: number;
  }) => {
    rodar(async () => registrarBiometriaKyc(dados), "Biometria registrada.");
    setEtapa(4);
  };

  const enviar = () => {
    rodar(async () => {
      const r = await enviarKycParaAnalise();
      if (r.ok) await recarregar();
      return r;
    }, "Verificação enviada para análise.");
  };

  /* --------------------------- o que já está pronto --------------------------- */
  const temDados = Boolean(k.fullName && k.birthDate && k.motherName && k.phone && k.email);
  const temEndereco = Boolean(k.cep && k.address && k.city && k.state);
  const temDocDados = Boolean(k.docType && k.docNumber && k.docIssuer && k.docState);
  const temDocumentos =
    k.temDocFrente && k.temDocVerso && k.temComprovante && k.temSelfieDoc;
  const temFace = k.temBiometria && k.livenessPassed;

  const prontoParaEnviar =
    temDados && temEndereco && temDocDados && temDocumentos && temFace;

  /* -------------------------------- status ---------------------------------- */
  if (k.status === "aprovado") {
    return (
      <div className="kyc-shell">
        <div className="kyc-bloco">
          <div className="kyc-status-grande aprovado">
            <span className="glifo">
              <IconeEscudo size={26} />
            </span>
            <div>
              <strong>Identidade verificada</strong>
              <span>
                Sua verificação foi aprovada
                {k.reviewedAt ? ` em ${new Date(k.reviewedAt).toLocaleDateString("pt-BR")}` : ""}. Sua
                conta está liberada para movimentar.
              </span>
            </div>
          </div>
          <Link href={depois ?? "/conta/banco"} className="btn btn-primary btn-block">
            {depois ? "Continuar para o pedido" : "Ir para a minha conta"}
          </Link>
        </div>
      </div>
    );
  }

  if (k.status === "em_analise") {
    return (
      <div className="kyc-shell">
        <div className="kyc-bloco">
          <div className="kyc-status-grande em_analise">
            <span className="glifo">
              <IconeEscudo size={26} />
            </span>
            <div>
              <strong>Verificação em análise</strong>
              <span>
                Recebemos tudo
                {k.submittedAt
                  ? ` em ${new Date(k.submittedAt).toLocaleDateString("pt-BR")}`
                  : ""}
                . A análise costuma levar até 1 dia útil.
              </span>
            </div>
          </div>
          <Link href="/conta/banco" className="btn btn-primary btn-block">
            Ver minha conta
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="kyc-shell">
      <div className="kyc-topo">
        <div>
          <h1>Verificação de identidade</h1>
          <p>
            Para abrir sua conta e liberar a movimentação, precisamos confirmar quem você é. São
            quatro etapas rápidas.
          </p>
        </div>

        <div className="kyc-trilha">
          {[
            { n: 1 as Etapa, label: "Dados", pronto: temDados },
            { n: 2 as Etapa, label: "Endereço e documentos", pronto: temDocumentos && temEndereco },
            { n: 3 as Etapa, label: "Biometria", pronto: temFace },
            { n: 4 as Etapa, label: "Enviar", pronto: prontoParaEnviar },
          ].map((e) => (
            <button
              key={e.n}
              className={`kyc-etapa${etapa === e.n ? " atual" : ""}${e.pronto ? " pronta" : ""}`}
              onClick={() => setEtapa(e.n)}
              type="button"
            >
              <span className="num">{e.pronto && etapa !== e.n ? "✓" : e.n}</span>
              {e.label}
            </button>
          ))}
        </div>
      </div>

      {k.status === "recusado" && k.reviewNote && (
        <div className="kyc-bloco">
          <div className="kyc-status-grande recusado">
            <span className="glifo">
              <IconeCadeado size={26} />
            </span>
            <div>
              <strong>Verificação recusada</strong>
              <span>{k.reviewNote}</span>
            </div>
          </div>
        </div>
      )}

      {k.status === "pendente" && k.reviewNote && (
        <div className="kyc-bloqueio">
          <IconeCadeado size={18} />
          <span>
            <strong>Ajuste necessário:</strong> {k.reviewNote} Corrija e envie de novo.
          </span>
        </div>
      )}

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

      {/* ----------------------------- ETAPA 1 ----------------------------- */}
      {etapa === 1 && (
        <form action={salvarDadosKyc as unknown as (f: FormData) => void} className="kyc-bloco">
          <header>
            <h2>1. Seus dados</h2>
            <p>Precisam bater exatamente com o seu documento.</p>
          </header>

          <div className="kyc-grade">
            <Campo rotulo="Nome completo" full>
              <input name="full_name" defaultValue={k.fullName ?? ""} required autoComplete="name" />
            </Campo>

            <Campo rotulo="Data de nascimento">
              <input type="date" name="birth_date" defaultValue={k.birthDate ?? ""} required />
            </Campo>

            <Campo rotulo="Celular com DDD">
              <input
                name="phone"
                defaultValue={k.phone ?? ""}
                placeholder="11999998888"
                inputMode="numeric"
                required
              />
            </Campo>

            <Campo rotulo="E-mail">
              <input type="email" name="email" defaultValue={k.email ?? ""} required />
            </Campo>

            <Campo rotulo="Nome completo da mãe" full>
              <input name="mother_name" defaultValue={k.motherName ?? ""} required />
            </Campo>
          </div>

          <p className="fine">
            <IconePerfil size={14} /> O CPF do cadastro é conferido na análise, junto com o documento.
          </p>

          <div className="kyc-acoes">
            <button className="bank-acao principal" disabled={pendente}>
              {pendente ? "Salvando…" : "Salvar e continuar"}
            </button>
            {temDados && (
              <button type="button" className="bank-acao" onClick={() => setEtapa(2)}>
                Ir para documentos
              </button>
            )}
          </div>
        </form>
      )}

      {/* ----------------------------- ETAPA 2 ----------------------------- */}
      {etapa === 2 && (
        <>
          <form action={salvarEnderecoKyc as unknown as (f: FormData) => void} className="kyc-bloco">
            <header>
              <h2>2. Onde você mora</h2>
              <p>O endereço precisa aparecer no comprovante que você vai enviar.</p>
            </header>

            <div className="kyc-grade">
              <Campo rotulo="CEP">
                <input name="cep" defaultValue={k.cep ?? ""} inputMode="numeric" required />
              </Campo>

              <Campo rotulo="Logradouro" full>
                <input name="address" defaultValue={k.address ?? ""} required />
              </Campo>

              <Campo rotulo="Número">
                <input name="address_number" defaultValue={k.addressNumber ?? ""} required />
              </Campo>

              <Campo rotulo="Complemento (opcional)">
                <input name="address_extra" defaultValue={k.addressExtra ?? ""} />
              </Campo>

              <Campo rotulo="Bairro">
                <input name="neighborhood" defaultValue={k.neighborhood ?? ""} required />
              </Campo>

              <Campo rotulo="Cidade">
                <input name="city" defaultValue={k.city ?? ""} required />
              </Campo>

              <Campo rotulo="UF">
                <input
                  name="state"
                  defaultValue={k.state ?? ""}
                  maxLength={2}
                  required
                  style={{ textTransform: "uppercase" }}
                />
              </Campo>
            </div>

            <div className="kyc-acoes">
              <button className="bank-acao principal" disabled={pendente}>
                {pendente ? "Salvando…" : "Salvar endereço"}
              </button>
            </div>
          </form>

          <form action={salvarDocumentoKyc as unknown as (f: FormData) => void} className="kyc-bloco">
            <header>
              <h2>3. Seu documento</h2>
              <p>CNH ou RG — os dois valem, e vamos pedir frente e verso.</p>
            </header>

            <div className="kyc-grade">
              <Campo rotulo="Tipo de documento">
                <select name="doc_type" defaultValue={k.docType ?? "cnh"}>
                  <option value="cnh">CNH</option>
                  <option value="rg">RG</option>
                </select>
              </Campo>

              <Campo rotulo="Número do documento">
                <input name="doc_number" defaultValue={k.docNumber ?? ""} required />
              </Campo>

              <Campo rotulo="Órgão emissor">
                <input name="doc_issuer" defaultValue={k.docIssuer ?? ""} placeholder="SSP" required />
              </Campo>

              <Campo rotulo="UF do documento">
                <input
                  name="doc_state"
                  defaultValue={k.docState ?? ""}
                  maxLength={2}
                  placeholder="SP"
                  required
                  style={{ textTransform: "uppercase" }}
                />
              </Campo>
            </div>

            <div className="kyc-acoes">
              <button className="bank-acao principal" disabled={pendente}>
                {pendente ? "Salvando…" : "Salvar documento"}
              </button>
            </div>
          </form>

          <div className="kyc-bloco">
            <header>
              <h2>4. Fotos dos documentos</h2>
              <p>Fundos claros, sem reflexo, com o documento inteiro dentro do quadro.</p>
            </header>

            <div className="kyc-grade">
              <UploadDocumento
                slot="doc_frente"
                titulo="Documento — frente"
                explicacao="O lado da foto e dos dados."
                jaEnviado={k.temDocFrente}
                onEnviar={registrarSlot}
                docTipo={docTipo}
                onDocTipo={(t) => {
                  setDocTipo(t);
                  void salvarDocumentoKyc(undefined as never, montarDoc(t, k) as FormData);
                }}
              />

              <UploadDocumento
                slot="doc_verso"
                titulo="Documento — verso"
                explicacao="O lado do verso, com o código ou filiação."
                jaEnviado={k.temDocVerso}
                onEnviar={registrarSlot}
              />
            </div>

            <UploadDocumento
              slot="comprovante"
              titulo="Comprovante de endereço"
              explicacao="Conta de consumo ou extrato dos últimos 90 dias, no seu nome."
              jaEnviado={k.temComprovante}
              onEnviar={registrarSlot}
              provaTipo={provaTipo}
              onProvaTipo={(t) => {
                setProvaTipo(t);
                rodar(async () => salvarProvaTipo(t));
              }}
            />

            <UploadDocumento
              slot="selfie_doc"
              titulo="Selfie segurando o documento"
              explicacao="Apareça de frente, segurando o documento aberto ao lado do rosto."
              jaEnviado={k.temSelfieDoc}
              onEnviar={registrarSlot}
            />
          </div>

          <div className="kyc-acoes">
            <button type="button" className="bank-acao principal" onClick={() => setEtapa(3)}>
              Ir para a biometria
            </button>
          </div>
        </>
      )}

      {/* ----------------------------- ETAPA 3 ----------------------------- */}
      {etapa === 3 && (
        <div className="kyc-bloco">
          <header>
            <h2>5. Prova de vida</h2>
            <p>
              Vamos capturar cinco ângulos do seu rosto. O movimento confirma que é você, agora, ao
              vivo.
            </p>
          </header>

          {k.temBiometria && k.livenessPassed ? (
            <div className="kyc-status-grande aprovado">
              <span className="glifo">
                <IconeEscudo size={26} />
              </span>
              <div>
                <strong>Biometria capturada</strong>
                <span>
                  Cinco ângulos registrados, prova de vida confirmada. Você pode refazer se quiser.
                </span>
              </div>
            </div>
          ) : null}

          <CapturaFacial onFace={registrarFace} onConcluir={concluirBiometria} />

          <div className="kyc-acoes">
            <button type="button" className="bank-acao principal" onClick={() => setEtapa(4)}>
              Ir para o envio
            </button>
          </div>
        </div>
      )}

      {/* ----------------------------- ETAPA 4 ----------------------------- */}
      {etapa === 4 && (
        <div className="kyc-bloco">
          <header>
            <h2>6. Confira e envie</h2>
            <p>Depois de enviar, a análise costuma levar até 1 dia útil.</p>
          </header>

          <div className="kyc-resumo">
            <ItemKyc
              titulo="Dados pessoais"
              detalhe={k.fullName ?? "não informado"}
              pronto={temDados}
              onIr={() => setEtapa(1)}
            />
            <ItemKyc
              titulo="Endereço"
              detalhe={
                k.address
                  ? `${k.address}, ${k.addressNumber ?? "s/n"} — ${k.city ?? ""}/${k.state ?? ""}`
                  : "não informado"
              }
              pronto={temEndereco}
              onIr={() => setEtapa(2)}
            />
            <ItemKyc
              titulo="Documento"
              detalhe={k.docType ? `${k.docType.toUpperCase()} ${k.docNumber ?? ""}` : "não informado"}
              pronto={temDocDados}
              onIr={() => setEtapa(2)}
            />
            <ItemKyc
              titulo="Fotos do documento"
              detalhe={`frente ${k.temDocFrente ? "ok" : "falta"} · verso ${k.temDocVerso ? "ok" : "falta"}`}
              pronto={k.temDocFrente && k.temDocVerso}
              onIr={() => setEtapa(2)}
            />
            <ItemKyc
              titulo="Comprovante de endereço"
              detalhe={k.temComprovante ? "enviado" : "falta enviar"}
              pronto={k.temComprovante}
              onIr={() => setEtapa(2)}
            />
            <ItemKyc
              titulo="Selfie com documento"
              detalhe={k.temSelfieDoc ? "enviada" : "falta enviar"}
              pronto={k.temSelfieDoc}
              onIr={() => setEtapa(2)}
            />
            <ItemKyc
              titulo="Biometria facial"
              detalhe={`${FACE_SHOTS.length} ângulos · prova de vida ${k.livenessPassed ? "confirmada" : "pendente"}`}
              pronto={temFace}
              onIr={() => setEtapa(3)}
            />
          </div>

          {!prontoParaEnviar && (
            <div className="kyc-bloqueio">
              <IconeCadeado size={18} />
              <span>Ainda faltam itens acima. Complete tudo para enviar para análise.</span>
            </div>
          )}

          <div className="kyc-acoes">
            <button
              type="button"
              className="bank-acao principal"
              onClick={enviar}
              disabled={!prontoParaEnviar || pendente}
            >
              {pendente ? "Enviando…" : "Enviar para análise"}
            </button>
          </div>

          <p className="fine kyc-privacidade">
            <IconeCadeado size={14} /> Seus documentos ficam em área privada, com acesso restrito a
            você e à equipe de análise. Veja como tratamos seus dados na Política de Privacidade.
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ auxiliares ------------------------------ */

function Campo({
  rotulo,
  children,
  full = false,
}: {
  rotulo: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <div className="kyc-campo" style={full ? { gridColumn: "1 / -1" } : undefined}>
      <label>{rotulo}</label>
      {children}
    </div>
  );
}

function ItemKyc({
  titulo,
  detalhe,
  pronto,
  onIr,
}: {
  titulo: string;
  detalhe: string;
  pronto: boolean;
  onIr: () => void;
}) {
  return (
    <div className="kyc-item">
      <div>
        <div className="quem">{titulo}</div>
        <div className="det">{detalhe}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className={`bank-chip ${pronto ? "ok" : "alerta"}`}>{pronto ? "Pronto" : "Pendente"}</span>
        {!pronto && (
          <button type="button" className="bank-acao" onClick={onIr}>
            Corrigir
          </button>
        )}
      </div>
    </div>
  );
}

/** Monta o FormData do documento ao trocar CNH/RG no seletor. */
function montarDoc(tipo: KycDocType, k: KycSubmission): FormData {
  const f = new FormData();
  f.set("doc_type", tipo);
  f.set("doc_number", k.docNumber ?? "");
  f.set("doc_issuer", k.docIssuer ?? "SSP");
  f.set("doc_state", k.docState ?? "SP");
  return f;
}

export { IconeInicio, IconeCartao };
