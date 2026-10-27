# Deploy — Vercel + Supabase

Guia direto. Do zero ao site no ar, tudo em plano gratuito.

**Regra de ouro:** a Vercel hospeda o Next.js. Ela **não tem banco de dados**.
O banco é o Supabase, na nuvem, e a Vercel só fala com ele por HTTPS.
Por isso o banco local (Docker/Postgres no seu PC) não serve para o deploy.

```
navegador  ──►  Vercel (Next.js)  ──HTTPS──►  Supabase (Postgres + Auth)
```

---

## Limites dos planos gratuitos

| Serviço | Limite free | Suficiente? |
|---|---|---|
| Vercel Hobby | 100 GB banda/mês, builds ilimitados, SSL grátis | sim, com folga |
| Supabase Free | 500 MB de banco, 50.000 usuários ativos/mês, pausa após 7 dias sem uso | sim |

Atenção: **projeto Supabase free pausa depois de 7 dias sem nenhuma requisição.**
Em produção com movimento isso não acontece. Se acontecer, é um clique para reativar
no painel. Para um site dormente, vale o plano pago de US$25.

---

## Duas armadilhas que já custaram tempo

### 1. Arquivo grande não passa por Server Action

O Next.js limita o corpo de Server Actions a **1 MB** por padrão. Foto tirada no
celular tem 3–8 MB, então enviar o `File` para uma action faz o envio ficar
pendurado — a tela mostra "Enviando…" para sempre, sem erro.

Por isso o KYC envia **direto do navegador para o Supabase Storage**
(`lib/kyc/enviar-direto.ts`) e manda ao servidor apenas o caminho do arquivo.
O arquivo ainda é reduzido no navegador antes de subir (`lib/comprimir.ts`):
1600px no maior lado e JPEG em 82% levam uma foto de 5 MB para ~300 KB.

Se algum dia precisar enviar arquivo por action, o limite se ajusta em
`next.config.ts`:

```ts
experimental: { serverActions: { bodySizeLimit: "10mb" } }
```

Mas prefira o caminho direto: o arquivo não passa pelo servidor da aplicação,
gasta menos banda e não concorre com o limite de execução da Vercel.

### 2. Meta viewport é obrigatória

Sem `export const viewport` no `app/layout.tsx`, o celular assume uma página de
desktop (~980px) e encolhe tudo. O site fica ilegível e os botões difíceis de
tocar, mesmo com todo o CSS responsivo correto. Está declarada lá, com
`viewportFit: "cover"` para aparelhos com notch.

---

## Passo 1 — Criar o banco no Supabase (3 min)

