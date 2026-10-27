"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Pedidos de empréstimo" },
  { href: "/admin/contas", label: "Contas" },
  { href: "/admin/kyc", label: "Verificações" },
  { href: "/admin/usuarios", label: "Usuários cadastrados" },
  { href: "/admin/config", label: "Gateway / Taxa" },
];

export default function AdminTabs() {
  const pathname = usePathname() ?? "/admin";

  return (
    <nav className="nav admin-tabs" aria-label="Administração">
      {TABS.map((tab) => {
        const ativo = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`btn ${ativo ? "btn-primary" : "btn-ghost"}`}
            aria-current={ativo ? "page" : undefined}
            style={{ height: 40, fontSize: 14 }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
