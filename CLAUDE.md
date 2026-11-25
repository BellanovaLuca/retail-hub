# Portale Staff Cordusio — note per Claude Code

- La specifica completa è in `docs/SPEC.md`: leggila prima di lavorare. Si procede per milestone (§15).
- Interfaccia, commenti e messaggi di commit in **italiano**. Fuso **Europe/Rome**, settimane **lunedì → domenica** (`lib/dates.ts`, `lib/domain/time.ts`).
- Stack: Next.js 15 App Router + TypeScript strict, Tailwind v4, Supabase (`@supabase/ssr`), zod, Vitest. Niente ORM.

## Database

- Migrazioni SQL in `supabase/migrations/`, RLS attivo su tutte le tabelle. Lo schema di dominio completo è già in `20261017010000_domain.sql`.
- I tipi `lib/supabase/database.types.ts` sono GENERATI: `DATABASE_URL=postgres://postgres:postgres@localhost:5432/retail_dev pnpm db:types:local`. Alias comodi in `lib/supabase/types.ts`.
- I dipendenti non leggono la tabella `shifts` (solo admin): leggono la vista `published_shifts` (istantanea dell'ultima pubblicazione). Assenze altrui: vista `leaves_public` ("ferie"/"assente", mai il motivo). Performance propria: vista `my_performance_goals`.
- Responsabilità: assegnazione per settimana, per persona e per giorno, in `responsibility_week_assignments` (`profile_ids` + `person_days` = `{ profilo: [1…7] }`; vale anche per le settimane seguenti finché non si cambia); `getResponsibilities(db, { week })` la applica (gruppo in `supports`, `weekly: true`, `personDays`, `scheduleDays` = unione dei giorni assegnati), senza `week` restano responsabile/supporti della scheda. Giorni di una persona: `daysOfPerson` / `personDaysOf` (`lib/responsibilities/assignment.ts`). Il gruppo in vigore lo calcola il DB (`responsibility_week_teams(p_week)`); la spunta spetta a chi è assegnato quel giorno (`is_responsibility_assignee_on`). Area admin: `WeekPlanner` (elenco responsabilità + caselle persona × giorno, aggiunge/toglie) e `CheckMonitor` (controllo spunte persone × attività per giorno); riepilogo per tutti `WeekDayGrid` (persone × giorni).
- Serve un profilo attivo CON primo accesso completato per qualunque riga: policy restrittiva «solo profili attivi» su ogni tabella (una tabella nuova deve averla) e `is_staff()` nelle letture comuni; prima del primo accesso si legge solo il proprio profilo (`is_active_account()`). Le viste sono di sola lettura: una vista nuova nasce con `revoke all … ; grant select … to authenticated, service_role` (altrimenti è scrivibile e scavalca la RLS). Funzioni security definer: `is_staff()` come prima condizione. Note riservate degli admin: tabella `profile_admin_notes` (mai colonne riservate su `profiles`: la RLS è per riga).
- Operazioni admin atomiche via RPC: `replace_shift_days`, `remove_future_shifts`, `remove_leave_days`, `set_default_rule_set`. Accesso: `login_attempt_begin` (solo service role; blocco 15 minuti + tetto nelle 24 ore, `reached_limit` → notifica `login_locked` agli admin). Altre RPC admin: `refresh_shift_conflicts`, `remove_from_responsibilities`; per tutti `store_weekly_assigned`.
- Obiettivi: il foglio di ciascuno segue il gruppo di voci della sua area (`kpi_sets` «Vista»/«Sole», jolly con il Vista) più gli obiettivi misti assegnati nella settimana; `profile_kpis` solo per personalizzazioni fatte a mano. Assegnazione: due tabelle per area con soli valori scritti (`TargetsTable`), proposte su richiesta (`fillProposals`).
- Transizioni dei dipendenti su dati condivisi: funzioni RPC security definer (`cancel_request`, `respond_to_swap`, `set_performance_note`, `set_extra_task_done`).

## Codice

- Server Actions: `"use server"`, validazione zod, `runAction(async () => { const { supabase, profile } = await adminAction() /* o authedAction() */ ... })` da `lib/auth/guards.ts`, risultato `ActionResult<T>` (`{ ok, message, data?, fieldErrors? }`). Dopo le scritture `revalidatePath`.
- Pagine: Server Components che caricano i dati con il client di `lib/supabase/server.ts`; guardie `requireProfile()` / `requireAdmin()` da `lib/auth/session.ts`. Client component solo dove serve interazione.
- `authedAction()`/`adminAction()` richiedono il primo accesso completato (PIN personale + informativa). Sessione: al massimo 30 giorni dall'accesso con il PIN (`lib/auth/session-age.ts` nel middleware) e solo se registrata dall'accesso dell'app (`login_sessions`, `lib/auth/login-sessions.ts`): `session_fresh()` dentro `is_staff()`/`is_admin()` nel DB. Chi apre una sessione in altro modo deve registrarla, chi la chiude (uscita, reset PIN) toglie la riga. Letture che possono superare 1000 righe: `fetchAllRows` di `lib/data/paginate.ts`.
- Service role (`lib/supabase/admin.ts`) solo lato server e solo quando RLS non basta (creazione utenti, notifiche, cron).
- Notifiche: `notify(profileIds, { kind, title, body, link })` / `notifyEach` / `adminIds()` da `lib/notifications.ts`.
- Logica pura (testata): `lib/shifts/*`, `lib/hours.ts`, `lib/coverage.ts`, `lib/rules/*`, `lib/leaves/parse.ts`, `lib/targets.ts`, `lib/schedule/*`, `lib/kpi/*` (obiettivi per area: `area-tables.ts`), `lib/requests/calendar.ts`, `lib/daily-quote.ts`. Caricamento dati: `lib/data/*`.
- UI (§9 bianco e nero, nessun colore d'accento): `components/ui/` (Button, Input/Label, Field/Select/Checkbox/Switch/Textarea/FormMessage, Card/CardTitle, Badge, Dialog, Table/Th/Td/PersonDot, PageHeader/EmptyState/Skeleton), `components/layout/` (SubNav, ComingSoon), griglia Excel `components/spreadsheet/` (`SpreadsheetGrid`). Token colore in `app/globals.css` (`text-muted`, `border-line`, `bg-surface`, `text-danger/success/warning`, `bg-vista/bg-sole`, utility `eyebrow`, `nums`, `hatch`).
- Export: exceljs (SheetJS non è raggiungibile dal proxy) e `@react-pdf/renderer`.

## Sviluppo locale e verifiche

- Stack Supabase senza Docker: `scripts/local-stack/` (README). Gateway su http://localhost:54321, DB `retail_dev`; `.env.local` generato da `scripts/local-stack/env.sh`.
- Account di prova: `ADM-001` / `39182746` (admin); `pnpm seed:dev` crea DEV-001…008 (PIN provvisorio `482913`, admin DEV-001/002 con `39182746`).
- Playwright: Chromium in `/opt/pw-browsers`.

`pnpm check:lockout` prova il blocco dei tentativi di accesso con richieste parallele (serve lo stack locale).

Prima di ogni commit:

```sh
pnpm lint && pnpm typecheck && pnpm test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/retail_test pnpm test:db   # DB usa-e-getta (solo locale, nome con "test")
```
