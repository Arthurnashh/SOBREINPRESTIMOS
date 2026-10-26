# SobreImpréstimos

Site de empréstimo pessoal (R$ 1.000 a R$ 20.000) com cadastro no Supabase, hospedado na Vercel, área do cliente com conta digital/PIX/cartão (via instituição parceira) e **painel administrativo** para gerenciar os pedidos.

**Princípios do produto:**
- Nenhum valor é cobrado antes da liberação do crédito. Juros e IOF estão nas parcelas e o CET aparece na simulação.
- A taxa é configurável, mas o painel **recusa taxas acima de 20% a.m.** como limite do produto. Esse limite não define a legalidade de uma taxa. As condições de uma operação real dependem da instituição responsável e de avaliação específica.

## Estrutura

```
app/
  page.tsx                 landing + simulador
  cadastro/, entrar/       cadastro (nome, CPF, celular) e login
  auth/callback/           confirmação de e-mail do Supabase
  conta/                   área logada (protegida pelo middleware)
    page.tsx               saldo, pedidos, extrato
    emprestimo/            simulação + envio do pedido
    pix/                   envio de PIX via provedor
    cartao/                cartão virtual
  actions/                 server actions (auth, pedidos, PIX)
lib/
  loan.ts                  Tabela Price, IOF estimado, CET
  banking/                 interface do provedor (demo | parceiro)
  supabase/server.ts       cliente Supabase com cookies
supabase/schema.sql        tabelas, RLS e trigger de perfil
```

## 1. Supabase

1. Crie um projeto em supabase.com.
2. Abra **SQL Editor**, cole `supabase/schema.sql` e rode. Depois rode `supabase/admin.sql` (papel de admin + decisão dos pedidos).
3. Em **Authentication → URL Configuration**, defina *Site URL* como o domínio do site e adicione `https://SEU-DOMINIO/auth/callback`, `https://SEU-DOMINIO/auth/callback?next=/redefinir-senha` e os equivalentes locais em *Redirect URLs*. Configure SMTP para entrega de e-mails em produção. Mantenha o template de recuperação com `{{ .ConfirmationURL }}` para concluir o fluxo PKCE pelo callback.
4. Copie a URL e a `anon key` em **Project Settings → API**.

Segurança já configurada no schema:
- RLS em todas as tabelas: cada cliente só vê os próprios dados.
- O cliente só consegue gravar `amount` e `installments` no pedido. Status, taxa e condições contratadas só podem ser alterados com a service role (backoffice).
- Um pedido em aberto por cliente; CPF único.

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
3. Em **Environment Variables**, cadastre as mesmas variáveis do `.env.example`, com `NEXT_PUBLIC_SITE_URL` apontando para o domínio final. Não cadastre a `service_role`.
4. Deploy.
5. Volte no Supabase e ajuste *Site URL* e *Redirect URLs* para o domínio publicado.

## 4. Conta digital, PIX e cartão

O site **não guarda saldo nem movimenta dinheiro**. Isso é feito pela instituição parceira autorizada pelo Banco Central.

- `BAAS_PROVIDER=demo` (padrão): saldo fictício inicial de R$ 4.250,00, agência `0000`, conta `DEMO-000001`, extrato de exemplo e cartão mascarado de demonstração. O PIX simulado desconta apenas o saldo fictício e exibe comprovante marcado **SIMULAÇÃO · SEM VALOR FINANCEIRO**. Não há chamadas à API bancária nem concessão real de crédito.
- O cookie `demo-wallet-v1` guarda o estado descartável por até sete dias no navegador, vinculado ao usuário autenticado. Guarda o total fictício utilizado e os oito PIX simulados mais recentes, sem chaves ou mensagens. Excluir cookies ou alternar o usuário restaura a demonstração; não é um livro financeiro, não tem garantia de concorrência e não deve ser usado para valores reais.
- `BAAS_PROVIDER=parceiro`: usa `lib/banking/partner.ts`. O arquivo é um esqueleto: troque rotas e formatos pelos da documentação do parceiro contratado e grave o id da conta do cliente em `profiles.external_account_id` (pelo backoffice ou por webhook do parceiro, usando a service role).

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
npm test
npm run typecheck
npm run build
```

Os testes verificam valores monetários, saldo fictício, isolamento entre usuários, cookies inválidos, tamanho do histórico e destinos seguros após autenticação. A entrega de e-mails e as permissões reais dependem da configuração do seu projeto Supabase.

O build utiliza um worker para reduzir o consumo de memória. Em ambientes limitados, defina `LOW_MEMORY_BUILD=1` para desativar o cache persistente do Webpack durante a compilação.

## Antes de ir ao ar

- Preencha CNPJ, nome da instituição parceira e taxa reais nas variáveis de ambiente.
- Revise e complete os termos de uso e a política de privacidade; publique o contrato modelo do parceiro quando houver operação real.
- Revise os textos legais com o jurídico do parceiro.
