import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { SESSION_MAX_AGE_SECONDS, supabaseAnonKey, supabaseUrl } from "./env";

/** Percorsi raggiungibili senza sessione. */
const PUBLIC_PATHS = ["/accesso", "/privacy", "/api/auth/pin", "/api/ical/", "/api/cron/", "/dev/"];

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`),
  );
}

/** Rinnova la sessione Supabase e rimanda all'accesso chi non è autenticato. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookieOptions: { maxAge: SESSION_MAX_AGE_SECONDS },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Non inserire codice tra createServerClient e getClaims: serve a rinnovare la sessione.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname } = request.nextUrl;

  if (!signedIn && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/accesso";
    url.search = pathname === "/" ? "" : `?da=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  if (signedIn && pathname === "/accesso") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
