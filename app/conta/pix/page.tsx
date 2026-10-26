import PixForm from "@/components/PixForm";
import { requireSession } from "@/lib/account";
import { getBanking } from "@/lib/banking";
import { brl } from "@/lib/format";

export default async function PixPage() {
  const { profile, user } = await requireSession();
  const banking = getBanking(user.id);
  const account = await banking.getAccount(profile?.external_account_id ?? null);
  const active = account?.status === "ativa";

  return (
    <div className="stack" style={{ ["--gap" as string]: "20px", maxWidth: 560 }}>
      <div>
        <h1 className="page-title">{banking.isDemo ? "PIX simulado" : "PIX"}</h1>
        <p className="muted">
          {account ? `${banking.isDemo ? "Saldo fictício" : "Saldo disponível"}: ${brl(account.balance)}` : "Sua conta digital ainda não está ativa."}
        </p>
      </div>
      {!active && (
        <div className="alert alert-warn">
          O envio de PIX é liberado assim que a instituição parceira ativar sua conta.
        </div>
      )}
      <PixForm disabled={!active} demo={banking.isDemo} />
    </div>
  );
}
