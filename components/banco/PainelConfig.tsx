import FormLimites from "./FormLimites";
import { WITHDRAW_LABEL } from "@/lib/banking";
import type { Account, Card, Limits, Withdrawal } from "@/lib/banking";

const GRADE_SEGURANCA = [
  { titulo: "Ocultar saldo", texto: "Toque no olho ao lado do saldo para esconder o valor na tela." },
  { titulo: "Bloquear cartão", texto: "Bloqueio imediato na aba Meus cartões. Compras são recusadas." },
  { titulo: "Limites por operação", texto: "Defina teto por PIX, transferência e saque. Vale na próxima operação." },
  { titulo: "Sessão protegida", texto: "Sua conta exige login. Nunca compartilhe sua senha com ninguém." },
];

/** Painel "Configurações": limites, segurança e informações da conta. */
export default function PainelConfig({
  limites,
  conta,
  card,
  saques,
}: {
  limites: Limits | null;
  conta: Account;
  card: Card | null;
  saques: Withdrawal[];
}) {
  return (
    <div className="stack" style={{ ["--gap" as string]: "16px" }}>
      <section className="bank-secao">
        <header>
          <h2>Limites da conta</h2>
        </header>
        {limites ? (
          <FormLimites limites={limites} />
        ) : (
          <p className="fine">Não foi possível carregar seus limites. Recarregue a página.</p>
        )}
      </section>

      <section className="bank-secao">
        <header>
          <h2>Segurança</h2>
        </header>
        <p className="fine">
          Aviso importante: nós <strong>nunca</strong> pedimos depósito, PIX ou boleto para liberar
          empréstimo ou saldo. Se alguém pedir isso em nosso nome, é golpe — não pague e nos avise.
        </p>
        {GRADE_SEGURANCA.map((g) => (
          <div className="bank-linha" key={g.titulo}>
            <div>
              <div className="quem">{g.titulo}</div>
              <div className="quando">{g.texto}</div>
            </div>
          </div>
        ))}
      </section>

      <section className="bank-secao">
        <header>
          <h2>Dados da conta</h2>
        </header>
        <div className="bank-linha">
          <div>
            <div className="quem">Agência</div>
            <div className="quando">Identificação da conta</div>
          </div>
          <span className="valor">{conta.agency}</span>
        </div>
        <div className="bank-linha">
          <div>
            <div className="quem">Número da conta</div>
            <div className="quando">Com dígito verificador</div>
          </div>
          <span className="valor">
            {conta.number}-{conta.checkDigit}
          </span>
        </div>
        <div className="bank-linha">
          <div>
            <div className="quem">Situação</div>
            <div className="quando">Status da conta</div>
          </div>
          <span className={`bank-chip ${conta.status === "ativa" ? "ok" : "erro"}`}>{conta.status}</span>
        </div>
        <div className="bank-linha">
          <div>
            <div className="quem">Limite de crédito</div>
            <div className="quando">Além do saldo</div>
          </div>
          <span className="valor">{conta.overdraft > 0 ? `R$ ${conta.overdraft.toFixed(2)}` : "não contratado"}</span>
        </div>
        <div className="bank-linha">
          <div>
            <div className="quem">Cartão virtual</div>
            <div className="quando">{card ? `${card.brand} •••• ${card.last4}` : "em emissão"}</div>
          </div>
          <span className={`bank-chip ${card?.status === "ativo" ? "ok" : "erro"}`}>
            {card?.status ?? "—"}
          </span>
        </div>
      </section>

      {saques.length > 0 && (
        <section className="bank-secao">
          <header>
            <h2>Códigos de retirada</h2>
          </header>
          {saques.slice(0, 6).map((s) => (
            <div className="bank-linha" key={s.id}>
              <div>
                <div className="quem">{s.code}</div>
                <div className="quando">{WITHDRAW_LABEL[s.method]}</div>
              </div>
              <span className="valor">R$ {s.amount.toFixed(2)}</span>
            </div>
          ))}
        </section>
      )}

      <section className="bank-secao">
        <header>
          <h2>Tarifas</h2>
        </header>
        <p className="fine">
          Não cobramos tarifa de abertura, manutenção ou por PIX e transferências. O custo do crédito
          está nas parcelas, informado na simulação antes de contratar.
        </p>
      </section>
    </div>
  );
}
