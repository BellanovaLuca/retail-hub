# Portale Staff · Salmoiraghi & Viganò Piazza Cordusio

Web app installabile sul telefono per lo staff del negozio: **turni**, **ferie**, **richieste**,
**obiettivi individuali**, **performance**, **comunicazioni e responsabilità**. Sostituisce i file
Excel e i messaggi. La specifica completa è in [`docs/SPEC.md`](docs/SPEC.md).

## Cosa c'è

| Area          | Per i dipendenti                                                                   | Per gli amministratori                                                                                 |
| ------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Accesso       | Codice dipendente + PIN, primo accesso guidato, sessione di 30 giorni              | Creazione account, PIN provvisori, reset, disattivazione                                               |
| Turni         | I miei orari (settimana/mese), griglia del negozio, calendario sul telefono (iCal) | Foglio stile Excel (persone × giorni e foglio orario "Week"), pubblicazione, modelli, export PDF/Excel |
| Coperture     | —                                                                                  | Regole e variabili configurabili, avvisi in griglia, anteprima delle violazioni                        |
| Ferie         | Planning del negozio (senza motivi), le mie ferie                                  | Foglio annuale (calendario e persone × giorni), soglie per reparto, export                             |
| Richieste     | Ferie, permessi, cambi e scambi di turno, malattia…                                | Approvazioni con effetto sulla copertura, scambi applicati e pubblicati subito                         |
| Obiettivi     | Compilazione giornaliera dal telefono (− / +), a quanto sei / quanto ti manca      | Assegnazione dalle ore pianificate, commenti, monitoraggio, best performer, export                     |
| Performance   | I miei 3 + 3 obiettivi dell'anno, la mia nota                                      | Tabella annuale, pubblicazione, copia dall'anno precedente                                             |
| Comunicazioni | Bacheca, conferma di lettura, Responsabilità con spunta, "Oggi tocca a te"         | Editor con destinatari e programmazione, letture e solleciti, tabellone, attività extra                |
| Notifiche     | In-app, push sul telefono, email facoltativa                                       | Promemoria automatici (19:30, sera prima, giovedì, responsabilità)                                     |

## Messa online, passo per passo

Servono tre account gratuiti: **GitHub** (questo repository), **Supabase** (il database) e
**Vercel** (il sito). Tempo: circa un'ora la prima volta.

### 1. Database (Supabase)

1. Su [supabase.com](https://supabase.com) crea un progetto nella region **Central EU (Frankfurt)**.
   Annota la password del database.
2. **Authentication → Sign In / Providers**: disattiva _Allow new users to sign up_. Nel provider
   **Email** lascia attivo email/password e disattiva _Confirm email_ (le email sono interne).
3. **Authentication → Sessions** (se disponibile): durata della sessione 30 giorni.
4. Dal computer, nella cartella del progetto (serve Node.js 22 e pnpm):
   ```sh
   pnpm install
   npx supabase login
   npx supabase link --project-ref <id-del-progetto>
   npx supabase db push                 # crea tabelle, regole di sicurezza e bucket dei file
   ```
5. Apri **SQL Editor**, incolla il contenuto di `supabase/seed.sql` ed eseguilo (reparti, turni
   rapidi, festività, voci degli obiettivi, responsabilità iniziali).
6. **Project Settings → API**: copia _Project URL_, _anon key_ e _service_role key_.

### 2. Chiavi per le notifiche push

```sh
npx web-push generate-vapid-keys
```

Annota la _Public Key_ e la _Private Key_. Genera anche due segreti con `openssl rand -hex 32`: uno
per i promemoria automatici (`CRON_SECRET`) e uno per l'impronta dei PIN (`PIN_PEPPER`, da non
cambiare mai dopo i primi accessi).

### 3. Sito (Vercel)

