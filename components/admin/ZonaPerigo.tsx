"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  desativarContaAdmin,
  excluirContaAdmin,
  previaExclusaoAdmin,
  type PreviaExclusao,
} from "@/app/actions/admin";
import { brl } from "@/lib/format";

type Props = {
  userId: string;
  /** `bank_accounts.status` como veio na ficha. */
  statusConta: string | null;
};

/**
 * Zona de risco da ficha da conta.
 *
 * Duas ações com pesos bem diferentes:
 *
 *   Suspender  → status 'encerrada'. Não apaga nada. O cliente continua
 *                autenticado e passa a ver a tela de conta suspensa.
 *                Reversível pelo próprio botão.
 *
 *   Excluir    → apaga o usuário e, por CASCADE, tudo que pende dele: conta,
 *                cartão, chaves PIX, extrato, KYC (com documentos e selfies),
 *                pedidos e parcelas. Irreversível.
 *
 * A exclusão pede o CPF ou o nome completo digitado, conferido contra o
 * cadastro no servidor — sem isso a trava seria decorativa. E mostra a prévia
 * do que será perdido, para a decisão ser informada, não um "tem certeza?".
 */
export default function ZonaPerigo({ userId, statusConta }: Props) {
  const router = useRouter();
  const suspensa = statusConta === "encerrada";

  const [motivo, setMotivo] = useState("");
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const [previa, setPrevia] = useState<PreviaExclusao["dados"] | null>(null);
  const [carregandoPrevia, setCarregandoPrevia] = useState(true);
  const [abrirExclusao, setAbrirExclusao] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [forcar, setForcar] = useState(false);

  const carregarPrevia = useCallback(async () => {
    setCarregandoPrevia(true);
    const r = await previaExclusaoAdmin(userId);
    setCarregandoPrevia(false);
    if (r.dados) setPrevia(r.dados);
  }, [userId]);

  useEffect(() => {
    void carregarPrevia();
  }, [carregarPrevia]);

  const executar = (fn: () => Promise<{ error?: string; ok?: string } | undefined>) => {
    setMsg(null);
    iniciar(async () => {
      const r = await fn();
      if (r?.error) setMsg({ tipo: "erro", texto: r.error });
      else if (r?.ok) {
        setMsg({ tipo: "ok", texto: r.ok });
        setMotivo("");
        setConfirmacao("");
        setForcar(false);
        setAbrirExclusao(false);
        void carregarPrevia();
        router.refresh();
      }
    });
  };

  const impedimentos = previa?.impedimentos ?? [];
  const bloqueadoPorImpedimento = impedimentos.length > 0;
  const podeExcluir = !bloqueadoPorImpedimento || forcar;
  const confirmacaoOk = confirmacao.trim().length >= 3;

  return (
    <div className="kyc-bloco zona-perigo">
      <header>
        <h2>Suspender ou excluir</h2>
        <p>
          Suspender bloqueia o acesso sem apagar nada. Excluir remove a conta e todos os dados —
          não tem volta.
        </p>
      </header>

      {/* ------------------------- estado atual ------------------------- */}
      <div className={`perigo-estado${suspensa ? " suspensa" : ""}`}>
        <strong>{suspensa ? "Conta suspensa" : "Conta ativa"}</strong>
        <span>
          {suspensa
            ? "O cliente está vendo o aviso de conta suspensa e não consegue movimentar nada."
            : "O cliente tem acesso normal à conta."}
        </span>
      </div>

      <div className="ficha-acao">
        <label htmlFor="motivo-perigo">Motivo (obrigatório, fica na auditoria)</label>
        <input
          id="motivo-perigo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: encerramento a pedido do cliente"
          maxLength={200}
        />

        <div className="ficha-botoes">
          <button
            type="button"
            className={suspensa ? "bank-acao" : "bank-acao perigo"}
            disabled={pendente || motivo.trim().length < 5}
            onClick={() => executar(() => desativarContaAdmin(userId, !suspensa, motivo))}
          >
            {suspensa ? "Reativar conta" : "Suspender conta"}
          </button>

          <button
            type="button"
            className="bank-acao perigo"
            disabled={pendente || !previa}
            onClick={() => setAbrirExclusao((v) => !v)}
          >
            {abrirExclusao ? "Cancelar exclusão" : "Excluir conta…"}
          </button>
        </div>
      </div>

      {/* --------------------- prévia e confirmação --------------------- */}
      {abrirExclusao && (
        <div className="perigo-exclusao">
          <h3>O que será apagado</h3>

          {carregandoPrevia ? (
            <p className="fine">Carregando…</p>
          ) : !previa ? (
            <p className="fine">Não foi possível carregar a prévia.</p>
          ) : (
            <>
              <ul className="perigo-lista">
                <li>
                  <strong>{previa.nome ?? "—"}</strong> · CPF {previa.cpf ?? "—"}
                </li>
                <li>
                  Saldo: <strong>{brl(previa.saldo)}</strong>
                  {previa.bloqueado > 0 ? ` · bloqueado: ${brl(previa.bloqueado)}` : ""}
                </li>
                <li>
                  {previa.emprestimos} pedido(s) de empréstimo
                  {previa.emprestimosAtivos > 0 ? ` (${previa.emprestimosAtivos} em andamento)` : ""}
                </li>
                <li>{previa.transacoes} lançamento(s) no extrato</li>
                <li>{previa.kyc > 0 ? "Documentos e fotos do KYC" : "Sem KYC enviado"}</li>
                {previa.taxasPagas > 0 && (
                  <li>
                    <strong>{previa.taxasPagas} taxa(s) de confiança paga(s)</strong> — o comprovante
                    do PIX deixa de existir no sistema
                  </li>
                )}
              </ul>

              {bloqueadoPorImpedimento && (
                <div className="alert alert-warn" role="alert">
                  <strong>Esta conta não pode ser excluída agora:</strong>
                  <ul>
                    {impedimentos.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                  Resolva os itens acima, ou marque a exclusão forçada abaixo.
                </div>
              )}

              {bloqueadoPorImpedimento && (
                <label className="perigo-forcar">
                  <input
                    type="checkbox"
                    checked={forcar}
                    onChange={(e) => setForcar(e.target.checked)}
                  />
                  Excluir mesmo assim (assumo a perda dos valores acima)
                </label>
              )}

              <label htmlFor="confirmacao-perigo">
                Para confirmar, digite o <strong>CPF</strong> ou o <strong>nome completo</strong> do
                cliente
              </label>
              <input
                id="confirmacao-perigo"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                placeholder={previa.cpf ?? "CPF ou nome completo"}
                autoComplete="off"
              />

              <button
                type="button"
                className="bank-acao perigo"
                disabled={
                  pendente ||
                  motivo.trim().length < 10 ||
                  !confirmacaoOk ||
                  !podeExcluir
                }
                onClick={() => executar(() => excluirContaAdmin(userId, motivo, forcar, confirmacao))}
              >
                {pendente ? "Excluindo…" : "Excluir definitivamente"}
              </button>

              {motivo.trim().length < 10 && (
                <p className="fine">O motivo da exclusão precisa de pelo menos 10 caracteres.</p>
              )}
            </>
          )}
        </div>
      )}

      {msg && (
        <div className={`alert ${msg.tipo === "ok" ? "alert-ok" : "alert-err"}`} role="alert">
          {msg.texto}
        </div>
      )}
    </div>
  );
}
