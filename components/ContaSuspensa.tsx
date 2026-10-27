import { signOut } from "@/app/actions/auth";
import { COMPANY } from "@/lib/config";
import { Logo } from "./Header";

/**
 * Tela de conta suspensa.
 *
 * Aparece quando o administrador desativa a conta (`bank_accounts.status =
 * 'encerrada'`). O cliente CONTINUA autenticado — este caminho não apaga nada,
 * então é reversível: reativar devolve o acesso normal.
 *
 * O texto evita dizer "você foi banido" ou detalhar o motivo interno. Fala de
 * suspensão e de canal de contato, que é o que o cliente precisa para agir.
 */
export default function ContaSuspensa() {
  const contato = COMPANY.privacyEmail;

  return (
    <>
      <header className="header">
        <div className="wrap">
          <Logo />
          <form action={signOut}>
            <button className="link-btn">Sair</button>
          </form>
        </div>
      </header>

      <main className="wrap suspensa-wrap">
        <section className="card suspensa-card" aria-labelledby="suspensa-titulo">
          <span className="suspensa-icone" aria-hidden>
            !
          </span>

          <h1 id="suspensa-titulo">Conta suspensa</h1>

          <p className="muted">
            O acesso à sua conta está temporariamente suspenso. Seus dados e seu histórico
            continuam guardados — nada foi apagado.
          </p>

          <div className="alert alert-warn" role="status">
            <strong>O que isso significa:</strong> você não consegue movimentar saldo, contratar
            empréstimo nem usar o PIX enquanto a suspensão estiver ativa.
          </div>

          <h2>Como resolver</h2>
          <p className="muted">
            Entre em contato com o atendimento para entender o motivo e regularizar a situação. A
            suspensão é reversível: assim que for liberada, sua conta volta a funcionar normalmente.
          </p>

          {contato ? (
            <p>
              <a className="btn btn-primary" href={`mailto:${contato}`}>
                Falar com o atendimento
              </a>
            </p>
          ) : (
            <p className="fine">
              Use o canal de atendimento pelo qual você falou com a gente. Se você é o responsável
              pelo sistema, configure <code>NEXT_PUBLIC_PRIVACIDADE_EMAIL</code> para exibir o
              contato aqui.
            </p>
          )}

          <p className="fine" style={{ marginTop: 18 }}>
            {COMPANY.name} · se você acredita que houve engano, fale com o atendimento citando o
            e-mail da sua conta.
          </p>
        </section>
      </main>
    </>
  );
}
