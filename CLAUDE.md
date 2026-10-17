# Portale Staff Cordusio — note per Claude Code

- La specifica completa è in `docs/SPEC.md`: leggila prima di lavorare. Si procede per milestone (§15).
- Interfaccia, commenti e messaggi di commit in **italiano**. Fuso **Europe/Rome**, settimane **lunedì → domenica** (`lib/dates.ts`, `lib/domain/time.ts`).
- Stack: Next.js 15 App Router + TypeScript strict, Tailwind v4, Supabase (`@supabase/ssr`), zod, Vitest. Niente ORM.

## Database

- Migrazioni SQL in `supabase/migrations/`, RLS attivo su tutte le tabelle. Lo schema di dominio completo è già in `20261017010000_domain.sql`.
- I tipi `lib/supabase/database.types.ts` sono GENERATI: `DATABASE_URL=postgres://postgres:postgres@localhost:5432/retail_dev pnpm db:types:local`. Alias comodi in `lib/supabase/types.ts`.
- I dipendenti non leggono la tabella `shifts` (solo admin): leggono la vista `published_shifts` (istantanea dell'ultima pubblicazione). Assenze altrui: vista `leaves_public` ("ferie"/"assente", mai il motivo). Performance propria: vista `my_performance_goals`.
- Transizioni dei dipendenti su dati condivisi: funzioni RPC security definer (`cancel_request`, `respond_to_swap`, `set_performance_note`, `set_extra_task_done`).

## Codice

- Server Actions: `"use server"`, validazione zod, `runAction(async () => { const { supabase, profile } = await adminAction() /* o authedAction() */ ... })` da `lib/auth/guards.ts`, risultato `ActionResult<T>` (`{ ok, message, data?, fieldErrors? }`). Dopo le scritture `revalidatePath`.
- Pagine: Server Components che caricano i dati con il client di `lib/supabase/server.ts`; guardie `requireProfile()` / `requireAdmin()` da `lib/auth/session.ts`. Client component solo dove serve interazione.
- Service role (`lib/supabase/admin.ts`) solo lato server e solo quando RLS non basta (creazione utenti, notifiche, cron).
- Notifiche: `notify(profileIds, { kind, title, body, link })` / `notifyEach` / `adminIds()` da `lib/notifications.ts`.
- Logica pura (testata): `lib/shifts/*`, `lib/hours.ts`, `lib/coverage.ts`, `lib/rules/*`, `lib/leaves/parse.ts`, `lib/targets.ts`, `lib/schedule/*`. Caricamento dati: `lib/data/*`.
- UI (§9 bianco e nero, nessun colore d'accento): `components/ui/` (Button, Input/Label, Field/Select/Checkbox/Switch/Textarea/FormMessage, Card/CardTitle, Badge, Dialog, Table/Th/Td/PersonDot, PageHeader/EmptyState/Skeleton), `components/layout/` (SubNav, ComingSoon), griglia Excel `components/spreadsheet/` (`SpreadsheetGrid`). Token colore in `app/globals.css` (`text-muted`, `border-line`, `bg-surface`, `text-danger/success/warning`, `bg-vista/bg-sole`, utility `eyebrow`, `nums`, `hatch`).
- Export: exceljs (SheetJS non è raggiungibile dal proxy) e `@react-pdf/renderer`.

## Sviluppo locale e verifiche

- Stack Supabase senza Docker: `scripts/local-stack/` (README). Gateway su http://localhost:54321, DB `retail_dev`; `.env.local` generato da `scripts/local-stack/env.sh`.
- Account di prova: `ADM-001` / `39182746` (admin); `pnpm seed:dev` crea DEV-001…008 (PIN provvisorio `482913`, admin DEV-001/002 con `39182746`).
- Playwright: Chromium in `/opt/pw-browsers`.

Prima di ogni commit:

```sh
pnpm lint && pnpm typecheck && pnpm test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/retail_test pnpm test:db   # DB usa-e-getta
```
