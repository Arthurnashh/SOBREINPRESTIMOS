# SobreImpréstimos

Site de empréstimo pessoal (R$ 1.000 a R$ 20.000) com cadastro no Supabase, hospedado na Vercel, **conta bancária própria** (saldo, PIX, cartão virtual, boletos, agendamentos) e **painel administrativo** para gerenciar os pedidos.

**Princípios do produto:**
- Nenhum valor é cobrado antes da liberação do crédito. Juros e IOF estão nas parcelas e o CET aparece na simulação.
- A taxa é configurável, mas o painel **recusa taxas acima de 20% a.m.** como limite do produto. Esse limite não define a legalidade de uma taxa. As condições de uma operação real dependem da instituição responsável e de avaliação específica.

## Estrutura

```
app/
  page.tsx                 landing + simulador
  cadastro/, entrar/       cadastro (nome, CPF, celular) e login
  auth/callback/           confirmação de e-mail do Supabase
  api/cron/agendamentos/   executa agendamentos vencidos (protegido por CRON_SECRET)
  conta/                   área logada (protegida pelo middleware)
    page.tsx               resumo, pedidos e últimas movimentações
    banco/                 conta bancária (abas: Início, Área PIX, Cartões, Extrato, Perfil, Config)
    emprestimo/            simulação + envio do pedido
  actions/                 server actions (auth, pedidos, banco, admin)
components/banco/          painéis e formulários da conta
lib/
  loan.ts                  Tabela Price, IOF estimado, CET
  banking/                 BankService sobre as funções bank_* do Postgres
  supabase/server.ts       cliente Supabase com cookies
supabase/
  schema.sql               perfis, pedidos, RLS e trigger de cadastro
  admin.sql                papel de admin e decisão dos pedidos
  bank.sql                 conta, extrato, cartão, chaves PIX, boletos
  bank2.sql                depósito, saque, recarga, cobrança, agendamento, DDA, limites
  _reset.sql               limpa dados de teste sem apagar a conta
```

## 1. Supabase

1. Crie um projeto em supabase.com.
2. Abra **SQL Editor** e rode, nesta ordem: `supabase/schema.sql`, `supabase/admin.sql`, `supabase/bank.sql`, `supabase/bank2.sql`. Os quatro são idempotentes.
3. Em **Authentication → URL Configuration**, defina *Site URL* como o domínio do site e adicione `https://SEU-DOMINIO/auth/callback`, `https://SEU-DOMINIO/auth/callback?next=/redefinir-senha` e os equivalentes locais em *Redirect URLs*. Configure SMTP para entrega de e-mails em produção. Mantenha o template de recuperação com `{{ .ConfirmationURL }}` para concluir o fluxo PKCE pelo callback.
4. Copie a URL e a `anon key` em **Project Settings → API**.

Segurança já configurada no schema:
- RLS em todas as tabelas: cada cliente só vê os próprios dados.
- O cliente só consegue gravar `amount` e `installments` no pedido. Status, taxa e condições contratadas só podem ser alterados com a service role (backoffice).
- Um pedido em aberto por cliente; CPF único.
- Nas tabelas bancárias o cliente tem apenas `select` das próprias linhas: `insert`, `update` e `delete` estão revogados. Todo dinheiro se move por funções `SECURITY DEFINER` que travam a linha da conta.

## 2. Rodar localmente

```bash
cp .env.example .env.local   # preencha os valores
npm install
npm run dev
```

## 3. Publicar na Vercel

Passo a passo completo, com limites dos planos gratuitos, URLs de autenticação e
checklist de testes: **[DEPLOY.md](DEPLOY.md)**.

Resumo:

1. Suba o projeto para um repositório no GitHub.
2. Na Vercel: **Add New → Project**, importe o repositório (framework detectado: Next.js).
3. Em **Environment Variables**, cadastre as mesmas variáveis do `.env.example`, com `NEXT_PUBLIC_SITE_URL` apontando para o domínio final. Cadastre também, como **Secret**: `SUPABASE_SERVICE_ROLE_KEY` (usada só pelo cron) e `CRON_SECRET`. Nunca prefixe essas duas com `NEXT_PUBLIC_`.
4. Deploy.
5. Volte no Supabase e ajuste *Site URL* e *Redirect URLs* para o domínio publicado.
6. Confirme o cron em Vercel → Settings → Cron Jobs (o `vercel.json` já registra).

## 4. Conta bancária

A conta é **real dentro do sistema**: o saldo vive na tabela `bank_accounts` do seu Supabase e toda movimentação passa por funções `SECURITY DEFINER` que travam a linha da conta, validam saldo e limites e gravam o lançamento na mesma transação. Não há saldo fictício, estado de demonstração no navegador nem provedor simulado — os arquivos `lib/banking/demo.ts`, `demo-state.ts` e `partner.ts` foram removidos.

Ao criar a conta pelo `/cadastro`, o trigger `handle_new_user()` já emite a conta (agência `0001`), o cartão virtual e os limites padrão.

**Operações disponíveis em `/conta/banco`:**

| Aba | O que tem |
|---|---|
| Início | saldo (com botão de ocultar), entradas/saídas do mês, últimas movimentações |
| Área PIX | enviar, receber por cobrança com QR, transferir, depositar, sacar, pagar boleto, recarga, agendar; chaves PIX |
| Cartões | cartão virtual, bloqueio e desbloqueio imediato, limite |
| Extrato | lançamentos, depósitos, saques, recargas, boletos e comprovantes |
| Perfil | dados do titular, agendamentos e boletos no CPF |
| Config | limites por operação e por dia, segurança, dados da conta |