1. [supabase.com](https://supabase.com) → **Start your project** → entre com GitHub.
2. **New project**:
   - Name: `sobreimprestimos`
   - Database Password: **gere e guarde**, essa senha não aparece de novo
   - Region: **South America (São Paulo)** — menor latência para o Brasil
3. Espere ~2 min até provisionar.

### Guarde as três chaves

**Project Settings → API**:

| Chave | Para que serve | Onde vai |
|---|---|---|
| `Project URL` | endereço do projeto | `.env.local` e Vercel |
| `anon public` | chave pública, protegida por RLS | `.env.local` e Vercel |
| `service_role` | **secreta**, ignora RLS | **só no seu PC**, nunca na Vercel |

> `service_role` dá acesso total ao banco. Ela **não** entra na Vercel e **não** entra no Git.
> O `.gitignore` já bloqueia `.env.local`.

## Passo 2 — Aplicar o schema

**SQL Editor** → cole e rode, nesta ordem:

1. `supabase/schema.sql` — perfis, pedidos, RLS, trigger de cadastro
2. `supabase/admin.sql` — papel de admin, leitura total, `admin_set_decision`
3. `supabase/bank.sql` — **conta bancária**: saldo, extrato, cartão, chaves PIX,
   boletos e as funções que movimentam dinheiro
4. `supabase/bank2.sql` — **conta completa**: depósito, saque, recarga, cobrança
   PIX, agendamento, DDA, comprovantes, tarifas, limites e dados cadastrais
5. `supabase/kyc.sql` — **verificação de identidade**: bucket privado, envio de
   documentos, biometria, fila de análise e o bloqueio de movimentação
6. `supabase/admin2.sql` — **painel administrativo**: lista de todas as contas,
   ficha completa (dados, KYC com as 9 fotos, saldo, extrato, cartão, PIX,
   limites, empréstimos), ajuste de saldo e bloqueio de conta/cartão, com
   trilha de auditoria
7. `supabase/admin3.sql` — **admin não faz verificação**: `kyc_pode_movimentar`
   passa a isentar administrador
8. `supabase/loan3.sql` — **faixa do empréstimo** (R$ 500 a R$ 20.000) e as
   colunas de declaração de seguro/garantia
9. `supabase/loan4.sql` — **`loan_request()`**: criação do pedido por função.
   Sem ela o cliente não consegue pedir empréstimo (ver nota abaixo)
10. `supabase/loan5.sql` — **parcelas**: tabela `loan_installments`, geração do
    cronograma dentro de `bank_credit_loan`, boleto/PIX por parcela
    (`loan_installment_charge`) e o resumo do contrato (`loan_contrato`)
11. `supabase/loan6.sql` — **periodicidade**: `loan_request` aceita semanal,
    quinzenal ou mensal, com a taxa do período gravada no pedido
12. `supabase/loan7.sql` — **taxa de confiança**: taxa de 50% da parcela
    retida no saldo na liberação, confirmação pelo cliente, abatimento na 1ª
    parcela e `bloqueado` na conta (o disponível passa a descontar o bloqueio)
13. `supabase/loan8.sql` — **taxa paga por PIX (PagueCom)**: tabelas
    `loan_fee_charges` e `app_settings`, cobrança reutilizada por 30 minutos,
    `loan_taxa_pagar()` chamada pelo webhook/consulta, gate que bloqueia toda
    saída da conta enquanto a taxa estiver pendente e `bank_credit_loan`
    lendo o percentual do painel

Os treze são idempotentes (`if not exists` / `drop policy if exists` /
`create or replace`), então rodar de novo não quebra nada.

> **Depois do `loan8.sql`:** configure a chave do PagueCom em **Admin →
> Gateway / Taxa** e ative a cobrança. Sem isso o cliente com taxa pendente vê
> o aviso de pagamento indisponível e a conta continua bloqueada (é o
> comportamento correto: nada é liberado antes do pagamento). A URL do webhook
> aparece na mesma tela; cadastre-a no painel do PagueCom assinando
> `charge.paid` e `charge.expired`. Mesmo sem webhook, a tela consulta o
> gateway a cada 5 segundos.

> **Ordem importa.** `bank.sql` redefine `handle_new_user()` para também abrir
> conta e cartão no cadastro. `bank2.sql` amplia a lista de tipos de
> movimentação — e essa lista existe em **dois** lugares: no `check` da tabela
> `bank_transactions` e dentro de `bank_move`/`bank_move_for`. Mexer só no
> `check` faz a função recusar a operação com "tipo de movimentação inválido".
> `kyc.sql` **redefine `bank_move`** para inserir o gate do KYC antes da checagem
> de saldo, então tem de ser o último. Rode os três por último, nesta ordem.
>
> `admin2.sql` depende de `bank_accounts`, `bank_cards`, `kyc_submissions` e
> `admin_auditoria` — por isso vem depois de todos. Ele **não** mexe em
> `bank_move`: o ajuste de saldo do admin é feito por `admin_ajustar_saldo`,
> que insere o lançamento no extrato e atualiza o saldo na mesma transação.
>
> `admin3.sql` redefine `kyc_pode_movimentar`, que é usada por `bank_move`,
> `bank_schedule`, `bank_run_schedules` e pela policy de criar pedido. Rodar
> depois de `kyc.sql`, senão a isenção do admin se perde.
>
> `loan7.sql` também redefine `bank_move` — ele parte da versão do `kyc.sql`
> (com o gate de identidade) e só acrescenta o desconto do saldo bloqueado.
> Por isso precisa rodar **depois** de `kyc.sql`; rodar antes apaga o gate.
>
> `loan8.sql` redefine `bank_move` e `bank_move_for` **de novo** — parte da
> versão do `loan7.sql` e acrescenta o gate da taxa pendente. Rode por último,
> depois de `loan7.sql`, `kyc.sql` e `admin3.sql`, senão o gate se perde.
>
> `loan4.sql` é obrigatório para o empréstimo funcionar: `authenticated` **não
> tem INSERT** em nenhuma tabela deste sistema — toda escrita passa por função
> `SECURITY DEFINER`. O app pedia empréstimo com `.insert()` direto, o que
> sempre resultava em "permission denied for table loan_requests".

### A conta bancária

O saldo **não fica no navegador**: vive na tabela `bank_accounts`, e toda
movimentação passa pelas funções `bank_*` (SECURITY DEFINER), que travam a
linha da conta, validam saldo/limite e gravam o lançamento na mesma transação.

| Tabela | Guarda |
|---|---|
| `bank_accounts` | agência, número, dígito, saldo, limite, status |
| `bank_transactions` | extrato (positivo = entrada, negativo = saída) |
| `bank_cards` | cartão virtual (só os 4 últimos dígitos e o hash do CVV) |
| `bank_pix_keys` | chaves PIX do titular |
| `bank_boletos` | boletos pagos |
| `bank_deposits` | depósitos recebidos, com forma e origem |
| `bank_withdrawals` | saques, com o código de retirada |
| `bank_topups` | recargas de celular |
| `bank_schedules` | agendamentos futuros (status: agendado/executado/cancelado/falhou) |
| `bank_dda` | boletos registrados contra o CPF do titular |
| `bank_pix_charges` | cobranças PIX com o código copia e cola |
| `bank_receipts` | comprovante de cada operação |
| `bank_fees` | tarifas cobradas (hoje todas zeradas) |
| `bank_profiles` | endereço, profissão e renda do titular |
| `bank_limits` | teto por PIX, transferência e saque, por operação e por dia |

Ao criar a conta pelo `/cadastro`, o trigger `handle_new_user()` já emite
a conta (agência `0001`) e o cartão virtual. Se a conta não existir por
qualquer motivo, `/conta/banco` abre na primeira visita.

> **`bank_move_for` move dinheiro em nome de outra pessoa** e por isso é
> restrita ao `service_role`. Se um cliente comum chamá-la, recebe `403`.
> É ela que credita o empréstimo liberado e executa os agendamentos.

### Agendamentos

`bank_run_schedules()` é SECURITY DEFINER, restrita ao `service_role`, e
**idempotente**: marca o agendamento como `executado` antes de debitar, então
rodar duas vezes no mesmo dia não cobra em dobro. Agendamento sem saldo vira
`falhou` em vez de travar a fila.

Quem a chama é o cron da Vercel, diariamente, via `/api/cron/agendamentos`
(configurado em `vercel.json`). O endpoint exige o header
`Authorization: Bearer $CRON_SECRET`; sem o segredo configurado ele responde
`503` e não executa nada.

### Verificação de identidade (KYC)

Ninguém movimenta dinheiro para fora sem identidade verificada. **Entrada é
sempre liberada** (depósito, PIX recebido, crédito de empréstimo, estorno) —
travar entrada só prenderia o cliente. O que exige aprovação é a **saída**:
PIX enviado, transferência, boleto, saque, recarga, agendamento, débito
automático e tarifa.

> **O gate existe em quatro pontos, e todos são necessários.** A saída direta
> passa por `bank_move`. O agendamento passa por `bank_schedule` na criação e
> por `bank_run_schedules` na execução — este último porque a fila roda com
> `service_role` e chama `bank_move_for`, que **não** tem gate próprio (é a
> mesma função que credita empréstimo e estorno, que devem passar). Proteger
> só `bank_move` deixaria o cliente agendar hoje sem verificação e o dinheiro
> sair amanhã pelo cron.
>
> O quarto é a **policy de insert de `loan_requests`**. A server action checa o
> KYC, mas isso sozinho não basta: o cliente tem `grant insert (amount,
> installments)` na tabela e pode chamar a API REST direto. Sem a condição na
> policy, `POST /rest/v1/loan_requests` com o token do próprio cliente criava o
> pedido mesmo sem verificação. A regra tem de viver no banco.

| Tabela | Guarda |
|---|---|
| `kyc_submissions` | um registro por pessoa: dados, endereço, documento, comprovante, caminhos das fotos, biometria e a decisão |
| `kyc_events` | trilha de auditoria: de qual status para qual, quando, por quem e com que observação |

Os arquivos ficam no bucket **privado** `kyc`, em pastas por `user_id`. As
políticas de Storage garantem que cada cliente só lê e grava na própria pasta,
que o admin lê todas e que ninguém mais lê nada. A escrita nas tabelas é
revogada de `anon` e `authenticated`: só entra pelas funções `kyc_*`
(SECURITY DEFINER).

O que o cliente envia:

- **dados pessoais** — nome completo, nascimento (18+), CPF, nome da mãe, celular e e-mail
- **endereço** — CEP, logradouro, número, bairro, cidade e UF
- **documento** — CNH **ou** RG, frente e verso, com número e órgão emissor
- **comprovante de endereço** — tipo escolhido pelo cliente
- **selfie segurando o documento**
- **biometria** — cinco ângulos do rosto (frontal, direita, esquerda, sorriso e aproximado)
  com prova de vida por movimento

Status possíveis: `nao_iniciado`, `em_analise`, `aprovado`, `recusado` e
`pendente` (correção pedida). Só `aprovado` libera movimentação.

O fluxo do cliente é em `/conta/verificacao`. A análise é em `/admin/kyc`:
o admin vê os dados, abre cada foto por URL assinada de 10 minutos e decide.
**Recusar ou pedir correção exige justificativa** — aprovar não exige.

> **O que a biometria faz e o que não faz.** A captura, a validação de
> qualidade (nitidez, luz, enquadramento, tamanho do rosto) e a prova de vida
> por movimento são reais e rodam no navegador. A **comparação 1:1** entre a
> selfie e a foto do documento **não** está implementada: isso exige um
> fornecedor pago (AWS Rekognition, Unico, idwall). O ponto de integração está
> pronto em `lib/kyc/service.ts` — hoje a decisão final é humana.

Se o KYC de um cliente for aprovado direto no banco e ele ficar sem acesso,
o admin pode reabrir a análise por `kyc_reabrir`.

### Crédito do empréstimo

Quando o admin marca um pedido como **liberado** em `/admin/pedido/[id]`,
o valor cai na conta do cliente. A operação é **idempotente**: liberar duas
vezes não credita em dobro. Se aparecer "credito na conta falhou", rode a
liberação de novo com segurança.

Confira que os cinco schemas pegaram:

```sql
select
  (select count(*) from public.profiles)          as perfis,
  (select count(*) from public.bank_accounts)     as contas,
  (select count(*) from public.bank_cards)        as cartoes,
  (select count(*) from public.bank_limits)       as limites,
  (select count(*) from public.bank_receipts)     as comprovantes,
  (select count(*) from public.kyc_submissions)   as kyc;
```

Confirme que o bucket do KYC é privado:

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'kyc';
```

`public` tem de ser `false`.

## Passo 3 — Criar o primeiro administrador

O projeto **não tem cadastro de admin pela interface** — é proposital.
Todo usuário nasce cliente (`is_admin = false`).

1. Cadastre-se normalmente pelo site: `/cadastro` (nome, CPF, celular).
2. Confirme o e-mail.
3. No **SQL Editor** do Supabase:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'SEU-EMAIL-AQUI');
```

4. Saia, entre de novo. O link **Administração** aparece no menu da área do cliente.

Confirme que pegou:

```sql
select u.email, p.full_name, p.is_admin
from auth.users u join public.profiles p on p.id = u.id
where p.is_admin = true;
```

## Passo 4 — URL de autenticação

**Authentication → URL Configuration**:

- **Site URL**: `http://localhost:3000` enquanto testa local.
  Depois do deploy, troque para `https://SEU-PROJETO.vercel.app`.
- **Redirect URLs**, adicione todas:
  ```
  http://localhost:3000/auth/callback
  http://localhost:3000/auth/callback?next=/redefinir-senha
  https://SEU-PROJETO.vercel.app/auth/callback
  https://SEU-PROJETO.vercel.app/auth/callback?next=/redefinir-senha
  ```

Sem isso, confirmação de e-mail e recuperação de senha quebram com erro de redirect.
O callback usa PKCE: **o link precisa ser aberto no mesmo navegador** que pediu.

### E-mail em produção

O SMTP embutido do Supabase é **só para testes** (limite baixo, sem garantia).
Em **Project Settings → Auth → SMTP Settings**, configure um provedor real
(Resend, SendGrid, Amazon SES, Brevo). Sem isso, usuários reais não confirmam conta.

## Passo 5 — Testar local antes de subir

```bash
# .env.local precisa ter URL e anon key reais
npm run dev
```

Roteiro de teste:

- [ ] `/cadastro` cria conta e cai na área do cliente
- [ ] a conta bancária abre junto com o cadastro (agência `0001`, cartão virtual emitido)
- [ ] `/conta/banco` mostra saldo, abas (Início, Área PIX, Cartões, Extrato, Perfil, Config) e o olho de ocultar saldo
- [ ] depositar, sacar e recarregar celular mexem no saldo e guardam comprovante
- [ ] gerar cobrança PIX devolve um código copia e cola
- [ ] agendar para hoje e rodar `bank_run_schedules` debita uma vez só (idempotente)
- [ ] `/conta/emprestimo` envia pedido e ele aparece em `/conta`
- [ ] receber pedido do mesmo cliente duas vezes dá "já tem um pedido em andamento"
- [ ] `/admin` lista o pedido (só com `is_admin = true`)
- [ ] aprovar com taxa de 3,99% a.m. calcula parcela, IOF e CET
- [ ] aprovar com 25% a.m. é **recusado** (teto de 20%)
- [ ] liberar um pedido credita a conta **uma vez só**, mesmo clicando duas vezes
- [ ] `/admin/usuarios` busca por nome, CPF e telefone
- [ ] `/esqueci-senha` envia link e o link redefine a senha

- [ ] `/conta/verificacao` percorre as 4 etapas e envia para análise
- [ ] a câmera pede permissão e recusa captura sem nitidez ou sem luz
- [ ] a prova de vida só libera após virar a cabeça, sorrir e aproximar
- [ ] sem KYC aprovado, saque/PIX/transferência/boleto são recusados
- [ ] sem KYC aprovado, **agendar** também é recusado
- [ ] **depósito e PIX recebido continuam funcionando** sem KYC
- [ ] `/admin/kyc` lista a verificação, abre as 9 fotos e aprova
- [ ] recusar sem justificativa é bloqueado
- [ ] após aprovar, a saída da conta funciona
- [ ] `/conta/emprestimo` recusa pedido sem KYC aprovado
- [ ] `/conta/banco` mostra o aviso de verificação pendente no início

Suítes automatizadas (precisam de `.env.local` real):

```bash
npm test                        # 25 testes unitários (mensagens de erro, rótulos, ângulos)
node tests/e2e-banco.mjs        # 24 checks: PIX, boleto, crédito, saldo
node tests/e2e-banco2.mjs       # 49 checks: depósito, saque, recarga, cobrança, limites, DDA
node tests/e2e-agenda.mjs       # 13 checks: execução e idempotência dos agendamentos
node tests/e2e-cadastro.mjs     # 17 checks
node tests/e2e-isolamento.mjs   # 15 checks: um cliente não vê a conta do outro
node tests/e2e-emprestimo.mjs   # 16 checks
node tests/e2e-permissoes.mjs   # 10 checks: o que o cliente não pode chamar
node tests/e2e-cartao.mjs       # 13 checks: dados do cartão, PAN derivado e Luhn
node tests/e2e-menu-admin.mjs   # 16 checks: link de admin só para admin
node tests/e2e-kyc.mjs          # 50 checks: etapas, upload, bloqueio, aprovação
node tests/e2e-kyc-bucket.mjs   # 13 checks: isolamento dos arquivos no Storage
node tests/e2e-kyc-gate.mjs     # 16 checks: entrada liberada, saída barrada
node tests/e2e-kyc-cron.mjs     # 11 checks: o cron não debita conta sem KYC
node tests/e2e-kyc-emprestimo.mjs # 11 checks: empréstimo barrado no banco (RLS) e na action
node tests/e2e-banco-prod.mjs   # 28 checks contra o site publicado
node tests/e2e-banco-paineis.mjs # 44 checks: painéis no SSR e abas no bundle
node tests/e2e-kyc-prod.mjs     # 28 checks: KYC no site publicado
```

As suítes criam usuários de teste de verdade e os apagam no fim. `e2e-kyc-prod`
e `e2e-kyc-gate` usam um cliente **próprio** em vez do admin, de propósito: as
outras suítes aprovam o KYC do admin, e isso faria a tela mostrar "Identidade
verificada" em vez do formulário.

Para zerar os dados de teste sem apagar a conta:

```bash
npx supabase db query --linked -f supabase/_reset.sql
```

## Passo 6 — Deploy na Vercel

1. Suba o projeto para um repositório no GitHub.
   **Antes, confirme que `.env.local` não foi commitado:**
   ```bash
   git status --porcelain | findstr env.local
   ```
   Sem saída = ok.
2. [vercel.com/new](https://vercel.com/new) → importe o repositório.
   Framework detectado: **Next.js**. Build e output: deixe o padrão.
3. **Environment Variables** — cadastre para Production, Preview e Development:

   | Nome | Valor | Tipo |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxx.supabase.co` | Config |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | a anon key | Config |
   | `NEXT_PUBLIC_SITE_URL` | `https://SEU-PROJETO.vercel.app` | Config |
   | `NEXT_PUBLIC_EMPRESA_NOME` | nome real da empresa | Config |
   | `NEXT_PUBLIC_EMPRESA_CNPJ` | CNPJ real (deixe vazio se não tiver — o rodapé omite) | Config |
   | `NEXT_PUBLIC_INSTITUICAO_PARCEIRA` | instituição parceira real (vazio = texto genérico) | Config |
   | `NEXT_PUBLIC_TAXA_MENSAL` | taxa real do produto, ex. `0.0399` | Config |
   | `NEXT_PUBLIC_PRIVACIDADE_EMAIL` | canal real de privacidade | Config |
   | `SUPABASE_SERVICE_ROLE_KEY` | a service role key | **Secret** |
   | `CRON_SECRET` | string aleatória longa | **Secret** |

   As duas últimas **precisam ser Secret**, nunca `NEXT_PUBLIC_`:
   - `SUPABASE_SERVICE_ROLE_KEY` é usada só pela rota de cron. Ela ignora RLS —
     se vazar para o navegador, qualquer pessoa lê e altera qualquer conta.
   - `CRON_SECRET` protege `/api/cron/agendamentos`. Sem ela, o endpoint
     responde `503` e a fila de agendamentos não roda.

   Gere o segredo com:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   > **Nunca** prefixe essas duas com `NEXT_PUBLIC_`. Esse prefixo embute o
   > valor no JavaScript que vai para o navegador.

4. **Deploy**.
5. O `vercel.json` já registra o cron diário (`0 9 * * *`) em
   `/api/cron/agendamentos`. Confirme em Vercel → Settings → Cron Jobs.
   Plano Hobby permite cron **uma vez por dia** — suficiente para agendamentos.
6. Volte no Supabase e ajuste **Site URL** e **Redirect URLs** para o domínio
   `.vercel.app`, incluindo `https://SEU-PROJETO.vercel.app/auth/callback`.
7. Refaça o roteiro de teste no domínio publicado.

## Passo 7 — Depois do deploy

- **Domínio próprio**: Vercel → Settings → Domains. Aponte o DNS conforme instruído.
  Depois atualize `NEXT_PUBLIC_SITE_URL` e as Redirect URLs no Supabase.
  Variável alterada exige **redeploy** (elas são fixadas no build).
- **Backup**: Supabase → Database → Backups (diário no free, retenção curta).
  Exporte o schema periodicamente também.
- **Cron / pausa**: se o site ficar parado e o Supabase pausar, um ping diário resolve.

---

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| "Configure NEXT_PUBLIC_SUPABASE_URL..." | `.env.local` ausente ou ainda com placeholder |
| Login funciona e `/admin` redireciona pra `/conta` | `profiles.is_admin` ainda é `false` |
| E-mail de confirmação não chega | SMTP próprio não configurado, ou caiu no spam |
| Link de confirmação dá erro | URL fora das Redirect URLs, ou aberto em outro navegador |
| `/admin` mostra erro de permissão ao aprovar | `supabase/admin.sql` não foi rodado |
| Cliente não consegue sacar nem enviar PIX | KYC não aprovado — é o comportamento esperado; aprove em `/admin/kyc` |
| Upload de documento falha | Falta o `Content-Type` correto, ou o arquivo passa de 10 MB / não é jpeg, png, webp ou pdf |
| "Direct deletion from storage tables is not allowed" | Apague arquivos pela Storage API, nunca por SQL em `storage.objects` |
| Variável nova não tem efeito na Vercel | mudou depois do build — precisa de redeploy |

---

## Referências

- [Vercel — Environment Variables](https://vercel.com/docs/environment-variables)
- [Supabase — Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase — recuperação de senha](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
- [Supabase — SMTP customizado](https://supabase.com/docs/guides/auth/auth-smtp)
