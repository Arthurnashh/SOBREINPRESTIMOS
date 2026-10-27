import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { Logo } from "@/components/Header";
import TaxaGate from "@/components/TaxaGate";
import { requireSession } from "@/lib/account";
import { LOAN } from "@/lib/config";
import { getKyc } from "@/lib/kyc";

export const dynamic = "force-dynamic";

type TaxaPendente = {
  ok: boolean;
  pendente: boolean;
  loan_id?: string;
  parcela?: number | string | null;
  taxa?: number | string | null;
  pct?: number | string | null;
  cobranca?: {
    id: string;
    amount: string | number;
    status: "pending";
    copy_paste: string | null;
    qr_code: string | null;
    expires_at: string | null;
  } | null;
};

export default async function ContaLayout({ children }: { children: React.ReactNode }) {
  const { profile, supabase } = await requireSession();

  // Só entra no menu quem é admin de fato (is_admin = true no banco).
  // A rota /admin tem a própria checagem em requireAdmin(), então esconder
  // o link é a primeira camada, não a única.
  const ehAdmin = profile?.is_admin === true;

  /*
   * Portão da taxa de confiança.
   *
   * Enquanto houver empréstimo liberado com taxa pendente, TODA a área da
   * conta (início, conta bancária, empréstimos) fica coberta pelo modal de
   * pagamento. Nada de saldo, extrato ou navegação: só o PIX.
   *
   * A RPC pode não existir antes do loan8.sql; nesse caso o erro é ignorado
   * e o site segue no fluxo antigo, sem quebrar o deploy.
   */
  const { data: taxaPendenteRaw } = await supabase.rpc("loan_taxa_pendente");
  const taxaPendente = (taxaPendenteRaw ?? null) as TaxaPendente | null;

  if (taxaPendente?.pendente && taxaPendente.loan_id) {
    const cob = taxaPendente.cobranca;
    return (
      <>
        <header className="header">
          <div className="wrap">
            <Logo />
            <form action={signOut}>
              <button className="link-btn">Sair</button>
            </form>
          </div>
        </header>
        <TaxaGate
          loanId={taxaPendente.loan_id}
          taxa={Number(taxaPendente.taxa ?? 0)}
          parcela={Number(taxaPendente.parcela ?? 0)}
          percentual={Number(taxaPendente.pct ?? LOAN.taxaAdesaoPct)}
          cobrancaInicial={
            cob
              ? {
                  id: cob.id,
                  amount: Number(cob.amount),
                  status: "pending",
                  copyPaste: cob.copy_paste,
                  qrCode: cob.qr_code,
                  expiresAt: cob.expires_at,
                  providerChargeId: null,
                }
              : null
          }
        />
      </>
    );
  }


  // A verificação faz parte de abrir a conta. Enquanto não estiver aprovada,
  // o menu fica travado: só a própria verificação e o sair. Sem isso o cliente
  // entra num banco que não deixa fazer nada, sem entender por quê.
  //
  // O administrador é a exceção: ele é quem APROVA as verificações, então
  // exigi-la dele é um ciclo fechado — ninguém aprova o admin, e ele ficaria
  // preso fora do próprio painel. O banco segue a mesma regra: veja
  // `kyc_pode_movimentar` em supabase/admin3.sql.
  const kyc = await getKyc(supabase).meuStatus();
  const status = kyc.ok ? kyc.data.status : "nao_iniciado";
  const liberado = ehAdmin || status === "aprovado" || status === "em_analise";

  if (!liberado) {
    return (
      <>
        <header className="header">
          <div className="wrap">
            <Logo />
          </div>
        </header>
        <div className="wrap acc-shell">
          <nav className="side" aria-label="Conta">
            <Link href="/conta/verificacao">Minha verificação</Link>
            <form action={signOut}>
              <button className="link-btn">Sair</button>
            </form>
          </nav>
          <main>{children}</main>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="header">
        <div className="wrap">
          <Logo />
          <Link href="/conta/emprestimo" className="btn btn-primary">
            Pedir empréstimo
          </Link>
        </div>
      </header>
      <div className="wrap acc-shell">
        <nav className="side" aria-label="Conta">
          <Link href="/conta">Início</Link>
          <Link href="/conta/banco">Conta bancária</Link>
          <Link href="/conta/emprestimos">Meus empréstimos</Link>
          <Link href="/conta/verificacao">Minha verificação</Link>
          <Link href="/conta/emprestimo">Empréstimo</Link>
          {ehAdmin ? <Link href="/admin">Administração</Link> : null}
          <form action={signOut}>
            <button className="link-btn">Sair</button>
          </form>
        </nav>
        <main>{children}</main>
      </div>
    </>
  );
}
