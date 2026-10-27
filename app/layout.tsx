import type { Metadata, Viewport } from "next";
import { COMPANY } from "@/lib/config";
import CookieNotice from "@/components/CookieNotice";
import "./globals.css";
import "./banco.css";
import "./kyc.css";

export const metadata: Metadata = {
  title: `${COMPANY.name} — Empréstimo pessoal sem taxa antecipada`,
  description:
    "Simule empréstimos de R$ 500 a R$ 20.000 com custo total transparente, conta digital com PIX, cartão virtual e pagamento de boletos. Nenhum pagamento antecipado para liberar o crédito.",
};

/*
 * Sem esta declaração o celular assume uma página de desktop (~980px) e
 * encolhe tudo para caber — texto ilegível e botões difíceis de tocar.
 * É a base de toda a responsividade.
 *
 * `viewportFit: "cover"` deixa o conteúdo usar a área segura em aparelhos com
 * notch/ilha dinâmica. As margens de segurança são aplicadas no CSS, com
 * env(safe-area-inset-*).
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#071426",
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
          href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap"
        />
      </head>
      <body>
        {children}
        <CookieNotice />
      </body>
    </html>
  );
}
