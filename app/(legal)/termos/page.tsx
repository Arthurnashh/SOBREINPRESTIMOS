import Link from "next/link";
import type { Metadata } from "next";
import { COMPANY } from "@/lib/config";

export const metadata: Metadata = { title: `Termos de Uso | ${COMPANY.name}` };

export default function TermsPage() {
  return <>
    <h1>Termos de Uso</h1>
    <p className="muted">Versão de 26 de outubro de 2026.</p>
    <section className="stack">
      <h2>1. Sobre o serviço</h2>
      <p>{COMPANY.name} disponibiliza simulação de empréstimos, cadastro e acompanhamento de solicitações. Uma simulação ou um pedido aprovado no painel não constitui contrato, garantia de concessão de crédito ou comprovação de desembolso.</p>
      <p>Quando houver integração bancária efetivamente contratada, a instituição responsável e as condições completas deverão ser identificadas antes de qualquer contratação.</p>
    </section>
    <section className="stack">
      <h2>2. Conta de pagamento</h2>
      <p>A conta digital e os meios de pagamento — PIX, transferências, cartão virtual e pagamento de boletos — são oferecidos no âmbito da parceria com a instituição financeira identificada no rodapé e no contrato. O saldo e o histórico ficam registrados na conta do titular.</p>
      <p>Você é responsável por manter suas credenciais em segurança e por conferir os dados do destinatário antes de confirmar qualquer operação. Transferências e pagamentos confirmados seguem as regras do arranjo de pagamento aplicável e podem não ser reversíveis.</p>
    </section>
    <section className="stack">
      <h2>3. Cadastro e acesso</h2>
      <p>Proteja sua senha e utilize um e-mail ao qual você tenha acesso. Não use dados de outra pessoa. A confirmação de e-mail e a recuperação de senha são feitas por links enviados pelo serviço de autenticação. Administradores autorizados podem consultar cadastros e pedidos para atendimento.</p>
    </section>
    <section className="stack">
      <h2>4. Valores, juros e contratação</h2>
      <p>Parcelas, juros e custo total apresentados no simulador são estimativas. Uma eventual contratação real depende de análise, identificação da instituição concedente e aceite de contrato próprio com todas as condições e custos.</p>
      <p><strong>Não há taxa de adesão, depósito, PIX ou pagamento antecipado para liberar saldo ou empréstimo.</strong> Não efetue pagamentos com essa finalidade.</p>
    </section>
    <section className="stack">
      <h2>5. Uso adequado e disponibilidade</h2>
      <p>Não utilize o serviço para fraude, falsificação de comprovantes, acesso indevido a contas ou divulgação enganosa. O serviço pode passar por manutenção e depende da disponibilidade dos provedores integrados. Situações relacionadas a eventual contrato real devem seguir seus canais e condições próprios, preservados os direitos aplicáveis.</p>
    </section>
    <section className="stack">
      <h2>6. Privacidade e alterações</h2>
      <p>O tratamento dos dados está descrito na <Link href="/privacidade">Política de Privacidade</Link>. Alterações relevantes nestes termos devem ser informadas e identificadas por uma nova versão.</p>
    </section>
  </>;
}
