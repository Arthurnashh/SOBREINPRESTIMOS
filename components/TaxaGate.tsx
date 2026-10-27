"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { brl, pct } from "@/lib/format";
import {
  consultarPagamentoTaxa,
  gerarCobrancaTaxa,
  type CobrancaTaxa,
} from "@/app/actions/taxa";

type Props = {
  loanId: string;
  taxa: number;
  parcela: number;
  percentual: number;
  /** Cobrança ainda válida, se o cliente já gerou o PIX nos últimos 30 min. */
  cobrancaInicial: CobrancaTaxa | null;
};

function restante(expiraEm: string | null): string {
  if (!expiraEm) return "";
  const ms = new Date(expiraEm).getTime() - Date.now();
  if (ms <= 0) return "expirado";
  const min = Math.floor(ms / 60000);
  const seg = Math.floor((ms % 60000) / 1000);
  return `${String(min).padStart(2, "0")}:${String(seg).padStart(2, "0")}`;
}

/**
 * Portão da conta bancária.
 *
 * Enquanto a taxa de confiança não for paga, esta tela cobre toda a área da
 * conta. Não tem botão de fechar: a única saída é pagar o PIX (ou sair da
 * conta). A cobrança é reaproveitada por 30 minutos — quem fecha a página e
 * volta vê o mesmo QR code e o mesmo copia e cola.
 */
export default function TaxaGate({ loanId, taxa, parcela, percentual, cobrancaInicial }: Props) {
  const router = useRouter();
  const [cobranca, setCobranca] = useState<CobrancaTaxa | null>(cobrancaInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [pago, setPago] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [tique, setTique] = useState(0);
  const [resta, setResta] = useState("");
  const jaConfirmou = useRef(false);

  const gerar = useCallback(async () => {
    setErro(null);
    setCarregando(true);
    const r = await gerarCobrancaTaxa(loanId);
    setCarregando(false);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    setCobranca(r.cobranca);
    if (r.pago) {
      setPago(true);
      router.refresh();
    }
  }, [loanId, router]);

  const verificar = useCallback(async () => {
    if (jaConfirmou.current) return;
    const r = await consultarPagamentoTaxa(loanId);
    if (!r.ok) return;
    if (r.pago) {
      jaConfirmou.current = true;
      setPago(true);
      router.refresh();
      return;
    }
    if (r.status === "expired") {
      setCobranca(null);
    }
  }, [loanId, router]);

  // Contagem regressiva do QR.
  useEffect(() => {
    if (!cobranca?.expiresAt) {
      setResta("");
      return;
    }
    const atualiza = () => {
      const texto = restante(cobranca.expiresAt);
      setResta(texto);
      if (texto === "expirado") setCobranca(null);
    };
    atualiza();
    const id = setInterval(atualiza, 1000);
    return () => clearInterval(id);
  }, [cobranca?.expiresAt]);

  // Consulta o gateway a cada 5 segundos enquanto houver cobrança aberta.
  useEffect(() => {
    if (!cobranca || pago) return;
    const id = setInterval(() => {
      setTique((n) => n + 1);
    }, 5000);
    return () => clearInterval(id);
  }, [cobranca, pago]);

  useEffect(() => {
    if (tique > 0 && cobranca && !pago) void verificar();
  }, [tique, cobranca, pago, verificar]);

  const copiar = async () => {
    if (!cobranca?.copyPaste) return;
    try {
      await navigator.clipboard.writeText(cobranca.copyPaste);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setErro("Não foi possível copiar automaticamente. Selecione o código e copie.");
    }
  };

  if (pago) {
    return (
      <div className="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="taxa-titulo">
        <div className="modal-caixa" style={{ textAlign: "center" }}>
          <p className="eyebrow">Pagamento confirmado</p>
          <h2 id="taxa-titulo" style={{ marginTop: 10 }}>
            Conta liberada
          </h2>
          <p className="muted" style={{ marginTop: 12 }}>
            Recebemos o pagamento da taxa de confiança de {brl(taxa)}. O valor do empréstimo já
            está disponível na sua conta e a taxa foi abatida na primeira parcela.
          </p>
          <div className="modal-acoes" style={{ justifyContent: "center" }}>
            <button type="button" className="btn btn-primary" onClick={() => router.refresh()}>
              Continuar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="taxa-titulo">
      <div className="modal-caixa">
        <p className="eyebrow">Empréstimo liberado</p>
        <h2 id="taxa-titulo" style={{ marginTop: 10 }}>
          Pague a taxa de confiança
        </h2>

        <div className="modal-valor">{brl(taxa)}</div>
        <p className="fine">
          {pct(percentual, 0)} da sua parcela de {brl(parcela)}.
        </p>

        <p className="muted" style={{ marginTop: 14 }}>
          O valor do empréstimo está na sua conta, mas a conta bancária fica bloqueada até o
          pagamento desta taxa. Ela <strong>não é cobrança extra</strong>: é abatida na sua
          primeira parcela, que passa a ser de <strong>{brl(Math.max(parcela - taxa, 0))}</strong>.
        </p>

        {!cobranca ? (
          <>
            <div className="modal-acoes">
              <button
                type="button"
                className="btn btn-primary"
                onClick={gerar}
                disabled={carregando}
              >
                {carregando ? "Gerando PIX…" : "Gerar PIX de pagamento"}
              </button>
            </div>
            <p className="fine" style={{ marginTop: 12 }}>
              O PIX vale por 30 minutos. Se você fechar esta página e voltar dentro desse prazo, o
              mesmo QR code aparece novamente.
            </p>
          </>
        ) : (
          <>
            {cobranca.qrCode && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cobranca.qrCode}
                alt="QR code para pagamento da taxa de confiança"
                className="pix-qr"
              />
            )}

            <p className="fine" style={{ textAlign: "center", marginTop: 8 }}>
              Escaneie o QR code ou use o PIX copia e cola
              {resta ? ` · expira em ${resta}` : ""}
            </p>

            {cobranca.copyPaste && (
              <>
                <label className="fine" htmlFor="pix-copia" style={{ marginTop: 10 }}>
                  PIX copia e cola
                </label>
                <textarea
                  id="pix-copia"
                  className="pix-copia"
                  readOnly
                  value={cobranca.copyPaste}
                  rows={4}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <div className="modal-acoes">
                  <button type="button" className="btn btn-primary" onClick={copiar}>
                    {copiado ? "Copiado!" : "Copiar código PIX"}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={verificar}>
                    Já paguei, verificar
                  </button>
                </div>
              </>
            )}

            <p className="fine" style={{ marginTop: 12 }}>
              A conta é liberada automaticamente assim que o banco confirmar o pagamento. Esta
              tela atualiza sozinha.
            </p>
          </>
        )}

        {erro && (
          <div className="alert alert-err" role="alert" style={{ marginTop: 14 }}>
            {erro}
          </div>
        )}
      </div>
    </div>
  );
}