1. Su [vercel.com](https://vercel.com): _Add New → Project_ → importa questo repository.
2. In _Environment Variables_ inserisci (vedi `.env.example`):

   | Variabile                                | Valore                                                                  |
   | ---------------------------------------- | ----------------------------------------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`               | Project URL di Supabase                                                 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY`          | anon key                                                                |
   | `SUPABASE_SERVICE_ROLE_KEY`              | service_role key (**mai** condividerla)                                 |
   | `NEXT_PUBLIC_APP_URL`                    | l'indirizzo del sito, es. `https://staff-cordusio.vercel.app`           |
   | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | le chiavi del passo 2                                                   |
   | `CRON_SECRET`                            | il segreto del passo 2                                                  |
   | `PIN_PEPPER`                             | un altro segreto (`openssl rand -hex 32`): entra nell'impronta dei PIN  |
   | `RESEND_API_KEY`, `EMAIL_FROM`           | facoltative, solo se volete le email ([resend.com](https://resend.com)) |

3. _Deploy_. Ogni branch ha la sua anteprima; il branch di produzione è quello impostato in
   _Settings → Git_ (per questo repository `claude/new-repo-spec-cwmad4`).
4. Torna su Supabase → **Authentication → URL Configuration** e imposta _Site URL_ con l'indirizzo
   del sito.

### 4. Promemoria automatici

I promemoria (19:30 "compila la giornata", promemoria turno la sera prima, avviso del giovedì se la
settimana dopo non è pubblicata, responsabilità del giorno, riepilogo serale, comunicazioni
programmate) partono dall'indirizzo `/api/cron/run`, che si può chiamare spesso: ogni promemoria
parte una sola volta.

- `vercel.json` lo chiama già **due volte al giorno** (mattina e sera), il massimo del piano
  gratuito di Vercel.
- Per gli orari precisi (consigliato) attivalo ogni 15 minuti da Supabase: **Database →
  Extensions** abilita `pg_cron` e `pg_net`, salva il segreto nel Vault e pianifica la chiamata
  nello **SQL Editor** (il segreto resta cifrato, mai in chiaro nel job):
  ```sql
  select vault.create_secret('<CRON_SECRET>', 'cron_secret', 'Bearer per /api/cron/run');
  select cron.schedule(
    'portale-staff-promemoria',
    '*/15 * * * *',
    $$ select net.http_get(
         url := 'https://<indirizzo-del-sito>/api/cron/run',
         headers := jsonb_build_object(
           'Authorization',
           'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
         ),
         timeout_milliseconds := 30000
       ) $$
  );
  ```

### 5. Primo amministratore

Copia `.env.example` in `.env.local`, compila le chiavi Supabase, poi:

```sh
FIRST_ADMIN_CODE=ADM-001 FIRST_ADMIN_PIN=<almeno 8 cifre> pnpm seed:admin
```

Accedi al sito con quel codice e PIN e accetta l'informativa privacy.

### 6. Aggiungere i dipendenti

1. **Admin → Dipendenti → Nuovo dipendente**: nome, cognome, **nome visualizzato** (unico: es.
   "Francesca", "Francy", "Fra R."), reparti (con il principale), area Vista/Sole/Jolly, ore
   settimanali.
2. Il sistema genera il **codice** (es. `CRD-014`) e un **PIN provvisorio**, visibile una sola
   volta: premi **Copia messaggio** e mandalo alla persona (WhatsApp, SMS…).
3. Al primo accesso la persona sceglie il suo PIN, aggiunge l'app alla schermata Home e attiva le
   notifiche. Su iPhone le notifiche funzionano solo dopo aver aggiunto l'app alla schermata Home.
4. PIN dimenticato: dalla scheda della persona, **Genera nuovo PIN**. Persona uscita: **Disattiva
   account** (lo storico resta).

### 7. Prime impostazioni

**Admin → Impostazioni**: orari di apertura ed eccezioni, turni rapidi (codici come in Excel),
festività e chiusure, preavviso minimo per le richieste, soglie ferie per reparto, logo, e le
**regole di pianificazione** (il set "Standard" è già pronto, da tarare).

### Sicurezza e privacy

- I permessi sono applicati dal database (Row Level Security), non solo dall'interfaccia: un
  dipendente non può leggere performance, richieste, note o dati di contratto altrui, né i turni non
  pubblicati. Per le assenze dei colleghi vede solo "Ferie" o "Assente".
- Il PIN non è mai salvato in chiaro; dopo 5 tentativi errati l'accesso si blocca per 15 minuti.
- Ogni modifica degli amministratori finisce nel **Registro modifiche**.
- Backup: Supabase li fa ogni giorno (piano gratuito: 7 giorni). Gli export Excel di turni, ferie
  e obiettivi sono un'ulteriore copia.
- Il testo dell'informativa (`/privacy`) va fatto rivedere al titolare del trattamento.

## Sviluppo

```sh
pnpm install
scripts/local-stack/setup.sh           # Supabase locale senza Docker (vedi scripts/local-stack/README.md)
scripts/local-stack/start.sh
scripts/local-stack/env.sh > .env.local
pnpm seed:admin && pnpm seed:dev       # admin ADM-001 / 39182746, persone inventate (tre "Francesca")
pnpm dev                               # http://localhost:3000 — guida di stile su /dev/design
```

Controlli:

```sh
pnpm lint && pnpm typecheck && pnpm test                 # unit (Vitest)
DATABASE_URL=postgres://…/db_usa_e_getta pnpm test:db    # migrazioni + RLS (svuota il DB!)
pnpm test:e2e                                            # Playwright, con lo stack locale acceso
DATABASE_URL=postgres://…/retail_dev pnpm db:types:local # rigenera i tipi dopo una migrazione
```

Struttura:

```
app/(auth)          accesso e primo accesso
app/(app)           area dipendente (tab bar su telefono, sidebar su desktop)
app/admin           area amministrazione
app/api             accesso con PIN, iCal, export PDF/Excel, cron
components/         ui/, layout/, spreadsheet/ (griglia stile Excel), schedule/, leaves/, …
lib/                logica di dominio pura e testata (turni, ore, coperture, regole, obiettivi…),
                    data/ (lettura dati), auth/, supabase/, cron/, export/
supabase/           migrations/, seed.sql, config.toml
scripts/            seed, generatore dei tipi, stack locale
tests/              unit/, db/ (RLS), e2e/ (Playwright)
```

Le convenzioni per chi sviluppa sono in [`CLAUDE.md`](CLAUDE.md).
