"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  ajustarSaldoAdmin,
  bloquearCartaoAdmin,
  bloquearContaAdmin,
  type AcaoConta,
} from "@/app/actions/admin";
import { brl, date, formatCpf } from "@/lib/format";
import { KYC_STATUS_LABEL, type KycStatus } from "@/lib/kyc";
import { IconeEscudo, IconeCadeado, IconeCadeadoAberto, IconeCartao } from "../Icones";

const ROTULO_FOTO: Record<string, string> = {
  doc_frente: "Documento — frente",
  doc_verso: "Documento — verso",
  comprovante: "Comprovante de endereço",
  selfie_doc: "Selfie com documento",
  face_frontal: "Rosto — frontal",
  face_direita: "Rosto — direita",
  face_esquerda: "Rosto — esquerda",
  face_sorriso: "Rosto — sorrindo",
  face_perto: "Rosto — aproximado",
};

type Detalhe = Record<string, unknown>;

function txt(v: unknown, padrao = "—"): string {
  if (v === null || v === undefined || v === "") return padrao;
  return String(v);
}

export default function FichaConta({
  userId,
  ficha,
}: {
  userId: string;
  ficha: Detalhe;
}) {
  const perfil = (ficha.perfil ?? {}) as Detalhe;
  const conta = (ficha.conta ?? null) as Detalhe | null;
  const cartao = (ficha.cartao ?? null) as Detalhe | null;
  const kyc = (ficha.kyc ?? null) as Detalhe | null;
  const bp = (ficha.dados_bancarios ?? null) as Detalhe | null;
  const limites = (ficha.limites ?? null) as Detalhe | null;
  const extrato = (ficha.extrato ?? []) as Detalhe[];
  const pix = (ficha.pix ?? []) as Detalhe[];
  const emprestimos = (ficha.emprestimos ?? []) as Detalhe[];
  const auditoria = (ficha.auditoria ?? []) as Detalhe[];

  const [fotos, setFotos] = useState<Record<string, string | null> | null>(null);
  const [carregandoFotos, setCarregandoFotos] = useState(false);
  const [erroFotos, setErroFotos] = useState<string | null>(null);

  const bloqueada = conta?.status === "bloqueada";

  const [motivo, setMotivo] = useState("");
  const [valor, setValor] = useState("");
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const executar = (fn: () => Promise<AcaoConta>) => {
    setMsg(null);
    iniciar(async () => {
      const r = await fn();
      if (r?.error) setMsg({ tipo: "erro", texto: r.error });
      else if (r?.ok) {
        setMsg({ tipo: "ok", texto: r.ok });
        setValor("");
        setMotivo("");
      }
    });
  };

  const carregarFotos = async () => {
    if (fotos || carregandoFotos) return;
    setCarregandoFotos(true);
    setErroFotos(null);
    try {
      const r = await fetch(`/api/kyc/admin/${userId}`, { cache: "no-store" });
      if (!r.ok) {
        setErroFotos("Não consegui carregar as fotos desta verificação.");
        return;
      }
      const d = (await r.json()) as { urls: Record<string, string | null> };
      setFotos(d.urls);
    } catch {
      setErroFotos("Falha de rede ao carregar as fotos.");
    } finally {
      setCarregandoFotos(false);
    }
  };

  const statusKyc = (kyc?.status ?? "nao_iniciado") as KycStatus;
  const paths = (kyc?.paths ?? {}) as Record<string, string | null>;

  return (
    <div className="kyc-shell ficha-admin">
      {/* ------------------------------ topo ------------------------------ */}
      <div className="kyc-topo">
        <div>
          <h1>{txt(perfil.full_name)}</h1>
          <p>
            CPF {formatCpf(txt(perfil.cpf, ""))} · {txt(perfil.phone)} · cadastro em{" "}
            {txt(perfil.created_at) !== "—" ? date(String(perfil.created_at)) : "—"}
            {perfil.is_admin ? " · administrador" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className={`badge ${statusKyc === "aprovado" ? "b-aprovado" : "b-cancelado"}`}>
            {KYC_STATUS_LABEL[statusKyc] ?? statusKyc}
          </span>
          {conta && (
            <span className={`badge ${bloqueada ? "b-cancelado" : "b-aprovado"}`}>
              {bloqueada ? "Conta bloqueada" : "Conta ativa"}
            </span>
          )}
        </div>
      </div>

      {msg && (
        <div className={msg.tipo === "ok" ? "alert alert-ok" : "alert alert-err"} role="alert">
          {msg.texto}
        </div>
      )}

      {/* ----------------------------- saldo ----------------------------- */}
      <div className="kyc-bloco">
        <header>
          <h2>Conta bancária</h2>
          <p>Saldo, limite e identificação da conta.</p>
        </header>

        {!conta ? (
          <p className="fine">Esta pessoa ainda não tem conta bancária aberta.</p>
        ) : (
          <>
            <div className="kyc-resumo">
              <Linha rotulo="Saldo" valor={brl(Number(conta.balance ?? 0))} destaque />
              <Linha rotulo="Limite de cheque especial" valor={brl(Number(conta.overdraft ?? 0))} />
              <Linha
                rotulo="Agência / Conta"
                valor={`${txt(conta.agency)} / ${txt(conta.number)}-${txt(conta.check_digit)}`}
              />
              <Linha rotulo="Status" valor={txt(conta.status)} />
              <Linha rotulo="Aberta em" valor={txt(conta.opened_at) !== "—" ? date(String(conta.opened_at)) : "—"} />
            </div>

            {/* ------------------------- ações ------------------------- */}
            <div className="ficha-acoes">
              <div className="ficha-acao">
                <label htmlFor="valor">Ajustar saldo</label>
                <input
                  id="valor"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="Ex.: 150,00 ou -80,00"
                  inputMode="decimal"
                />
                <p className="fine">
                  Positivo credita, negativo debita. Vira lançamento no extrato do cliente.
                </p>
                <button
                  type="button"
                  className="bank-acao principal"
                  disabled={pendente || !valor.trim() || motivo.trim().length < 5}
                  onClick={() => executar(() => ajustarSaldoAdmin(userId, valor, motivo))}
                >
                  {pendente ? "Aplicando…" : "Aplicar ajuste"}
                </button>
              </div>

              <div className="ficha-acao">
                <label htmlFor="motivo">Motivo (obrigatório, fica registrado)</label>
                <input
                  id="motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: correção de depósito não creditado"
                  maxLength={200}
                />
                <p className="fine">
                  Mínimo 5 caracteres. O motivo entra na trilha de auditoria com o seu nome e a hora.
                </p>

                <div className="ficha-botoes">
                  <button
                    type="button"
                    className={bloqueada ? "bank-acao" : "bank-acao perigo"}
                    disabled={pendente || motivo.trim().length < 5}
                    onClick={() => executar(() => bloquearContaAdmin(userId, !bloqueada, motivo))}
                  >
                    {bloqueada ? <IconeCadeadoAberto size={17} /> : <IconeCadeado size={17} />}
                    {bloqueada ? "Desbloquear conta" : "Bloquear conta"}
                  </button>

                  {cartao && cartao.status !== "cancelado" && (
                    <button
                      type="button"
                      className={cartao.status === "bloqueado" ? "bank-acao" : "bank-acao perigo"}
                      disabled={pendente || motivo.trim().length < 5}
                      onClick={() =>
                        executar(() => bloquearCartaoAdmin(userId, cartao.status !== "bloqueado", motivo))
                      }
                    >
                      <IconeCartao size={17} />
                      {cartao.status === "bloqueado" ? "Desbloquear cartão" : "Bloquear cartão"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ------------------------------ KYC ------------------------------ */}
      <div className="kyc-bloco">
        <header>
          <h2>Verificação de identidade</h2>
          <p>Dados declarados, documentos e os cinco ângulos do rosto.</p>
        </header>

        {!kyc ? (
          <p className="fine">Esta pessoa ainda não iniciou a verificação.</p>
        ) : (
          <>
            <div className="kyc-resumo">
              <Linha rotulo="Nome completo" valor={txt(kyc.full_name)} />
              <Linha rotulo="Nascimento" valor={txt(kyc.birth_date)} />
              <Linha rotulo="CPF informado" valor={txt(kyc.cpf)} />
              <Linha rotulo="Nome da mãe" valor={txt(kyc.mother_name)} />
              <Linha rotulo="Contato" valor={`${txt(kyc.phone)} · ${txt(kyc.email)}`} />
              <Linha
                rotulo="Endereço"
                valor={`${txt(kyc.address)}, ${txt(kyc.address_number)} ${txt(kyc.address_extra, "")} — ${txt(
                  kyc.neighborhood
                )} ${txt(kyc.city)}/${txt(kyc.state)} · CEP ${txt(kyc.cep)}`}
              />
              <Linha
                rotulo="Documento"
                valor={`${txt(kyc.doc_type, "").toUpperCase()} ${txt(kyc.doc_number)} · ${txt(
                  kyc.doc_issuer
                )}/${txt(kyc.doc_state)}`}
              />
              <Linha
                rotulo="Biometria"
                valor={`prova de vida ${kyc.liveness_passed ? "confirmada" : "NÃO confirmada"} · qualidade ${txt(
                  kyc.quality_score
                )}`}
              />
              <Linha rotulo="Enviado em" valor={txt(kyc.submitted_at) !== "—" ? date(String(kyc.submitted_at)) : "—"} />
              <Linha rotulo="Observação da análise" valor={txt(kyc.review_note, "nenhuma")} />
            </div>

            <div className="kyc-acoes">
              {!fotos && (
                <button type="button" className="bank-acao principal" onClick={carregarFotos} disabled={carregandoFotos}>
                  {carregandoFotos ? "Carregando fotos…" : "Ver as fotos enviadas"}
                </button>
              )}
              {erroFotos && <p className="fine">{erroFotos}</p>}
              {!fotos && !carregandoFotos && Object.values(paths).every((p) => !p) && (
                <p className="fine">Nenhum arquivo foi enviado ainda.</p>
              )}
            </div>

            {fotos && (
              <div className="kyc-fotos">
                {Object.entries(ROTULO_FOTO).map(([chave, legenda]) => {
                  const url = fotos[chave];
                  return (
                    <div className="kyc-foto" key={chave}>
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={legenda} />
                        </a>
                      ) : (
                        <span className="sem-foto">não enviado</span>
                      )}
                      <span className="legenda">{legenda}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ------------------------ dados bancários ------------------------ */}
      {bp && (
        <div className="kyc-bloco">
          <header>
            <h2>Dados bancários declarados</h2>
            <p>Informações cadastrais da conta bancária.</p>
          </header>
          <div className="kyc-resumo">
            <Linha
              rotulo="Endereço"
              valor={`${txt(bp.address_line)}, ${txt(bp.address_num)} ${txt(bp.complement, "")} — ${txt(
                bp.district
              )} ${txt(bp.city)}/${txt(bp.state)} · CEP ${txt(bp.zip)}`}
            />
            <Linha rotulo="Ocupação" valor={txt(bp.occupation, "não informada")} />
            <Linha rotulo="Renda declarada" valor={bp.income ? brl(Number(bp.income)) : "não informada"} />
          </div>
        </div>
      )}

      {/* ---------------------------- cartão ---------------------------- */}
      <div className="kyc-bloco">
        <header>
          <h2>Cartão</h2>
          <p>Situação do cartão desta conta.</p>
        </header>
        {!cartao ? (
          <p className="fine">Sem cartão emitido.</p>
        ) : (
          <div className="kyc-resumo">
            <Linha rotulo="Final" valor={`•••• ${txt(cartao.last4)}`} />
            <Linha rotulo="Bandeira" valor={txt(cartao.brand)} />
            <Linha rotulo="Titular" valor={txt(cartao.holder)} />
            <Linha
              rotulo="Validade"
              valor={`${String(cartao.expiry_month).padStart(2, "0")}/${txt(cartao.expiry_year)}`}
            />
            <Linha rotulo="Status" valor={txt(cartao.status)} />
          </div>
        )}
      </div>

      {/* ---------------------------- limites ---------------------------- */}
      {limites && (
        <div className="kyc-bloco">
          <header>
            <h2>Limites de movimentação</h2>
          </header>
          <div className="kyc-resumo">
            <Linha rotulo="PIX por transação" valor={brl(Number(limites.pix_per_tx ?? 0))} />
            <Linha rotulo="PIX por dia" valor={brl(Number(limites.pix_per_day ?? 0))} />
            <Linha rotulo="Transferência por transação" valor={brl(Number(limites.transfer_per_tx ?? 0))} />
            <Linha rotulo="Saque por dia" valor={brl(Number(limites.withdraw_per_day ?? 0))} />
          </div>
        </div>
      )}

      {/* ------------------------------ PIX ------------------------------ */}
      <div className="kyc-bloco">
        <header>
          <h2>Chaves PIX</h2>
        </header>
        {!pix.length ? (
          <p className="fine">Nenhuma chave cadastrada.</p>
        ) : (
          <ul className="list">
            {pix.map((k) => (
              <li key={String(k.id)}>
                <div>
                  <strong>{txt(k.key_value)}</strong>
                  <div className="fine">{txt(k.key_type)}</div>
                </div>
                <span className="fine">{txt(k.created_at) !== "—" ? date(String(k.created_at)) : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------------------------- extrato ---------------------------- */}
      <div className="kyc-bloco">
        <header>
          <h2>Extrato</h2>
          <p>Últimos {extrato.length} lançamentos.</p>
        </header>
        {!extrato.length ? (
          <p className="fine">Sem movimentação.</p>
        ) : (
          <div className="table-scroll">
            <table className="users-table">
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Descrição</th>
                  <th scope="col">Valor</th>
                </tr>
              </thead>
              <tbody>
                {extrato.map((t) => (
                  <tr key={String(t.id)}>
                    <td>{txt(t.created_at) !== "—" ? date(String(t.created_at)) : "—"}</td>
                    <td>{txt(t.kind)}</td>
                    <td>{txt(t.description)}</td>
                    <td>
                      {t.kind === "pix_envio" ||
                      t.kind === "transferencia_envio" ||
                      t.kind === "boleto" ||
                      t.kind === "saque" ||
                      t.kind === "tarifa" ||
                      t.kind === "debito_automatico"
                        ? `− ${brl(Number(t.amount ?? 0))}`
                        : `+ ${brl(Number(t.amount ?? 0))}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* -------------------------- empréstimos -------------------------- */}
      <div className="kyc-bloco">
        <header>
          <h2>Empréstimos</h2>
        </header>
        {!emprestimos.length ? (
          <p className="fine">Nenhum pedido de empréstimo.</p>
        ) : (
          <ul className="list">
            {emprestimos.map((l) => (
              <li key={String(l.id)}>
                <div>
                  <strong>{brl(Number(l.amount ?? 0))}</strong>{" "}
                  <span className="muted">em {txt(l.installments)}x</span>
                  <div className="fine">
                    {txt(l.status)} · {txt(l.created_at) !== "—" ? date(String(l.created_at)) : ""}
                  </div>
                </div>
                <Link href={`/admin/pedido/${l.id}`} className="btn btn-ghost" style={{ height: 36 }}>
                  Abrir pedido
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* --------------------------- auditoria --------------------------- */}
      <div className="kyc-bloco">
        <header>
          <h2>Histórico administrativo</h2>
          <p>O que já foi feito nesta conta pelo painel.</p>
        </header>
        {!auditoria.length ? (
          <p className="fine">Nenhuma ação administrativa registrada.</p>
        ) : (
          <ul className="list">
            {auditoria.map((a) => (
              <li key={String(a.id)}>
                <div>
                  <strong>{txt(a.acao)}</strong>
                  <div className="fine">{txt(a.motivo, "sem motivo registrado")}</div>
                </div>
                <span className="fine">{txt(a.created_at) !== "—" ? date(String(a.created_at)) : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="kyc-bloco">
        <p className="fine">
          <IconeEscudo size={14} /> Toda ação de escrita fica registrada com autor, motivo e horário.
        </p>
      </div>
    </div>
  );
}

function Linha({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div className="kyc-item">
      <div>
        <div className="quem">{rotulo}</div>
        <div className="det" style={destaque ? { fontSize: 20, fontWeight: 700 } : undefined}>
          {valor}
        </div>
      </div>
    </div>
  );
}
