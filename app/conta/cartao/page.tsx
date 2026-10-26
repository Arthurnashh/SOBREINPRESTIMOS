import { requireSession } from "@/lib/account";
import { getBanking } from "@/lib/banking";

export default async function CartaoPage() {
  const { profile, user } = await requireSession();
  const banking = getBanking(user.id);
  const card = await banking.getCard(profile?.external_account_id ?? null);

  return (
    <div className="stack" style={{ ["--gap" as string]: "20px" }}>
      <div>
        <h1 className="page-title">Cartão virtual</h1>
        <p className="muted">{banking.isDemo ? "Cartão fictício para demonstração. Não permite compras." : "Use para compras online, com o saldo da sua conta digital."}</p>
      </div>

      {card ? (
        <div className="card stack">
          <div className="vcard">
            <div className="meta">
              <span>{card.brand}</span>
              <span>{banking.isDemo ? "Sem valor financeiro" : card.status === "ativo" ? "Ativo" : "Bloqueado"}</span>
            </div>
            <div className="num">•••• •••• •••• {card.last4}</div>
            <div className="meta">
              <span>{card.holder}</span>
              <span>{card.expiry}</span>
            </div>
          </div>
          <p className="fine">
            {banking.isDemo ? "Os dígitos, o titular e a validade são fictícios. Não há número completo ou CVV neste modo." : "Número completo e CVV são exibidos apenas no ambiente seguro da instituição emissora."}
          </p>
        </div>
      ) : (
        <div className="card stack">
          <div className="vcard off">
            <div className="meta">
              <span>Cartão virtual</span>
            </div>
            <div className="num">•••• •••• •••• ••••</div>
            <div className="meta">
              <span>{profile?.full_name ?? ""}</span>
            </div>
          </div>
          <p className="muted">
            Seu cartão é emitido pela instituição parceira assim que sua conta digital for ativada.
          </p>
        </div>
      )}
    </div>
  );
}
