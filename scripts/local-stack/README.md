# Stack Supabase locale (senza Docker)

Per far girare l'app e i test end-to-end su un Postgres locale, senza la CLI di Supabase.
Componenti: Postgres 16 su `localhost:5432` (già installato), PostgREST v12, Supabase Auth
(GoTrue) e un piccolo gateway Node che fa le veci di Kong.

| Servizio  | Porta | Note                                                        |
| --------- | ----- | ----------------------------------------------------------- |
| Gateway   | 54321 | `/rest/v1` → PostgREST, `/auth/v1` → GoTrue, CORS per :3000 |
| PostgREST | 3001  | admin/health su 3002                                        |
| GoTrue    | 9999  | signup disabilitato, utenti via admin API                   |
| Postgres  | 5432  | database `retail_dev` (i test usano `retail_test`)          |

## Uso

```sh
scripts/local-stack/setup.sh               # binari, ruoli, db retail_dev, migrazioni, seed
scripts/local-stack/start.sh               # avvia PostgREST, GoTrue e gateway in background
scripts/local-stack/env.sh > .env.local    # variabili per Next.js e gli script di seed
pnpm seed:admin && pnpm seed:dev           # utenti di prova
pnpm dev
scripts/local-stack/stop.sh                # ferma i servizi (Postgres resta acceso)
scripts/local-stack/reset.sh               # ricrea retail_dev da zero (poi rifai i seed)
```

Tutti gli script sono idempotenti. Binari, chiavi, pid e log stanno in
`~/.cache/retail-hub-stack/` (`secrets.env` con JWT secret, chiavi `anon`/`service_role` e
password dei ruoli; `run/*.log` e `run/*.pid`). Le chiavi restano le stesse anche dopo
`reset.sh`; per rigenerarle cancella `secrets.env` e rilancia setup + env.

Versioni: `POSTGREST_VERSION` e `AUTH_VERSION` (vedi `lib.sh`) si possono sovrascrivere da ambiente.

## Limiti

- Niente Storage né Realtime: il gateway risponde 404 su `/storage/v1` e `/realtime/v1`,
  e la migrazione dei bucket viene saltata (schema `storage` assente).
- Nessun invio di email/SMS: le conferme sono automatiche (`GOTRUE_MAILER_AUTOCONFIRM`).
- Nessun Studio/pg-meta: per i tipi usa
  `DATABASE_URL=postgres://postgres:postgres@localhost:5432/retail_dev pnpm db:types:local`,
  per i dati `psql`.
- Solo per sviluppo: i servizi ascoltano su loopback e le chiavi sono locali.
