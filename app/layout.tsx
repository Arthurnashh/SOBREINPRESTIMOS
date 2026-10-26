import type { Metadata } from "next";
import { COMPANY } from "@/lib/config";
import { getBanking } from "@/lib/banking";
import CookieNotice from "@/components/CookieNotice";
import "./globals.css";

export const metadata: Metadata = {
  title: `${COMPANY.name} — Empréstimo pessoal sem taxa antecipada`,
  description:
    "Simule empréstimos de R$ 1.000 a R$ 10.000 com custo total transparente. Nenhum pagamento antecipado para liberar o crédito.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500..700;1,9..144,500..700&family=Manrope:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body>
        {getBanking().isDemo && <div className="demo-notice" role="note">
          <strong>Ambiente de demonstração.</strong> Conta, saldo, cartão e PIX são fictícios. Não há pagamentos ou liberação de crédito reais.
        </div>}
        {children}
        <CookieNotice />
      </body>
    </html>
  );
}
