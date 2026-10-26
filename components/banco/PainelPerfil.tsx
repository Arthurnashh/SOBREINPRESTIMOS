import FormDadosCadastrais from "./FormDadosCadastrais";
import { brl, date } from "@/lib/format";
import type { Account, BankProfile, Card, DdaBoleto, Schedule } from "@/lib/banking";

const TIPO_AGENDAMENTO: Record<string, string> = {
  pix: "PIX",
  transferencia: "Transferência",
  boleto: "Boleto",
};

const ROTULO_STATUS: Record<Schedule["status"], string> = {
  agendado: "Agendado",
  executado: "Executado",
  cancelado: "Cancelado",
  falhou: "Falhou",
};

/** Painel "Perfil": dados do titular, agendamentos e boletos no CPF. */
export default function PainelPerfil({
  nome,
  email,
  cpf,
  conta,
  card,
  dados,
  agendamentos,
  dda,
}: {
  nome: string;
  email: string;
  cpf: string;
  conta: Account;
  card: Card | null;
  dados: BankProfile | null;
  agendamentos: Schedule[];
  dda: DdaBoleto[];
}) {
  const abertos = dda.filter((d) => d.status === "aberto");

  return (
    <div className="stack" style={{ ["--gap" as string]: "16px" }}>
      <section className="bank-secao">
        <header>
          <h2>Meu perfil</h2>
        </header>
        <div className="bank-linha">
          <div>
            <div className="quem">Nome</div>
            <div className="quando">Titular da conta</div>
          </div>
          <span className="valor">{nome}</span>
        </div>
        <div className="bank-linha">
          <div>
            <div className="quem">E-mail</div>
            <div className="quando">Usado para entrar na conta</div>
          </div>
          <span className="valor">{email}</span>
        </div>
        <div className="bank-linha">
          <div>
            <div className="quem">CPF</div>
            <div className="quando">Titularidade</div>
          </div>
          <span className="valor">•••.•••.•••-{cpf.slice(-2)}</span>
        </div>
        <div className="bank-linha">
          <div>
            <div className="quem">Conta</div>
            <div className="quando">Agência e número</div>
          </div>
          <span className="valor">
            {conta.agency} / {conta.number}-{conta.checkDigit}
          </span>
        </div>
        <div className="bank-linha">
          <div>
            <div className="quem">Cartão</div>
            <div className="quando">Virtual, débito na conta</div>
          </div>
          <span className="valor">{card ? `•••• ${card.last4}` : "em emissão"}</span>
        </div>
        <div className="bank-linha">
          <div>
            <div className="quem">Saldo disponível</div>
            <div className="quando">Atualizado agora</div>
          </div>
          <span className="valor">{brl(conta.available)}</span>
        </div>
      </section>

      {agendamentos.length > 0 && (
        <section className="bank-secao">
          <header>
            <h2>Meus agendamentos</h2>
          </header>
          {agendamentos.map((a) => (
            <div className="bank-linha" key={a.id}>
              <div>
                <div className="quem">
                  {brl(a.amount)} · {TIPO_AGENDAMENTO[a.kind] ?? a.kind}
                </div>
                <div className="quando">
                  {a.target} · {date(`${a.runsOn}T12:00:00`)}
                </div>
              </div>
              <span className={`bank-chip ${a.status === "executado" ? "ok" : a.status === "falhou" ? "erro" : "alerta"}`}>
                {ROTULO_STATUS[a.status]}
              </span>
            </div>
          ))}
        </section>
      )}

      {abertos.length > 0 && (
        <section className="bank-secao">
          <header>
            <h2>Boletos no seu CPF</h2>
            <span className="bank-chip alerta">{abertos.length} em aberto</span>
          </header>
          {abertos.map((d) => (
            <div className="bank-linha" key={d.id}>
              <div>
                <div className="quem">{brl(d.amount)}</div>
                <div className="quando">
                  {d.beneficiary} · vence {date(`${d.dueDate}T12:00:00`)}
                </div>
              </div>
              <span className="bank-chip">Aberto</span>
            </div>
          ))}
          <p className="fine">Pague seus boletos na aba Área PIX, em &ldquo;Pagar boleto&rdquo;.</p>
        </section>
      )}

      <section className="bank-secao">
        <header>
          <h2>Dados cadastrais</h2>
        </header>
        <p className="fine">
          Mantenha endereço e renda em dia — é o que sustenta seus limites e a análise de crédito.
        </p>
        <FormDadosCadastrais dados={dados} />
      </section>
    </div>
  );
}
