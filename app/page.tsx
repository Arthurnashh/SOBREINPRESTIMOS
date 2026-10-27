import Footer from "@/components/Footer";
import Header from "@/components/Header";
import Simulator from "@/components/Simulator";
import { LOAN } from "@/lib/config";
import { brl } from "@/lib/format";

// Padrão decorativo (não é um QR code válido): três localizadores + módulos.
const QR = [
  "11111011111",
  "10001010001",
  "10101010101",
  "10001010001",
  "11111011111",
  "01010101010",
  "11111010101",
  "10001011001",
  "10101010101",
  "10001101010",
  "11111010101",
];

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

function Icone({ d }: { d: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <div className="wrap">
            <div className="hero-panel">
              <div className="hero-grid">
                <div>
                  <span className="hero-badge">
                    <i aria-hidden>✓</i>
                    Crédito pessoal 100% online
                  </span>
                  <h1>
                    Crédito claro, <em>do pedido à conta</em>.
                  </h1>
                  <p className="lead">
                    Simule de {brl(LOAN.min)} a {brl(LOAN.max)}, veja o custo total antes de pedir
                    e receba direto na sua conta digital, com PIX e cartão virtual.
                  </p>

                  <div className="hero-actions">
                    <a href="#simular" className="btn btn-accent">
                      Simular meu empréstimo
                    </a>
                    <a href="#como-funciona" className="btn btn-ghost" style={{ color: "#eaf0f7", borderColor: "rgba(255,255,255,.22)", background: "rgba(255,255,255,.05)" }}>
                      Ver como funciona
                    </a>
                  </div>

                  <ul className="checks">
                    <li>Zero taxa antecipada: você só paga as parcelas, depois de receber.</li>
                    <li>CET e valor total exibidos antes de qualquer contratação.</li>
                    <li>Condições apresentadas antes de qualquer contratação.</li>
                    <li>
                      Conta digital com PIX, transferências, cartão virtual e pagamento de boletos.
                    </li>
                  </ul>

                  <div className="hero-metrics">
                    <div>
                      <strong>{brl(LOAN.min)}–{brl(LOAN.max)}</strong>
                      <span>valor disponível</span>
                    </div>
                    <div>
                      <strong>6 a 24x</strong>
                      <span>prazos flexíveis</span>
                    </div>
                    <div>
                      <strong>R$ 0,00</strong>
                      <span>taxa antecipada</span>
                    </div>
                  </div>
                </div>

                <div id="simular">
                  <Simulator mode="landing" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="wrap" aria-label="Compromissos">
          <div className="trust">
            <span>
              <Icone d="M12 3 4 6.5v5c0 4.5 3.2 8.3 8 9.5 4.8-1.2 8-5 8-9.5v-5L12 3Z" />
              Dados protegidos e criptografados
            </span>
            <span>
              <Icone d="M5 11V8a7 7 0 0 1 14 0v3M5 11h14v10H5V11Z" />
              Nenhum pagamento antecipado
            </span>
            <span>
              <Icone d="M12 8v4l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
              Análise acompanhada na sua conta
            </span>
          </div>
        </section>

        <section className="section" id="conta-digital">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">Conta digital integrada</span>
              <h2>O empréstimo cai onde você já move o dinheiro.</h2>
              <p>
                Conta de pagamento com saldo real, extrato, PIX, boletos e cartão virtual. Tudo no
                mesmo lugar, sem trocar de aplicativo.
              </p>
            </div>

            <div className="bento">
              <article className="bento-card bento-dark bento-6">
                <span className="glow" aria-hidden />
                <div className="feature-icon">
                  <Icone d="M4 10h16M4 10v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9M6 10V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3" />
                </div>
                <span className="feature-kicker">Conta e saldo</span>
                <h3>O valor aprovado entra na sua conta</h3>
                <p>
                  Saldo, entradas e saídas do mês, últimas movimentações e comprovantes de cada
                  operação. Sem saldo fictício: tudo passa pelo extrato.
                </p>
                <ul className="checks" style={{ marginTop: 8 }}>
                  <li>Extrato com comprovante por operação</li>
                  <li>Limites por PIX, transferência e saque</li>
                  <li>Agendamentos executados automaticamente</li>
                </ul>

                <div className="cartao-3d" aria-hidden>
                  <div className="cartao-3d-inner">
                    <div className="cartao-3d-face">
                      <div className="cartao-3d-topo">
                        <span className="cartao-3d-marca">
                          Sobre<span>Impréstimos</span>
                        </span>
                        <span className="cartao-3d-sinal">
                          <i />
                          <i />
                          <i />
                        </span>
                      </div>
                      <span className="cartao-3d-chip" />
                      <div className="cartao-3d-numero">•••• •••• •••• 4821</div>
                      <div className="cartao-3d-rodape">
                        <span>
                          <i>Titular</i>SEU NOME
                        </span>
                        <span>
                          <i>Validade</i>12/30
                        </span>
                      </div>
                    </div>
                    <div className="cartao-3d-brilho" />
                  </div>
                </div>
              </article>

              <article className="bento-card bento-6">
                <div className="feature-icon">
                  <Icone d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
                </div>
                <span className="feature-kicker">Área PIX</span>
                <h3>PIX em segundos, para enviar e receber</h3>
                <p>
                  Cobrança com QR Code, transferência, depósito, saque e pagamento de boleto. Tudo
                  com confirmação na tela e comprovante na hora.
                </p>

                <div className="pix-3d" aria-hidden>
                  <div className="pix-3d-inner">
                    <span className="pix-3d-tag">PIX</span>
                    <div className="pix-3d-qr">
                      {QR.flatMap((linha, y) =>
                        [...linha].map((bit, x) => (
                          <i key={`${y}-${x}`} className={bit === "1" ? "on" : ""} />
                        )),
                      )}
                    </div>
                    <span className="pix-3d-legenda">Escaneie para pagar</span>
                  </div>
                </div>
              </article>

              <article className="bento-card bento-4">
                <div className="feature-icon">
                  <Icone d="M3 7h18v11H3V7Zm0 4h18M7 15h4" />
                </div>
                <span className="feature-kicker">Cartões</span>
                <h3>Cartão virtual com bloqueio imediato</h3>
                <p>Ative, bloqueie e desbloqueie quando quiser. O CVV não fica armazenado.</p>
              </article>

              <article className="bento-card bento-4">
                <div className="feature-icon">
                  <Icone d="M4 19V5m0 10 5-5 4 3 6-7" />
                </div>
                <span className="feature-kicker">Controle</span>
                <h3>Custo total antes de decidir</h3>
                <p>Parcela, juros, IOF e CET aparecem na simulação e no contrato.</p>
              </article>

              <article className="bento-card bento-4">
                <div className="feature-icon">
                  <Icone d="M12 3 4 6.5v5c0 4.5 3.2 8.3 8 9.5 4.8-1.2 8-5 8-9.5v-5L12 3Z" />
                </div>
                <span className="feature-kicker">Segurança</span>
                <h3>Você no controle da sua conta</h3>
                <p>Verificação de identidade, limites configuráveis e nenhuma cobrança antecipada.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="section section-soft" id="como-funciona">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">Como funciona</span>
              <h2>Três passos, nenhuma surpresa.</h2>
              <p>
                Você acompanha cada etapa dentro da conta. As condições definitivas só aparecem
                depois da análise — e antes de qualquer assinatura.
              </p>
            </div>

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

        <section className="section" id="duvidas">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">Dúvidas frequentes</span>
              <h2>O que você precisa saber antes de pedir.</h2>
            </div>

            <div className="faq">
              {FAQ.map((item) => (
                <details key={item.q}>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="wrap" style={{ paddingBottom: 8 }}>
          <div className="cta-panel">
            <div>
              <h2>Pronto para ver o custo real do seu crédito?</h2>
              <p>
                Leva menos de dois minutos. Você simula, compara e só decide depois de ver parcela,
                IOF e CET.
              </p>
            </div>
            <div className="cta-actions">
              <a href="/cadastro" className="btn btn-accent">
                Abrir minha conta
              </a>
              <a href="/entrar" className="btn btn-ghost" style={{ color: "#eaf0f7", borderColor: "rgba(255,255,255,.2)", background: "rgba(255,255,255,.05)" }}>
                Já tenho conta
              </a>
            </div>

            <div className="selo-3d" aria-hidden>
              <div className="selo-3d-inner">
                <span className="selo-3d-topo">Taxa</span>
                <strong>0%</strong>
                <span className="selo-3d-base">antecipada</span>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
