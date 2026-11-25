import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { isSessionExpired } from "@/lib/auth/session-age";
import { sessionCookieOptions, supabaseAnonKey, supabaseUrl } from "./env";

/** Intestazione di risposta con l'id di chi è collegato, letta dal service worker. */
export const USER_HEADER = "x-staff-user";

/** Percorsi raggiungibili senza sessione (`/dev/` solo in sviluppo: in produzione non esiste). */
const PUBLIC_PATHS = [
  "/accesso",
  "/privacy",
  "/api/auth/pin",
  "/api/ical/",
  "/api/cron/",
  ...(process.env.NODE_ENV === "production" ? [] : ["/dev/"]),
];

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`),
  );
}

/** Rinnova la sessione Supabase e rimanda all'accesso chi non è autenticato. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookieOptions: sessionCookieOptions(),
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
  const { pathname } = request.nextUrl;

  // Sessione più vecchia di 30 giorni dall'accesso (§4): si chiude e si rientra con il PIN.
  const expired =
    Boolean(data?.claims?.sub) && isSessionExpired(data?.claims, Math.floor(Date.now() / 1000));
  if (expired) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    // Se la chiusura non è riuscita (rete…) i cookie della sessione si tolgono comunque.
    for (const { name } of request.cookies.getAll()) {
      if (/^sb-.+-auth-token(\.\d+)?$/.test(name)) {
        request.cookies.delete(name);
        response.cookies.set(name, "", { path: "/", maxAge: 0 });
      }
    }
  }
  /** Riporta sulla risposta i cookie cambiati qui sopra (sessione rinnovata o chiusa). */
  const withCookies = (res: NextResponse) => {
    for (const cookie of response.cookies.getAll()) res.cookies.set(cookie);
    return res;
  };

  const userId = expired ? undefined : data?.claims?.sub;
  const signedIn = Boolean(userId);

  if (!signedIn && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return withCookies(
        NextResponse.json(
          { error: expired ? "Sessione scaduta" : "Non autenticato" },
          { status: 401 },
        ),
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/accesso";
    const params = new URLSearchParams();
    if (expired) params.set("scaduta", "1");
    if (pathname !== "/") params.set("da", pathname);
    url.search = params.size ? `?${params}` : "";
    return withCookies(NextResponse.redirect(url));
  }

  if (signedIn && pathname === "/accesso") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Il service worker lega la copia offline delle pagine a questa persona (public/sw.js).
  if (userId) response.headers.set(USER_HEADER, userId);
  return response;
}
