# Pendências do SobreImpréstimos

Atualizado em 27/10/2026.

## Resumo

O redesign visual, o domínio canônico e a URL do webhook já estão configurados no projeto local. O que falta é publicar o código, ajustar os painéis externos, ativar o gateway PagueCom e validar o fluxo completo em produção.

> O token do webhook não deve ser colocado neste arquivo nem no Git. A URL completa, com o token, aparece em **Admin → Configuração do gateway**.

---

## 1. Publicar as alterações

As mudanças ainda estão locais e não commitadas.

- [ ] Revisar o diff completo:
  ```bash
  git diff
  git status
  ```
- [ ] Rodar as verificações finais:
  ```bash
  npm run typecheck
  npm test
  npm run build
  ```
- [ ] Commitar as alterações do redesign e da configuração de domínio.
- [ ] Enviar para o repositório:
  ```bash
  git push origin main
  ```
- [ ] Confirmar que a Vercel gerou o deploy de produção sem erro.
- [ ] Abrir `https://site-pearl-nine-93.vercel.app` e confirmar que a versão nova está no ar.

---

## 2. Vercel — variável de ambiente

**Onde:** Vercel → projeto `site` → Settings → Environment Variables.

- [ ] Criar ou atualizar:
  ```text
  NEXT_PUBLIC_SITE_URL=https://site-pearl-nine-93.vercel.app
  ```
- [ ] Marcar os ambientes **Production** e **Preview**.
- [ ] Refazer o deploy depois de salvar.

Motivo: essa variável é usada nos links de autenticação e na geração da URL do webhook. Sem ela, o sistema usa o host da requisição.

Conferir também, se ainda não estiverem cadastradas:

- [ ] `SUPABASE_SERVICE_ROLE_KEY` como **Secret** — usada pelo webhook e pelo cron.
- [ ] `CRON_SECRET` como **Secret** — sem ela, `/api/cron/agendamentos` responde `503`.

> O CLI da Vercel está deslogado neste ambiente (`vercel whoami` retorna “Logged out”), por isso essa etapa precisa ser feita manualmente.

---

## 3. Supabase — URLs de autenticação

**Onde:** Supabase → Authentication → URL Configuration.

- [ ] **Site URL**:
  ```text
  https://site-pearl-nine-93.vercel.app
  ```
- [ ] **Redirect URLs**, adicionar:
  ```text
  https://site-pearl-nine-93.vercel.app/auth/callback
  https://site-pearl-nine-93.vercel.app/auth/callback?next=/redefinir-senha
  ```
- [ ] Manter também as URLs de `http://localhost:3000` se for continuar testando localmente.
- [ ] Conferir se a confirmação de e-mail está desligada, como o fluxo de cadastro espera.

Motivo: sem isso, confirmação de e-mail e recuperação de senha quebram com erro de redirect. O callback usa PKCE e precisa ser aberto no mesmo navegador que fez a solicitação.

> Não há `SUPABASE_ACCESS_TOKEN` no ambiente para alterar isso via API. A alteração precisa ser feita no painel.

---

## 4. PagueCom — gateway e webhook

**Situação atual no banco:** gateway `paguecom`, ambiente `producao`, `api_key` vazia, `enabled = false` e `webhook_token` já configurado.

### Ativar o gateway

- [ ] Obter a API key da conta PagueCom.
- [ ] Entrar em **Admin → Configuração do gateway**.
- [ ] Colar a API key.
- [ ] Selecionar o ambiente correto (`producao` ou `sandbox`).
- [ ] Ativar o gateway e salvar.

Sem a API key e sem `enabled = true`, a cobrança da taxa de confiança fica indisponível e a conta permanece bloqueada quando há taxa pendente.

### Webhook

O aplicativo já envia a `webhook_url` em cada nova cobrança. Portanto, para novas cobranças, **não é obrigatório** cadastrar um webhook global no painel do PagueCom.

- [ ] Se quiser usar o cadastro global do painel, copie a URL completa em **Admin → Configuração do gateway**.
- [ ] Cadastre a URL no painel PagueCom.
- [ ] Assine os eventos:
  ```text
  charge.paid
  charge.expired
  ```
- [ ] Confirme que o endpoint responde. A base é:
  ```text
  https://site-pearl-nine-93.vercel.app/api/paguecom/webhook
  ```

O token é validado pelo parâmetro `?token=...`. A URL completa só deve ser copiada do painel admin; não coloque o token no repositório.

> O painel do PagueCom exige sessão da conta. Este ambiente não tem acesso a essa conta.

---

## 5. Dados legais e conteúdo

**Onde:** Vercel → Environment Variables (e `.env.local` para testes locais).

- [ ] Preencher o CNPJ real:
  ```text
  NEXT_PUBLIC_EMPRESA_CNPJ=
  ```
- [ ] Substituir o nome genérico da instituição parceira:
  ```text
  NEXT_PUBLIC_INSTITUICAO_PARCEIRA=Nome da instituição financeira parceira autorizada pelo Banco Central
  ```
- [ ] Confirmar a taxa mensal real do produto:
  ```text
  NEXT_PUBLIC_TAXA_MENSAL=0.0399
  ```
- [ ] Configurar o canal de privacidade, se aplicável:
  ```text
  NEXT_PUBLIC_PRIVACIDADE_EMAIL=
  ```
- [ ] Revisar o rodapé e as páginas legais com os dados reais.

---

## 6. Conta digital / PIX (somente se for operar de verdade)

Hoje o projeto está em modo demonstração:

```text
BAAS_PROVIDER=demo
BAAS_API_URL=
BAAS_API_KEY=
```

- [ ] Se o site for movimentar dinheiro real, trocar para o provedor parceiro.
- [ ] Configurar `BAAS_API_URL` e `BAAS_API_KEY`.
- [ ] Validar saldo, PIX, boleto e bloqueios com o provedor.

Se a operação continuar demonstrativa, manter `demo` e deixar claro no site.

---

## 7. Validação pós-deploy

- [ ] Home responde `200` no domínio de produção.
- [ ] Layout mobile em 390 px e tablet em 768 px sem rolagem horizontal.
- [ ] Cadastro de uma conta nova.
- [ ] Login e logout.
- [ ] Recuperação de senha: o link abre no domínio correto.
- [ ] `/admin/config` mostra a URL do webhook com `https://site-pearl-nine-93.vercel.app`.
- [ ] Criar uma cobrança PIX de teste.
- [ ] Pagar a cobrança e confirmar que a conta é liberada.
- [ ] Simular cobrança expirada e confirmar que a conta continua bloqueada.
- [ ] Conferir os logs da Vercel e do Supabase sem erros.

---

## 8. Observações

- `.env.local` não é versionado. Tudo que for necessário em produção precisa ser cadastrado na Vercel.
- As alterações do redesign e da configuração de domínio ainda não foram commitadas.
- O servidor local está em `http://localhost:3000`.
- O webhook de produção já foi testado e respondeu:
  ```json
  {"ok":true,"ignored":true}
  ```
