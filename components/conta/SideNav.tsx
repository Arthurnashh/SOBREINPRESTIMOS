"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import {
  IconeCartao,
  IconeConfig,
  IconeEscudo,
  IconeExtrato,
  IconeInicio,
  IconeReceber,
  IconeSair,
} from "@/components/Icones";

type Item = {
  href: string;
  label: string;
  Icone: (p: { size?: number }) => React.ReactElement;
};

const ITENS: Item[] = [
  { href: "/conta", label: "Início", Icone: IconeInicio },
  { href: "/conta/banco", label: "Conta bancária", Icone: IconeCartao },
  { href: "/conta/emprestimos", label: "Meus empréstimos", Icone: IconeExtrato },
  { href: "/conta/verificacao", label: "Minha verificação", Icone: IconeEscudo },
  { href: "/conta/emprestimo", label: "Pedir empréstimo", Icone: IconeReceber },
];

const TRAVADO: Item[] = [{ href: "/conta/verificacao", label: "Minha verificação", Icone: IconeEscudo }];

/** Menu lateral da conta: destaca a página atual e mostra só o que está liberado. */
export default function SideNav({
  admin = false,
  travado = false,
}: {
  admin?: boolean;
  travado?: boolean;
}) {
  const pathname = usePathname() ?? "/conta";
  const itens = travado ? TRAVADO : ITENS;

  return (
    <nav className="side" aria-label="Conta">
      {itens.map(({ href, label, Icone }) => {
        const ativo = href === "/conta" ? pathname === "/conta" : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={ativo ? "ativo" : undefined}
            aria-current={ativo ? "page" : undefined}
          >
            <Icone size={18} />
            {label}
          </Link>
        );
      })}
      {!travado && admin ? (
        <Link href="/admin" className={pathname.startsWith("/admin") ? "ativo" : undefined}>
          <IconeConfig size={18} />
          Administração
        </Link>
      ) : null}
      <form action={signOut}>
        <button className="link-btn">
          <IconeSair size={17} />
          Sair
        </button>
      </form>
    </nav>
  );
}
