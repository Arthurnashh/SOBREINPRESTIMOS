import Footer from "@/components/Footer";
import Header from "@/components/Header";
import Simulator from "@/components/Simulator";

const FAQ = [
  {
    q: "Preciso pagar alguma taxa para liberar o empréstimo?",
    a: "Não. Nenhum valor é cobrado antes da liberação. O IOF e os juros já estão incluídos nas parcelas mostradas na simulação. Se alguém pedir pagamento antecipado em nosso nome, não pague: é golpe.",
  },
  {
    q: "Quem empresta o dinheiro?",
    a: "O crédito é concedido por instituição financeira parceira identificada no contrato, autorizada a operar no país. As condições completas são apresentadas antes da contratação.",
  },
  {
    q: "Quanto tempo leva a análise?",
    a: "Você acompanha o status na sua conta. A análise considera os dados do seu cadastro e as políticas de crédito da instituição responsável. Assim que aprovado, o valor é creditado na sua conta.",
  },
  {
    q: "Posso desistir depois de contratar?",
    a: "Sim. Os procedimentos e prazos aplicáveis constam no contrato e são informados pela instituição responsável antes da contratação.",
  },
  {
    q: "Para que serve a conta digital?",
    a: "O valor aprovado cai na sua conta de pagamento, aberta pela instituição parceira. Por ela você faz PIX, transferências e usa o cartão virtual.",
  },
];

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <div className="wrap hero-grid">
            <div>
              <span className="eyebrow">Empréstimo pessoal online</span>
              <h1>
                Crédito claro, <em>sem pagar nada</em> para liberar.
              </h1>
              <p className="lead">
                Simule de R$ 1.000 a R$ 20.000, veja o custo total antes de pedir e receba direto
                na sua conta digital, com PIX e cartão virtual.
              </p>
              <ul className="checks">
                <li>Zero taxa antecipada: você só paga as parcelas, depois de receber.</li>
                <li>CET e valor total exibidos antes de qualquer contratação.</li>
                <li>Condições apresentadas antes de qualquer contratação.</li>
                <li>Conta digital com PIX, transferências, cartão virtual e pagamento de boletos.</li>
              </ul>
            </div>
            <Simulator mode="landing" />
          </div>
        </section>

        <section className="wrap" aria-hidden style={{ paddingBottom: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/banner.svg"
            alt=""
            style={{ width: "100%", height: "auto", borderRadius: 20, display: "block" }}
          />
        </section>

        <section className="section">
          <div className="wrap">
            <h2>Como funciona</h2>
            <div className="steps">
              <div className="step">
                <h3>Simule e cadastre-se</h3>
                <p>Escolha valor e prazo, crie sua conta com CPF e e-mail em poucos minutos.</p>
              </div>
              <div className="step">
                <h3>Análise e contrato</h3>
                <p>
                  A instituição parceira avalia o pedido e você recebe as condições definitivas
                  para assinar.
                </p>
              </div>
              <div className="step">
                <h3>Dinheiro na conta</h3>
                <p>
                  O valor integral cai na sua conta digital. Use com PIX, transferência, cartão
                  virtual ou para pagar boletos.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap faq">
            <h2>Perguntas frequentes</h2>
            {FAQ.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
