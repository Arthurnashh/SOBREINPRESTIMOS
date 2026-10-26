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

Os três são idempotentes (`if not exists` / `drop policy if exists` /
`create or replace`), então rodar de novo não quebra nada.

> **Ordem importa.** `bank.sql` redefine `handle_new_user()` para também abrir
> conta e cartão no cadastro. Rode-o por último.

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

Ao criar a conta pelo `/cadastro`, o trigger `handle_new_user()` já emite
a conta (agência `0001`) e o cartão virtual. Se a conta não existir por
qualquer motivo, `/conta/banco` abre na primeira visita.

> **`bank_move_for` move dinheiro em nome de outra pessoa** e por isso é
> restrita ao `service_role`. Se um cliente comum chamá-la, recebe `403`.
> É ela que credita o empréstimo liberado na conta do titular.

### Crédito do empréstimo

Quando o admin marca um pedido como **liberado** em `/admin/pedido/[id]`,
o valor cai na conta do cliente. A operação é **idempotente**: liberar duas
vezes não credita em dobro. Se aparecer "credito na conta falhou", rode a
liberação de novo com segurança.

Confira que os três schemas pegaram:

```sql
select
  (select count(*) from public.profiles)          as perfis,
  (select count(*) from public.bank_accounts)     as contas,
  (select count(*) from public.bank_cards)        as cartoes;
```

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
- [ ] `/conta/emprestimo` envia pedido e ele aparece em `/conta`
- [ ] receber pedido do mesmo cliente duas vezes dá "já tem um pedido em andamento"
- [ ] `/admin` lista o pedido (só com `is_admin = true`)
- [ ] aprovar com taxa de 3,99% a.m. calcula parcela, IOF e CET
- [ ] aprovar com 25% a.m. é **recusado** (teto de 20%)
- [ ] `/admin/usuarios` busca por nome, CPF e telefone
- [ ] `/esqueci-senha` envia link e o link redefine a senha

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

   | Nome | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxx.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | a anon key |
   | `NEXT_PUBLIC_SITE_URL` | `https://SEU-PROJETO.vercel.app` |
   | `NEXT_PUBLIC_EMPRESA_NOME` | nome real da empresa |
   | `NEXT_PUBLIC_EMPRESA_CNPJ` | CNPJ real |
   | `NEXT_PUBLIC_INSTITUICAO_PARCEIRA` | instituição parceira real |
   | `NEXT_PUBLIC_TAXA_MENSAL` | taxa real do produto, ex. `0.0399` |
   | `NEXT_PUBLIC_PRIVACIDADE_EMAIL` | canal real de privacidade |
   | `BAAS_PROVIDER` | `demo` |

   **Não cadastre `service_role` aqui.** Nada no código atual precisa dela em runtime.
4. **Deploy**.
5. Volte no Supabase e ajuste **Site URL** e **Redirect URLs** para o domínio `.vercel.app`.
6. Refaça o roteiro de teste no domínio publicado.

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
| Variável nova não tem efeito na Vercel | mudou depois do build — precisa de redeploy |

---

## Referências

- [Vercel — Environment Variables](https://vercel.com/docs/environment-variables)
- [Supabase — Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase — recuperação de senha](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
- [Supabase — SMTP customizado](https://supabase.com/docs/guides/auth/auth-smtp)
