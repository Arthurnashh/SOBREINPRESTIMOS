import Link from "next/link";
import MenuMobile from "./MenuMobile";
import { COMPANY } from "@/lib/config";

export function Logo() {
  return (
    <Link href="/" className="logo" aria-label={COMPANY.name}>
      <span className="logo-mark" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" role="presentation">
          <rect x="3.5" y="14" width="3.2" height="6" rx="1" fill="#e9eff7" />
          <rect x="9" y="10.5" width="3.2" height="9.5" rx="1" fill="#9fc0e4" />
          <rect x="14.5" y="7" width="3.2" height="13" rx="1" fill="#ffffff" />
          <path
            d="M5 10.5 11 7l4-2.5 1.8-1"
            stroke="#9fc0e4"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="logo-word">
        Sobre<span>Impréstimos</span>
      </span>
    </Link>
  );
}

export default function Header() {
  return (
    <header className="header">
      <div className="wrap">
        <Logo />
        <nav className="nav" aria-label="Navegação principal">
          <div className="nav-links">
            <Link href="/#como-funciona" className="nav-link">
              Como funciona
            </Link>
            <Link href="/#conta-digital" className="nav-link">
              Conta digital
            </Link>
            <Link href="/#duvidas" className="nav-link">
              Dúvidas
            </Link>
          </div>
          <span className="nav-sep" aria-hidden />
          <Link href="/entrar" className="btn btn-ghost">
            Entrar
          </Link>
          <Link href="/cadastro" className="btn btn-primary">
            Abrir conta
          </Link>

          <MenuMobile />
        </nav>
      </div>
    </header>
  );
}
