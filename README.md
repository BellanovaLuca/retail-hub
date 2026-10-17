# Portale Staff · Salmoiraghi & Viganò Piazza Cordusio

Web app (installabile sul telefono) per lo staff del negozio: turni, ferie, richieste, obiettivi, performance e comunicazioni. La specifica completa è in [`docs/SPEC.md`](docs/SPEC.md).

## Stato

| Milestone                     | Contenuto                                                                                                                                       | Stato   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1 · Fondamenta                | Next.js, design system, `/dev/design`, Supabase SSR, migrazioni base, accesso con codice + PIN, primo accesso, ruoli, layout dipendente e admin | ✅      |
| 2 · Dipendenti e impostazioni |                                                                                                                                                 | da fare |
| 3–12                          | vedi `docs/SPEC.md` §15                                                                                                                         | da fare |

## Cosa serve

- Un account **GitHub** (questo repository)
- Un account **Supabase** (gratuito): il database
- Un account **Vercel** (gratuito): il sito
- Sul computer, solo per lo sviluppo: Node.js 22 e pnpm

## Messa online, passo per passo

### 1. Database (Supabase)

1. Su [supabase.com](https://supabase.com) crea un progetto nella region **EU (Frankfurt)**. Annota la password del database.
2. In **Authentication → Sign In / Providers**: disattiva _Allow new users to sign up_; nel provider **Email** lascia attivo email/password e disattiva _Confirm email_ (le email sono interne, nessuno le riceve).
3. Dal computer, nella cartella del progetto:
   ```sh
   pnpm install
   npx supabase login
   npx supabase link --project-ref <id-del-progetto>
   npx supabase db push            # crea le tabelle
   ```
4. Esegui `supabase/seed.sql` dall'**SQL Editor** di Supabase (reparti, turni rapidi, festività).
5. In **Project Settings → API** copia _Project URL_, _anon key_ e _service_role key_.

### 2. Primo amministratore

Crea un file `.env.local` copiando `.env.example`, compila le chiavi Supabase, poi:

```sh
FIRST_ADMIN_CODE=ADM-001 FIRST_ADMIN_PIN=<almeno 8 cifre> pnpm seed:admin
```

Al primo accesso con quel codice e PIN ti verrà chiesto di accettare l'informativa privacy.

### 3. Sito (Vercel)

1. Su [vercel.com](https://vercel.com) → _Add New Project_ → importa questo repository.
2. In _Environment Variables_ inserisci le variabili di `.env.example` (almeno le tre Supabase e `NEXT_PUBLIC_APP_URL`).
3. _Deploy_. Ogni branch ha la sua anteprima; `main` è la produzione.

### 4. Aggiungere i dipendenti

Da **Admin → Dipendenti** (milestone 2): crei la persona, il sistema genera codice e PIN provvisorio e prepara il messaggio da mandare con _Copia messaggio_. Al primo accesso il dipendente sceglie il suo PIN. Se lo dimentica, un admin ne genera uno nuovo.

## Sviluppo

```sh
pnpm install
cp .env.example .env.local      # chiavi di un progetto Supabase di sviluppo
pnpm seed:admin                 # primo admin
pnpm seed:dev                   # persone inventate, tre "Francesca" comprese
pnpm dev                        # http://localhost:3000 — guida di stile su /dev/design
```

Controlli da far passare a ogni milestone:

```sh
pnpm lint && pnpm typecheck && pnpm test
DATABASE_URL=postgres://utente:pwd@localhost:5432/db_di_prova pnpm test:db
```

`pnpm test:db` applica migrazioni e seed su un Postgres **usa e getta** (lo svuota!) e verifica le regole RLS: un dipendente non deve poter leggere i dati riservati degli altri.

## Struttura

```
app/(auth)        accesso e primo accesso
app/(app)         area dipendente (tab bar su mobile, sidebar su desktop)
app/admin         area amministrazione (solo ruolo admin)
app/api/auth/pin  accesso con codice + PIN, blocco dopo 5 tentativi errati
components/       ui/ (pulsanti, card…), layout/ (shell, navigazione)
lib/              auth/, supabase/, dates.ts, theme.ts
supabase/         migrations/, seed.sql, config.toml
scripts/          seed-admin, seed-dev
tests/            unit/ (Vitest), db/ (migrazioni + RLS)
```
