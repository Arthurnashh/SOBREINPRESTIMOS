import { alterarStatusCartao } from "@/app/actions/banco";
import { brl } from "@/lib/format";
import type { Account, Card } from "@/lib/banking";

/** Painel "Meus cartões". */
export default function PainelCartoes({
  card,
  conta,
  nome,
  limite,
}: {
  card: Card | null;
  conta: Account;
  nome: string;
  limite: number;
}) {
  const ativo = card?.status === "ativo";

  return (
    <div className="stack" style={{ ["--gap" as string]: "16px" }}>
      <section className="bank-secao">
        <header>
          <h2>Meus cartões</h2>
          {card && (
            <form action={alterarStatusCartao}>
              <input type="hidden" name="status" value={ativo ? "bloqueado" : "ativo"} />
              <button className="btn btn-ghost" style={{ height: 36, fontSize: 13 }}>
                {ativo ? "Bloquear cartão" : "Desbloquear cartão"}
              </button>
            </form>
          )}
        </header>

        {card ? (
          <>
            <div className="bank-cards">
              <div className={`bank-card${ativo ? "" : " bloqueado"}`}>
                <div className="marca">
                  <span>{card.brand}</span>
                  <span>{ativo ? "Ativo" : "Bloqueado"}</span>
                </div>
                <div className="numero">•••• •••• •••• {card.last4}</div>
                <div className="rodape">
                  <span>{card.holder || nome}</span>
                  <span>
                    {String(card.expiryMonth).padStart(2, "0")}/{String(card.expiryYear).slice(-2)}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div className="bank-linha">
                <div>
                  <div className="quem">Status</div>
                  <div className="quando">Compras {ativo ? "liberadas" : "recusadas"}</div>
                </div>
                <span className={`bank-chip ${ativo ? "ok" : "erro"}`}>{ativo ? "Ativo" : "Bloqueado"}</span>
              </div>
              <div className="bank-linha">
                <div>
                  <div className="quem">Limite disponível para compras</div>
                  <div className="quando">Saldo da conta {brl(conta.balance)}</div>
                </div>
                <span className="valor">{brl(limite)}</span>
              </div>
              <div className="bank-linha">
                <div>
                  <div className="quem">Validade</div>
                  <div className="quando">Vencimento do cartão</div>
                </div>
                <span className="valor">
                  {String(card.expiryMonth).padStart(2, "0")}/{card.expiryYear}
                </span>
              </div>
            </div>

            <p className="fine">
              O cartão debita direto da sua conta. Para ver o número completo e o CVV, use o app da
              instituição emissora. Perdeu o cartão? Bloqueie agora — é imediato.
            </p>
          </>
        ) : (
          <p className="fine">Seu cartão está sendo emitido. Ele aparece aqui em instantes.</p>
        )}
      </section>
    </div>
  );
}
