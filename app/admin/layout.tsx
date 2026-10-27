import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { Logo } from "@/components/Header";
import { requireAdmin } from "@/lib/account";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <header className="header">
        <div className="wrap">
          <Logo />
          <nav className="nav">
            <span className="badge b-aprovado">Administrador</span>
            <Link href="/conta" className="btn btn-ghost">
              Ver como cliente
            </Link>
            <form action={signOut}>
              <button className="link-btn" style={{ color: "var(--ink-2)" }}>
                Sair
              </button>
            </form>
          </nav>
        </div>
      </header>
      <div className="wrap" style={{ padding: "32px 20px 64px" }}>
        <nav className="nav admin-tabs" aria-label="Administração">
          <Link href="/admin" className="btn btn-ghost">Pedidos de empréstimo</Link>
          <Link href="/admin/contas" className="btn btn-ghost">Contas</Link>
          <Link href="/admin/kyc" className="btn btn-ghost">Verificações</Link>
          <Link href="/admin/usuarios" className="btn btn-ghost">Usuários cadastrados</Link>
        </nav>
        {children}
      </div>
    </>
  );
}
