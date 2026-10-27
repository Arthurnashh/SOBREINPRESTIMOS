import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import AdminTabs from "@/components/admin/AdminTabs";
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
            <span className="badge b-aprovado admin-selo">Administrador</span>
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
      <div className="wrap admin-main">
        <AdminTabs />
        {children}
      </div>
    </>
  );
}
