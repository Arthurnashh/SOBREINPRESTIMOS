import Header from "./Header";
import { COMPANY, LOAN } from "@/lib/config";
import { brl } from "@/lib/format";

/**
 * Moldura das telas de autenticação: painel de marca à esquerda e formulário
 * à direita. Em telas estreitas o painel some e o formulário ocupa a largura.
 */
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="auth">
        <div className="auth-grid">
          <aside className="auth-aside" aria-label="Sobre a conta">
            <div>
              <span className="hero-badge">
                <i aria-hidden>✓</i>
                Ambiente seguro
              </span>
              <h2>
                Crédito claro e conta digital, <em>sem taxa antecipada</em>.
              </h2>
              <p className="lead">
                Simule de {brl(LOAN.min)} a {brl(LOAN.max)} e acompanhe cada etapa dentro da sua
                conta.
              </p>
              <ul className="checks">
                <li>Parcela, IOF e CET antes de contratar.</li>
                <li>PIX, cartão virtual e boletos na mesma conta.</li>
                <li>Seus dados protegidos e nenhuma cobrança para liberar.</li>
              </ul>
            </div>
            <div className="auth-aside-foot">
              <strong>{COMPANY.name}</strong>
              <span>Crédito sujeito a análise. Condições no contrato.</span>
            </div>
          </aside>

          <div className="auth-form">{children}</div>
        </div>
      </main>
    </>
  );
}
