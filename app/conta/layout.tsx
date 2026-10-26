import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { Logo } from "@/components/Header";
import { requireSession } from "@/lib/account";

export const dynamic = "force-dynamic";

export default async function ContaLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireSession();

  // Só entra no menu quem é admin de fato (is_admin = true no banco).
  // A rota /admin tem a própria checagem em requireAdmin(), então esconder
  // o link é a primeira camada, não a única.
  const ehAdmin = profile?.is_admin === true;

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
