import Link from "next/link";
import { COMPANY } from "@/lib/config";

export function Logo() {
  return (
    <Link href="/" className="logo" aria-label={COMPANY.name}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt={COMPANY.name} height={40} width={200} className="logo-image" />
    </Link>
  );
}

export default function Header() {
  return (
    <header className="header">
      <div className="wrap">
        <Logo />
        <nav className="nav">
          <Link href="/entrar" className="btn btn-ghost">
            Entrar
          </Link>
          <Link href="/cadastro" className="btn btn-primary">
            Abrir conta
          </Link>
        </nav>
      </div>
    </header>
  );
}
