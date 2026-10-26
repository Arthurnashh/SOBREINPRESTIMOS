import type { Metadata } from "next";
import { COMPANY } from "@/lib/config";
import CookieNotice from "@/components/CookieNotice";
import "./globals.css";

export const metadata: Metadata = {
  title: `${COMPANY.name} — Empréstimo pessoal sem taxa antecipada`,
  description:
    "Simule empréstimos de R$ 1.000 a R$ 20.000 com custo total transparente, conta digital com PIX, cartão virtual e pagamento de boletos. Nenhum pagamento antecipado para liberar o crédito.",
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
        {children}
        <CookieNotice />
      </body>
    </html>
  );
}