**Limites.** `bank_limits` define teto por PIX, por transferência e por saque (por operação e por dia); `0` significa sem limite. `bank_send_pix`, `bank_transfer` e `bank_withdraw` recusam acima do configurado.

**Agendamentos.** `bank_run_schedules()` é idempotente e restrita ao `service_role`. O cron da Vercel chama `/api/cron/agendamentos` uma vez por dia; o endpoint exige `Authorization: Bearer $CRON_SECRET` e responde `503` se o segredo não estiver configurado.

**Comprovantes.** Cada operação grava uma linha em `bank_receipts`, consultável no extrato.

> A conta funciona ponta a ponta, mas **não é uma conta de pagamento regulada** enquanto não houver contrato com uma instituição autorizada pelo Banco Central. O número completo do cartão e o CVV não são armazenados: só os 4 últimos dígitos e o hash do CVV.

## 5. Painel administrativo (`/admin`)

1. Crie uma conta normal pelo site (cadastro).
2. Promova-a a administrador — **duplo clique em `promover-admin.bat`** e informe o e-mail
   (precisa de `SUPABASE_SERVICE_ROLE_KEY` no `.env.local`). Ou, pelo SQL Editor:
   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where email = 'admin@suaempresa.com');
   ```
3. Entre e acesse `/admin`. Lá dá para filtrar por status, ver os dados do cliente e, em cada pedido, **aprovar** (informando a taxa mensal — o sistema calcula parcela, IOF e CET), **recusar** com observação ou **marcar como liberado** após o desembolso.
4. Em `/admin/usuarios`, consulte todos os perfis, inclusive sem pedidos, com busca por nome, CPF ou telefone e paginação de 25 registros. A página exige administrador e usa a policy de leitura já criada por `supabase/admin.sql`; não exige service role no navegador nem alteração adicional do schema.

Segurança do admin: a leitura total usa policies de RLS com `is_admin()`; as gravações passam pela função `admin_set_decision` (SECURITY DEFINER), que valida o papel e o teto de taxa. O cliente nunca consegue alterar status, taxa ou condições por conta própria.

## Cookies, textos legais e recuperação de senha

- O aviso de cookies aparece em todas as páginas, inclusive no cadastro. Há apenas cookies necessários; não há rastreadores opcionais para aceitar ou rejeitar. A leitura é lembrada por 180 dias e o botão **Cookies** reabre as informações.
- `/termos` e `/privacidade` estão vinculadas ao cadastro e ao rodapé. Os textos descrevem o funcionamento desta versão e precisam de revisão e complementação com identificação do responsável, prazos de retenção, bases legais e provedores antes de produção. Configure `NEXT_PUBLIC_PRIVACIDADE_EMAIL` com um canal real.
- `/esqueci-senha` solicita um link pelo Supabase sem informar se o e-mail tem conta. O callback troca o código PKCE pela sessão e encaminha para `/redefinir-senha`. O usuário deve abrir o link no mesmo navegador. A nova senha exige confirmação; ao salvar, a sessão é encerrada para novo login.
- Documentação de referência: [recuperação de senha do Supabase](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail) e [orientações da ANPD sobre cookies](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_cookies_e_protecao_de_dados_pessoais).

## Verificação

Use Node.js 22.18+ ou 24 para executar os testes de módulos TypeScript:

```bash
npm test          # 15 testes unitários
npm run typecheck
npm run build
```

Contra um banco real (precisam de `.env.local` preenchido):

```bash
node tests/e2e-banco.mjs         # 24 checks: PIX, boleto, crédito, saldo
node tests/e2e-banco2.mjs        # 49 checks: depósito, saque, recarga, cobrança, limites
node tests/e2e-agenda.mjs        # 12 checks: execução e idempotência dos agendamentos
node tests/e2e-cadastro.mjs      # 17 checks
node tests/e2e-isolamento.mjs    # 15 checks: um cliente não vê a conta do outro
node tests/e2e-emprestimo.mjs    # 16 checks
node tests/e2e-permissoes.mjs    # 10 checks: o que o cliente não pode chamar
node tests/e2e-banco-prod.mjs    # 24 checks contra o site publicado
node tests/e2e-banco-paineis.mjs # 28 checks: painéis no SSR e abas no bundle
```

Os testes unitários cobrem as mensagens de erro do banco (tradução de erro técnico para português) e os rótulos de cada tipo de movimentação. As suítes e2e medem sempre o **delta** de saldo, então podem rodar repetidas vezes sem assumir valor inicial. Para zerar os dados de teste: `npx supabase db query --linked -f supabase/_reset.sql`.

O build utiliza um worker para reduzir o consumo de memória. Em ambientes limitados, defina `LOW_MEMORY_BUILD=1` para desativar o cache persistente do Webpack durante a compilação.

## Antes de ir ao ar

- Preencha CNPJ, nome da instituição parceira e taxa reais nas variáveis de ambiente.
- Revise e complete os termos de uso e a política de privacidade; publique o contrato modelo do parceiro quando houver operação real.
- Revise os textos legais com o jurídico do parceiro.
