import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { Logo } from "@/components/Header";
import { requireSession } from "@/lib/account";

export const dynamic = "force-dynamic";

export default async function ContaLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireSession();
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
          <Link href="/conta/emprestimo">Empréstimo</Link>
          <Link href="/conta/pix">PIX</Link>
          <Link href="/conta/cartao">Cartão</Link>
          {profile?.is_admin && <Link href="/admin">Administração</Link>}
          <form action={signOut}>
            <button className="link-btn">Sair</button>
          </form>
        </nav>
        <main>{children}</main>
      </div>
    </>
  );
}
