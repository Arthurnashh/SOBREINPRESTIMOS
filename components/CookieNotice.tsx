"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const COOKIE = "site-cookie-notice";

export default function CookieNotice() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setOpen(!document.cookie.split("; ").includes(`${COOKIE}=v1`));
    setReady(true);
  }, []);

  function acknowledge() {
    document.cookie = `${COOKIE}=v1; Path=/; Max-Age=15552000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setOpen(false);
  }

  if (!ready) return null;
  if (!open) return <button className="cookie-toggle" onClick={() => setOpen(true)} aria-label="Abrir informações de cookies">Cookies</button>;
  return (
    <section className="cookie-notice" aria-labelledby="cookie-title">
      <div>
        <h2 id="cookie-title">Seus dados e cookies</h2>
        <p>Usamos apenas cookies necessários para autenticação e para lembrar este aviso.
          Não utilizamos cookies de publicidade ou análise de navegação.</p>
      </div>
      <div className="cookie-actions">
        <Link href="/privacidade#cookies" className="btn btn-ghost">Ver detalhes</Link>
        <button className="btn btn-primary" onClick={acknowledge}>Continuar só com necessários</button>
      </div>
    </section>
  );
}
