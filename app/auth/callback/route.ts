import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { supabaseEnv } from "@/lib/supabase/server";
import { safeAuthNext } from "@/lib/auth-redirect";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const { searchParams } = requestUrl;
  const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? requestUrl.origin).origin;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "";
  const recovery = next === "/redefinir-senha";
  const target = recovery ? "/redefinir-senha" : safeAuthNext(next);
  const response = NextResponse.redirect(`${origin}${target}`);
  response.headers.set("Cache-Control", "no-store");

  if (code) {
    const { url, key } = supabaseEnv();
    // Vincula a sessão diretamente à resposta de redirecionamento.
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items: CookieToSet[]) => items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return response;
  }

  const failure = NextResponse.redirect(`${origin}${recovery ? "/esqueci-senha?erro=link" : "/entrar?erro=link"}`);
  failure.headers.set("Cache-Control", "no-store");
  response.cookies.getAll().forEach((cookie) => failure.cookies.set(cookie));
  return failure;
}
