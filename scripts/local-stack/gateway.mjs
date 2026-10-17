// Gateway minimale al posto di Kong per lo stack Supabase locale (solo node:http).
//   /rest/v1/*  → PostgREST (prefisso rimosso)
//   /auth/v1/*  → GoTrue    (prefisso rimosso)
//   /storage/v1, /realtime/v1 → 404 JSON (non disponibili in locale)
// Come Kong: se c'è `apikey` ma manca `Authorization`, imposta `Authorization: Bearer <apikey>`.
import http from "node:http";

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const UPSTREAMS = {
  "/rest/v1": { host: "127.0.0.1", port: Number(process.env.POSTGREST_PORT ?? 3001) },
  "/auth/v1": { host: "127.0.0.1", port: Number(process.env.AUTH_PORT ?? 9999) },
};
const ALLOWED_ORIGINS = new Set(
  (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000").split(","),
);
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers":
      req.headers["access-control-request-headers"] ??
      "authorization,apikey,content-type,prefer,range,accept-profile,content-profile,x-client-info,x-supabase-api-version",
    "access-control-expose-headers":
      "content-range,content-location,content-profile,preference-applied,x-supabase-api-version,location",
    "access-control-max-age": "3600",
    vary: "Origin",
  };
}

function sendJson(req, res, status, body) {
  res.writeHead(status, { "content-type": "application/json", ...corsHeaders(req) });
  res.end(JSON.stringify(body));
}

function handle(req, res) {
  const url = new URL(req.url ?? "/", "http://gateway");

  if (req.method === "OPTIONS" && req.headers.origin) {
    res.writeHead(204, corsHeaders(req));
    return res.end();
  }

  if (url.pathname === "/" || url.pathname === "/health") {
    return sendJson(req, res, 200, { status: "ok", gateway: "retail-hub local stack" });
  }

  const prefix = Object.keys(UPSTREAMS).find(
    (p) => url.pathname === p || url.pathname.startsWith(p + "/"),
  );
  if (!prefix) {
    const service = url.pathname.split("/").slice(1, 3).join("/");
    return sendJson(req, res, 404, {
      message: `Servizio non disponibile nello stack locale: /${service}`,
      error: "not_found",
    });
  }

  const upstream = UPSTREAMS[prefix];
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(k) && k !== "host") headers[k] = v;
  }
  if (headers.apikey && !headers.authorization) headers.authorization = `Bearer ${headers.apikey}`;
  headers.host = `${upstream.host}:${upstream.port}`;
  headers["x-forwarded-host"] = req.headers.host ?? `localhost:${PORT}`;
  headers["x-forwarded-proto"] = "http";
  headers["x-forwarded-prefix"] = prefix;
  const ip = req.socket.remoteAddress ?? "";
  headers["x-forwarded-for"] = req.headers["x-forwarded-for"]
    ? `${req.headers["x-forwarded-for"]}, ${ip}`
    : ip;

  const path = url.pathname.slice(prefix.length) || "/";
  const proxyReq = http.request(
    { ...upstream, method: req.method, path: path + url.search, headers },
    (proxyRes) => {
      const out = {};
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (!HOP_BY_HOP.has(k) && !k.startsWith("access-control-")) out[k] = v;
      }
      res.writeHead(proxyRes.statusCode ?? 502, { ...out, ...corsHeaders(req) });
      proxyRes.pipe(res);
    },
  );
  proxyReq.on("error", (err) => {
    if (res.headersSent) return res.destroy(err);
    sendJson(req, res, 502, { message: `Upstream ${prefix} non raggiungibile: ${err.message}` });
  });
  req.pipe(proxyReq);
}

// "localhost" può risolvere sia a 127.0.0.1 sia a ::1: ascoltiamo su entrambi (solo loopback).
const servers = [];
for (const host of ["127.0.0.1", "::1"]) {
  const server = http.createServer(handle);
  server.on("error", (err) => {
    if (host === "::1") console.warn(`IPv6 non disponibile (${err.code}): solo 127.0.0.1`);
    else throw err;
  });
  server.listen(PORT, host, () => console.log(`gateway in ascolto su http://[${host}]:${PORT}`));
  servers.push(server);
}
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    for (const s of servers) s.close();
    process.exit(0);
  });
}
