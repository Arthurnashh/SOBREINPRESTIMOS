import { requireSession } from "@/lib/account";
import { getBanking } from "@/lib/banking";
import { getKyc } from "@/lib/kyc";
import BankShell from "@/components/banco/BankShell";
import PainelInicio from "@/components/banco/PainelInicio";
import PainelPix from "@/components/banco/PainelPix";
import PainelCartoes from "@/components/banco/PainelCartoes";
import PainelExtrato from "@/components/banco/PainelExtrato";
import PainelPerfil from "@/components/banco/PainelPerfil";
import PainelConfig from "@/components/banco/PainelConfig";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Conta bancária",
};

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[partes.length - 1]?.[0] ?? "")).toUpperCase() || "?";
}

export default async function BancoPage() {
  const { supabase, user, profile } = await requireSession();
  const bank = getBanking(supabase);

  await bank.ensureAccount();
  await bank.ensureCard();

  const [
    account,
    card,
    chaves,
    extrato,
    boletos,
    resumo,
    depositos,
    saques,
    recargas,
    agendamentos,
    dda,
    cobrancas,
    comprovantes,
    dados,
    limites,
    kyc,
  ] = await Promise.all([
    bank.getAccount(),
    bank.getCard(),
    bank.getPixKeys(),
    bank.getStatement(40),
    bank.getBoletos(10),
    bank.getSummary(),
    bank.getDeposits(10),
    bank.getWithdrawals(10),
    bank.getTopups(10),
    bank.getSchedules(20),
    bank.getDda(),
    bank.getPixCharges(10),
    bank.getReceipts(10),
    bank.getProfile(),
    bank.getLimits(),
    getKyc(supabase).meuStatus(),
  ]);

  const kycStatus = kyc.ok ? kyc.data.status : "nao_iniciado";

  if (!account) {
    return (
      <div className="card">
        <div className="alert alert-warn">
          Não foi possível abrir sua conta agora. Tente novamente em alguns instantes ou fale com o
          atendimento.
        </div>
      </div>
    );
  }

  const nome = profile?.full_name ?? "Cliente";
  const mes = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <BankShell
      nome={nome}
      inicial={iniciais(nome)}
      agencia={account.agency}
      conta={`${account.number}-${account.checkDigit}`}
      status={account.status === "ativa" ? "Ativa" : account.status}
      saldo={account.available}
      painel={{
        inicio: (
          <PainelInicio
            resumo={resumo}
            extrato={extrato.slice(0, 6)}
            nome={nome}
            mes={mes}
            kycStatus={kycStatus}
          />
        ),
        pix: <PainelPix chaves={chaves} cobrancas={cobrancas} disponivel={account.available} />,
        cartoes: (
          <PainelCartoes
            card={card}
            conta={account}
            nome={nome}
            limite={account.available}
          />
        ),
        extrato: (
          <PainelExtrato
            extrato={extrato}
            depositos={depositos}
            saques={saques}
            recargas={recargas}
            boletos={boletos}
            comprovantes={comprovantes}
          />
        ),
        perfil: (
          <PainelPerfil
            nome={nome}
            email={user.email ?? ""}
            cpf={profile?.cpf ?? ""}
            conta={account}
            card={card}
            dados={dados}
            agendamentos={agendamentos}
            dda={dda}
          />
        ),
        config: <PainelConfig limites={limites} conta={account} card={card} saques={saques} />,
      }}
    />
  );
}
