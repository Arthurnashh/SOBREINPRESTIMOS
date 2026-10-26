import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/account";
import { date } from "@/lib/format";

type RegisteredUser = {
  id: string;
  full_name: string;
  cpf: string;
  phone: string | null;
  is_admin: boolean;
  created_at: string;
};

const PAGE_SIZE = 25;
function pageHref(page: number, q: string) {
  return `/admin/usuarios?${new URLSearchParams({ pagina: String(page), ...(q ? { q } : {}) })}`;
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; pagina?: string }> }) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").trim().slice(0, 80);
  const requested = Number(params.pagina ?? 1);
  const page = Number.isSafeInteger(requested) && requested > 0 && requested <= 1000000 ? requested : 1;

  let query = supabase.from("profiles").select("id, full_name, cpf, phone, is_admin, created_at", { count: "exact" });
  if (q) {
    const digits = q.replace(/\D/g, "");
    // Apenas dígitos entram na expressão OR; buscas textuais usam o filtro estruturado.
    if (/^[\d\s.()+-]+$/.test(q) && digits) query = query.or(`cpf.ilike.%${digits}%,phone.ilike.%${digits}%`);
    else query = query.ilike("full_name", `%${q.replace(/[%_]/g, "")}%`);
  }
  const { data: users, count, error } = await query
    .order("created_at", { ascending: false }).order("id", { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1).returns<RegisteredUser[]>();
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  if (!error && page > pages) redirect(pageHref(pages, q));

  return <div className="stack" style={{ ["--gap" as string]: "24px" }}>
    <div>
      <h1 className="page-title">Usuários cadastrados</h1>
      <p className="muted">Todos os perfis, incluindo quem ainda não solicitou um empréstimo.</p>
    </div>
    <form action="/admin/usuarios" method="get" className="card user-search">
      <div className="field">
        <label htmlFor="q">Buscar por nome, CPF ou telefone</label>
        <input id="q" name="q" defaultValue={q} maxLength={80} placeholder="Nome, CPF ou telefone" type="search" />
      </div>
      <button className="btn btn-primary">Buscar</button>
      {q && <Link href="/admin/usuarios" className="btn btn-ghost">Limpar</Link>}
    </form>
    <section className="card stack">
      {error ? <div className="alert alert-err" role="alert">Não foi possível carregar os usuários. Tente novamente em instantes.</div> : <>
        <p><strong>{count ?? 0}</strong> {q ? "usuário(s) encontrado(s)" : "usuário(s) cadastrado(s)"}</p>
        {!users?.length ? <div className="empty">{q ? "Nenhum usuário corresponde à busca." : "Nenhum usuário cadastrado."}</div> :
          <div className="table-scroll"><table className="users-table">
            <caption className="sr-only">Lista de usuários cadastrados</caption>
            <thead><tr><th scope="col">Nome</th><th scope="col">CPF mascarado</th><th scope="col">Telefone</th><th scope="col">Cadastro</th><th scope="col">Perfil</th></tr></thead>
            <tbody>{users.map((u) => <tr key={u.id}>
              <th scope="row">{u.full_name}</th>
              <td>***.***.{u.cpf.slice(-5, -2)}-{u.cpf.slice(-2)}</td>
              <td>{u.phone ?? "Não informado"}</td>
              <td>{date(u.created_at)}</td>
              <td><span className={`badge ${u.is_admin ? "b-aprovado" : "b-cancelado"}`}>{u.is_admin ? "Administrador" : "Cliente"}</span></td>
            </tr>)}</tbody>
          </table></div>}
        <nav className="pagination" aria-label="Páginas de usuários">
          {page > 1 && <Link href={pageHref(page - 1, q)} className="btn btn-ghost">Anterior</Link>}
          <span className="fine">Página {page} de {pages}</span>
          {page < pages && <Link href={pageHref(page + 1, q)} className="btn btn-ghost">Próxima</Link>}
        </nav>
      </>}
    </section>
  </div>;
}
