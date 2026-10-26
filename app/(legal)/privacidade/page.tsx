import type { Metadata } from "next";
import { COMPANY, cnpjValido } from "@/lib/config";

export const metadata: Metadata = { title: `Política de Privacidade | ${COMPANY.name}` };

export default function PrivacyPage() {
  return <>
    <h1>Política de Privacidade</h1>
    <p className="muted">Versão de 26 de outubro de 2026.</p>
    <section className="stack">
      <h2>1. Responsável e contato</h2>
      <p>Esta política descreve o uso de dados no serviço {COMPANY.name}. O responsável pelo tratamento é a própria {COMPANY.name}{cnpjValido(COMPANY.cnpj) ? `, identificada pelo CNPJ ${COMPANY.cnpj}` : ""}.</p>
      {COMPANY.privacyEmail ? <p>Solicitações de privacidade: <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a>.</p>
        : <p>Para exercer seus direitos, use o canal de atendimento informado no rodapé desta página. Respondemos em até 15 dias.</p>}
    </section>
    <section className="stack">
      <h2>2. Dados e finalidades</h2>
      <p>O cadastro solicita nome, CPF, telefone e e-mail para identificar a conta e relacionar solicitações ao usuário. O Supabase gerencia a autenticação e a senha. Os pedidos registram valor, prazo, status, condições, observações e datas para permitir seu acompanhamento e análise administrativa.</p>
      <p>A recuperação de senha utiliza o e-mail cadastrado. Uma sessão autenticada é necessária para acessar a conta. Esta versão não executa consultas ao SCR ou a bureaus de crédito.</p>
    </section>
    <section className="stack">
      <h2>3. Dados bancários</h2>
      <p>Para operar a conta de pagamento, registramos o número da conta, agência, saldo, extrato de movimentações, chaves PIX cadastradas, dados do cartão virtual e boletos pagos. Esses dados ficam vinculados à sua conta e são usados para executar as operações que você solicita, atender obrigações legais e prevenir fraudes.</p>
      <p>O número completo do cartão e o código de segurança não são armazenados por nós: são mantidos pela instituição emissora, que é a responsável pela emissão e pelo processamento das compras.</p>
    </section>
    <section className="stack" id="cookies">
      <h2>4. Cookies e armazenamento local</h2>
      <p>Utilizamos somente cookies necessários. Nenhum cookie de publicidade ou análise de navegação está instalado nesta versão.</p>
      <ul>
        <li><strong>Autenticação (Supabase):</strong> mantém e renova a sessão de acesso, conforme a configuração do provedor.</li>
        <li><strong>site-cookie-notice:</strong> registra a leitura do aviso por até 180 dias.</li>
      </ul>
      <p>O botão “Cookies” permite reabrir o aviso. Você pode excluir ou bloquear os cookies nas configurações do navegador; isso encerra a sessão. O saldo e o histórico da conta não ficam no navegador.</p>
    </section>
    <section className="stack">
      <h2>5. Acesso, provedores e conservação</h2>
      <p>O usuário acessa seus próprios dados; administradores autorizados podem consultar os perfis e pedidos. O Supabase fornece autenticação e banco de dados. O provedor de hospedagem processa as requisições necessárias ao funcionamento do site. As fontes tipográficas são carregadas do Google Fonts, que recebe dados técnicos da conexão, como o endereço IP.</p>
      <p>Os cadastros e pedidos permanecem no banco até exclusão administrativa ou da conta, observadas as obrigações aplicáveis à operação. Antes da produção, o responsável deverá definir e divulgar os prazos de retenção, as bases legais de cada finalidade e os provedores efetivamente utilizados, incluindo eventuais transferências internacionais.</p>
    </section>
    <section className="stack">
      <h2>6. Suas solicitações</h2>
      <p>Você pode solicitar informações sobre o tratamento, acesso, correção e exclusão dos dados, além dos demais direitos aplicáveis, pelo canal de privacidade informado nesta página. Podemos solicitar informações proporcionais para confirmar sua identidade. Não envie senhas por e-mail.</p>
    </section>
  </>;
}
