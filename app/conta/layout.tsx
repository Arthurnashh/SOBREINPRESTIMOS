import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { Logo } from "@/components/Header";
import { requireSession } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { getKyc } from "@/lib/kyc";

export const dynamic = "force-dynamic";

export default async function ContaLayout({ children }: { children: React.ReactNode }) {
  const { profile, supabase } = await requireSession();

  // Só entra no menu quem é admin de fato (is_admin = true no banco).
  // A rota /admin tem a própria checagem em requireAdmin(), então esconder
  // o link é a primeira camada, não a única.
  const ehAdmin = profile?.is_admin === true;

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
