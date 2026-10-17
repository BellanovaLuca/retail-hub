# Portale Staff Cordusio — note per Claude Code

- La specifica completa è in `docs/SPEC.md`: leggila prima di lavorare. Si procede per milestone (§15), un commit per milestone.
- Interfaccia in **italiano**, fuso **Europe/Rome**, settimane **lunedì → domenica** (`lib/dates.ts`).
- Stack: Next.js 15 App Router + TypeScript strict, Tailwind v4, Supabase (`@supabase/ssr`), zod, Vitest. Niente ORM.
- Migrazioni SQL in `supabase/migrations/`, RLS attivo su tutte le tabelle. Dopo ogni migrazione aggiorna `lib/supabase/database.types.ts`.
- Le modifiche passano da Server Actions con validazione zod; RLS è la difesa finale. La service role (`lib/supabase/admin.ts`) solo lato server.
- Design §9: bianco e nero, nessun colore d'accento; token in `app/globals.css`, componenti in `components/ui/`.

Prima di ogni commit:

```sh
pnpm lint && pnpm typecheck && pnpm test
DATABASE_URL=postgres://… pnpm test:db   # migrazioni + RLS su un Postgres usa-e-getta
```
