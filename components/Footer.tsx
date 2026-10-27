import { COMPANY, LOAN, cnpjValido } from "@/lib/config";
import { brl, pct } from "@/lib/format";
import { Logo } from "./Header";
import Link from "next/link";

export default function Footer() {
  const temCnpj = cnpjValido(COMPANY.cnpj);
  const temParceira = COMPANY.partner.trim().length > 0;

  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <Logo />
            <p style={{ marginTop: 16 }}>
              {COMPANY.name}
              {temCnpj ? ` · CNPJ ${COMPANY.cnpj}` : ""}
            </p>
            <p>Crédito pessoal com custo total na tela e conta digital integrada.</p>
            <nav className="footer-links" aria-label="Informações legais">
              <Link href="/termos">Termos de Uso</Link>
              <Link href="/privacidade">Política de Privacidade</Link>
            </nav>
          </div>

          <div>
            <h3>Transparência</h3>
            <p>
              {temParceira
                ? `${COMPANY.name} atua como correspondente no país de ${COMPANY.partner}, responsável pela concessão do crédito e pela conta de pagamento. Consulte os dados da instituição no contrato.`
                : `${COMPANY.name} atua na originação e no atendimento das solicitações de crédito. A concessão é feita pela instituição financeira parceira, identificada no contrato antes da contratação.`}
            </p>
            <p>
              Empréstimos de {brl(LOAN.min)} a {brl(LOAN.max)}, em 6 a 24 parcelas. Taxa a partir de{" "}
              {pct(LOAN.monthlyRate)} ao mês. Crédito sujeito a análise. Exemplo e CET exibidos na
              simulação antes da contratação.
            </p>
          </div>

          <div>
            <h3>Segurança</h3>
            <p>
              <strong style={{ color: "#eaf0f7" }}>
                Nunca cobramos qualquer valor antecipado para liberar empréstimo.
              </strong>{" "}
              Se alguém pedir depósito, PIX ou boleto em nosso nome para liberar crédito, é golpe.
            </p>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} {COMPANY.name}. Todos os direitos reservados.</span>
          <span>Feito para decisões financeiras sem letra miúda.</span>
        </div>
      </div>
    </footer>
  );
}
