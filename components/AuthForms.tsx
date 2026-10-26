"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, resetPassword, signIn, signUp, type FormState } from "@/app/actions/auth";

function Feedback({ state }: { state: FormState }) {
  if (state?.error)
    return (
      <div className="alert alert-err" role="alert">
        {state.error}
      </div>
    );
  if (state?.message)
    return (
      <div className="alert alert-ok" role="status">
        {state.message}
      </div>
    );
  return null;
}

export function SignInForm({ next, notice }: { next: string; notice?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, undefined);
  return (
    <form action={action} className="card stack">
      <div>
        <h1>Entrar</h1>
        <p className="muted">Acesse sua conta e acompanhe seus pedidos.</p>
      </div>
      {notice && !state && <div className="alert alert-warn">{notice}</div>}
      <Feedback state={state} />
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.fields?.email} />
      </div>
      <div className="field">
        <label htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <button className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
      <p className="center"><Link href="/esqueci-senha">Esqueci minha senha</Link></p>
      <p className="center muted">
        Ainda não tem conta? <Link href="/cadastro">Cadastre-se</Link>
      </p>
    </form>
  );
}

function maskCpf(v: string) {
  return v
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

export function SignUpForm({ intent }: { intent?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signUp, undefined);
  const f = state?.fields ?? {};

  if (state?.message) {
    return (
      <div className="card stack">
        <h1>Confira seu e-mail</h1>
        <Feedback state={state} />
        <p className="muted">Depois de confirmar, você já pode enviar seu pedido de empréstimo.</p>
      </div>
    );
  }

  return (
    <form action={action} className="card stack">
      <div>
        <h1>Abra sua conta</h1>
        <p className="muted">Gratuito e sem nenhuma cobrança para pedir crédito.</p>
      </div>
      <Feedback state={state} />
      {intent && <input type="hidden" name="intent" value={intent} />}
      <div className="field">
        <label htmlFor="full_name">Nome completo</label>
        <input id="full_name" name="full_name" autoComplete="name" required defaultValue={f.full_name} />
      </div>
      <div className="row-2">
        <div className="field">
          <label htmlFor="cpf">CPF</label>
          <input
            id="cpf"
            name="cpf"
            inputMode="numeric"
            required
            defaultValue={f.cpf ? maskCpf(f.cpf) : undefined}
            onChange={(e) => (e.target.value = maskCpf(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="phone">Celular</label>
          <input
            id="phone"
            name="phone"
            inputMode="tel"
            autoComplete="tel-national"
            required
            defaultValue={f.phone ? maskPhone(f.phone) : undefined}
            onChange={(e) => (e.target.value = maskPhone(e.target.value))}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={f.email} />
      </div>
      <div className="field">
        <label htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        <span className="hint">Mínimo de 8 caracteres.</span>
      </div>
      <label className="checkbox">
        <input type="checkbox" name="terms" required />
        <span>
          Li e aceito os <Link href="/termos" target="_blank" rel="noopener noreferrer">Termos de Uso</Link> e
          a <Link href="/privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade</Link>.
        </span>
      </label>
      <button className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Criando conta…" : "Criar conta"}
      </button>
      <p className="center muted">
        Já tem conta? <Link href="/entrar">Entrar</Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm({ invalidLink }: { invalidLink?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestPasswordReset, undefined);
  return (
    <form action={action} className="card stack">
      <div>
        <h1>Recuperar senha</h1>
        <p className="muted">Informe o e-mail usado no cadastro.</p>
      </div>
      {invalidLink && !state && <div className="alert alert-warn" role="alert">O link expirou ou já foi utilizado. Solicite um novo abaixo.</div>}
      <Feedback state={state} />
      {!state?.message && <>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" autoComplete="email" maxLength={254} required defaultValue={state?.fields?.email} />
        </div>
        <button className="btn btn-primary btn-block" disabled={pending}>{pending ? "Solicitando…" : "Enviar link de recuperação"}</button>
      </>}
      <p className="fine">Abra o link neste mesmo navegador para concluir a recuperação com segurança.</p>
      <p className="center"><Link href="/entrar">Voltar para o login</Link></p>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPassword, undefined);
  return (
    <form action={action} className="card stack">
      <div><h1>Nova senha</h1><p className="muted">Escolha uma senha de 8 a 128 caracteres.</p></div>
      <Feedback state={state} />
      <div className="field">
        <label htmlFor="password">Nova senha</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
      </div>
      <div className="field">
        <label htmlFor="confirmation">Confirme a senha</label>
        <input id="confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
      </div>
      <button className="btn btn-primary btn-block" disabled={pending}>{pending ? "Salvando…" : "Salvar nova senha"}</button>
      <p className="center"><Link href="/esqueci-senha">Solicitar outro link</Link></p>
    </form>
  );
}
