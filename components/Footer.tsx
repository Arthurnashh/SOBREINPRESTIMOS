import { COMPANY, LOAN } from "@/lib/config";
import { brl, pct } from "@/lib/format";
import { Logo } from "./Header";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-grid">
        <div>
          <Logo />
          <p style={{ marginTop: 12 }}>
            {COMPANY.name} · CNPJ {COMPANY.cnpj}
          </p>
          <nav className="footer-links" aria-label="Informações legais">
            <Link href="/termos">Termos de Uso</Link>
            <Link href="/privacidade">Política de Privacidade</Link>
          </nav>
        </div>
        <div>
          <p>
            {COMPANY.name} atua como correspondente no país de {COMPANY.partner}, responsável pela
            concessão do crédito e pela conta de pagamento. Consulte os dados da instituição no
            contrato.
          </p>
          <p>
            Empréstimos de {brl(LOAN.min)} a {brl(LOAN.max)}, em 6 a 24 parcelas. Taxa a partir de{" "}
            {pct(LOAN.monthlyRate)} ao mês. Crédito sujeito a análise. Exemplo e CET exibidos na
            simulação antes da contratação.
          </p>
          <p>
            <strong style={{ color: "#fff" }}>
              Nunca cobramos qualquer valor antecipado para liberar empréstimo.
            </strong>{" "}
            Se alguém pedir depósito, PIX ou boleto em nosso nome para liberar crédito, é golpe.
          </p>
        </div>
      </div>
    </footer>
  );
}
