import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

const AUTH_PAGES = ["/entrar", "/cadastro"];

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  let redirectTo: URL | null = null;

  if (!user && (path.startsWith("/conta") || path.startsWith("/admin"))) {
    redirectTo = new URL("/entrar", request.url);
    redirectTo.searchParams.set("next", path);
  } else if (user && AUTH_PAGES.includes(path)) {
    redirectTo = new URL("/conta", request.url);
  }

  if (redirectTo) {
    const redirect = NextResponse.redirect(redirectTo);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/conta/:path*", "/admin/:path*", "/entrar", "/cadastro", "/esqueci-senha", "/redefinir-senha"],
};
