import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import ContaSuspensa from "@/components/ContaSuspensa";
import { Logo } from "@/components/Header";
import SideNav from "@/components/conta/SideNav";
import TaxaConfirmada from "@/components/TaxaConfirmada";
import {
  getContaEstado,
  getTaxaConfirmada,
  getTaxaPendente,
  requireSession,
} from "@/lib/account";
import { LOAN } from "@/lib/config";
import { getKyc } from "@/lib/kyc";

export const dynamic = "force-dynamic";

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  return ((partes[0][0] ?? "") + (partes[partes.length - 1][0] ?? "")).toUpperCase();
}

export default async function ContaLayout({ children }: { children: React.ReactNode }) {
  const { profile, supabase } = await requireSession();

  // Só entra no menu quem é admin de fato (is_admin = true no banco).
  // A rota /admin tem a própria checagem em requireAdmin(), então esconder
  // o link é a primeira camada, não a única.
  const ehAdmin = profile?.is_admin === true;

  /*
   * Conta suspensa pelo administrador.
   *
   * O cliente continua autenticado (nada foi apagado), então em vez de
   * derrubá-lo no login com um erro genérico, mostramos o motivo e o caminho
   * de contato. É o par brando do "excluir conta", que apaga de verdade.
   *
   * O administrador não é barrado aqui: ele precisa entrar para poder
   * reativar a conta de quem suspendeu.
   */
  const estado = await getContaEstado(supabase);
  if (estado?.suspensa && !ehAdmin) return <ContaSuspensa />;

  /*
   * Taxa de confiança pendente.
   *
   * A partir do redesign, ela NÃO bloqueia mais a navegação: o cliente vê o
   * saldo e o extrato, e a cobrança aparece na Área PIX (onde ele pediu) mais
   * uma faixa de aviso no topo, para o saldo bloqueado não parecer erro.
   *
   * A proteção do dinheiro continua no banco: na liberação, o valor entra em
   * `bank_accounts.bloqueado` e `bank_move` calcula
   * disponivel = balance - bloqueado. Só `loan_taxa_pagar` (webhook) libera.
   * Ou seja: ver o saldo não é poder gastá-lo.
   */
  const taxaPendente = await getTaxaPendente(supabase, LOAN.taxaAdesaoPct);

  /*
   * Confirmação da taxa paga.
   *
   * Cobre quem pagou o PIX no app do banco e fechou a página: o webhook já
   * liberou o saldo, mas a tela de "Conta liberada" só existia para quem
   * estava olhando o QR. Aqui ela reaparece na volta, por até 24 h.
   *
   * Só faz sentido quando não há outra taxa em aberto — nesse caso o cliente
   * precisa ver a cobrança, não a comemoração da anterior.
   */
  const taxaConfirmada = taxaPendente ? null : await getTaxaConfirmada(supabase);

  // A verificação faz parte de abrir a conta. Enquanto não estiver aprovada,
  // o menu fica travado: só a própria verificação e o sair. Sem isso o cliente
  // entra num banco que não deixa fazer nada, sem entender por quê.
  //
  // O administrador é a exceção: ele é quem APROVA as verificações, então
  // exigi-la dele é um ciclo fechado — ninguém aprova o admin, e ele ficaria
  // preso fora do próprio painel. O banco segue a mesma regra: veja
  // `kyc_pode_movimentar` em supabase/admin3.sql.
  const kyc = await getKyc(supabase).meuStatus();
  const status = kyc.ok ? kyc.data.status : "nao_iniciado";
  const liberado = ehAdmin || status === "aprovado" || status === "em_analise";

  if (!liberado) {
    return (
      <>
        <header className="header">
          <div className="wrap">
            <Logo />
          </div>
        </header>
        <div className="wrap acc-shell">
          <SideNav travado />
          <main>{children}</main>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="header">
        <div className="wrap">
          <Logo />
          <div className="acc-actions">
            <Link href="/conta" className="acc-user">
              <span className="avatar" aria-hidden>
                {iniciais(profile?.full_name ?? "")}
              </span>
              <span>{profile?.full_name?.split(/\s+/)[0] ?? "Minha conta"}</span>
            </Link>
            <Link href="/conta/emprestimo" className="btn btn-primary">
              Pedir empréstimo
            </Link>
          </div>
        </div>
      </header>
      <div className="wrap acc-shell">
        <SideNav admin={ehAdmin} />
        <main>
          {taxaPendente && (
            <Link href="/conta/banco?aba=pix" className="aviso-taxa">
              <span className="aviso-taxa-icone" aria-hidden>
                !
              </span>
              <span>
                <strong>Taxa de confiança pendente.</strong> O valor do seu empréstimo está na conta,
                mas bloqueado até o pagamento. Toque para pagar na Área PIX.
              </span>
            </Link>
          )}
          {taxaConfirmada && (
            <TaxaConfirmada taxa={taxaConfirmada.taxa} parcela={taxaConfirmada.parcela} />
          )}
          {children}
        </main>
      </div>
    </>
  );
}
