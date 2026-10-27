"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/#como-funciona", label: "Como funciona" },
  { href: "/#conta-digital", label: "Conta digital" },
  { href: "/#duvidas", label: "Dúvidas" },
];

/** Menu compacto do cabeçalho em telas pequenas. Fecha ao navegar e com Esc. */
export default function MenuMobile() {
  const [aberto, setAberto] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setAberto(false);
  }, [pathname]);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  return (
    <div className="menu">
      <button
        type="button"
        className="menu-btn"
        aria-expanded={aberto}
        aria-controls="menu-mobile"
        aria-label={aberto ? "Fechar menu" : "Abrir menu"}
        onClick={() => setAberto((v) => !v)}
      >
        <span className="menu-icone" aria-hidden />
      </button>

      <div id="menu-mobile" className={`menu-painel${aberto ? " aberto" : ""}`} hidden={!aberto}>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} onClick={() => setAberto(false)}>
            {l.label}
          </Link>
        ))}
        <div className="menu-divisor" aria-hidden />
        <Link href="/entrar" onClick={() => setAberto(false)}>
          Entrar na conta
        </Link>
        <Link
          href="/cadastro"
          className="btn btn-primary menu-cta"
          onClick={() => setAberto(false)}
        >
          Abrir conta
        </Link>
      </div>
    </div>
  );
}
