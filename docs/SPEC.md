# SPEC — Portale Staff · Salmoiraghi & Viganò Piazza Cordusio

> Documento per **Claude Code**. Leggilo tutto prima di scrivere codice, poi lavora per milestone (§15), un commit per milestone. Lingua dell'interfaccia: **italiano**. Fuso orario: **Europe/Rome**. Settimana: **lunedì → domenica**. Le domande ancora aperte sono in §17: dove c'è un'ipotesi, implementala in modo che sia facile cambiarla da Impostazioni.

------------------------------------------------------------------------

## 1. Obiettivo

Una web app (installabile sul telefono come app, PWA) per lo staff del negozio **Salmoiraghi & Viganò di Piazza Cordusio (Milano)**, circa **20 persone**. Sostituisce i file Excel e i messaggi per:

- **Turni**: pubblicazione degli orari, griglia generale del negozio stile Excel, i miei orari.
- **Ferie**: planning ferie annuale fatto **direttamente sul sito**, in un foglio stile Excel.
- **Richieste** dei dipendenti (ferie, permessi, cambi turno…) con approvazione.
- **Performance** (annuale): 3 obiettivi di **Achievement** + 3 obiettivi di **Leadership** per persona, fissati una volta all'anno, con commenti.
- **Obiettivi individuali** (settimanali): ogni dipendente compila **giorno per giorno** i propri numeri (WO, doppi, pezzi sole, META, demo, Transition, progressivi…) e vede "a quanto sei / quanto ti manca / obiettivo"; l'admin assegna gli obiettivi settimanali e scrive i **commenti della settimana** (§8.3).
- **Comunicazioni** al personale, con la sezione **Responsabilità**: chi si occupa di cosa in negozio (montaggi, WhatsApp, Customer Connect, magazzino, check WO…), con il responsabile, le persone di supporto e la spunta giornaliera quando l'attività è fatta, più le **attività extra** (§8.4).

### Reparti

Tre reparti semplici: **Management**, **Ottici**, **Addetti vendita**.

- Una persona **può appartenere a più reparti** (es. un manager che è anche ottico) → relazione molti-a-molti, con un **reparto principale** per l'ordinamento in griglia.
- Reparti, ruoli e ore contrattuali di ogni persona li inserisce **a mano l'amministratore**. Nessun numero di persone va cablato nel codice.
- **I manager fanno parte della copertura**: ogni manager è anche Ottico o Addetto vendita e conta come tale.

### Aree del negozio: Vista e Sole

Il negozio è diviso in due aree, **Vista** e **Sole**, come nei fogli settimanali attuali (colonne blu = Vista, arancioni = Sole).

- Ogni persona ha un'**area di base**: **Vista**, **Sole** oppure **Jolly**.
- Le persone **fisse** lavorano sempre nella loro area; i **jolly** vengono spostati in base alle necessità: per loro l'area si sceglie **turno per turno**.
- L'area serve per le coperture (§7), per l'ordine delle colonne nel foglio orario (§8.1) e per scegliere quali obiettivi individuali propone il sistema (§8.3).

### Omonimi

In negozio ci sono **tre persone di nome Francesca**. Mai identificare una persona dal solo nome: ogni dipendente ha un **nome visualizzato univoco** (es. "Francesca", "Francy", "Fra R.") scelto dall'admin.

------------------------------------------------------------------------

## 2. Stack tecnico

| Area            | Scelta                                                                                                                              |
|-----------------|-------------------------------------------------------------------------------------------------------------------------------------|
| Framework       | **Next.js 15** (App Router, Server Components, Server Actions), **TypeScript strict**                                               |
| UI              | **Tailwind CSS v4**, **shadcn/ui** (Radix) ristilizzato secondo §9, **lucide-react**, **framer-motion** (solo transizioni discrete) |
| Griglie         | **TanStack Table** + `@tanstack/react-virtual`, con un componente griglia "foglio di calcolo" condiviso (§8)                        |
| Form            | **react-hook-form** + **zod** (stessi schemi client/server)                                                                         |
| Date            | **date-fns** + `date-fns-tz`, locale `it`                                                                                           |
| Backend         | **Supabase**: Postgres, Auth, Row Level Security, Storage, Realtime                                                                 |
| Client Supabase | `@supabase/ssr` (sessione via cookie, middleware di refresh)                                                                        |
| Notifiche       | Web Push (VAPID) via service worker + notifiche in-app; email **facoltativa** tramite Resend solo per chi ha inserito un'email      |
| Export          | **SheetJS (`xlsx`)** per Excel, `@react-pdf/renderer` per PDF stampabili                                                            |
| Hosting         | **Vercel** (prod + preview per branch); dominio: per ora quello gratuito `*.vercel.app`                                             |
| Test            | **Vitest** (logica: coperture, ore, regole), **Playwright** (flussi e2e)                                                            |
| Qualità         | ESLint, Prettier, tipi generati con `supabase gen types`                                                                            |

Niente ORM. Migrazioni SQL in `supabase/migrations/` con la Supabase CLI.

------------------------------------------------------------------------

## 3. Ruoli e permessi

Solo **due ruoli**:

| Ruolo      | Chi                                                                                            | Può                                                                                                                                                                        |
|------------|------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `admin`    | Il titolare del progetto e **tutti i membri del Management** (l'admin assegna il ruolo a mano) | **Tutto**: turni, ferie, approvazioni, comunicazioni, performance di tutti, gestione dipendenti, impostazioni.                                                             |
| `employee` | Tutti gli altri                                                                                | Vede i propri turni, la griglia turni pubblicata del negozio, il planning ferie del negozio (in sola lettura), le comunicazioni, la **propria** performance. Fa richieste. |

Le regole di privacy sono applicate con **RLS** (non solo in UI):

- Un dipendente **non** vede la performance degli altri, le richieste altrui, le note riservate o i dati di contratto altrui.
- In griglia e nel planning ferie un'assenza appare come "Ferie" o "Assente": mai il motivo se è permesso o malattia.
- I turni in bozza (non pubblicati) sono invisibili ai dipendenti.
- Ogni azione degli admin finisce nel registro modifiche (§6.2), così con più admin si sa sempre chi ha fatto cosa.

------------------------------------------------------------------------

## 4. Accesso al sito: **codice dipendente + PIN**

Niente registrazione pubblica, niente email obbligatoria.

1.  L'admin crea il dipendente in *Admin → Dipendenti*. Il sistema genera un **codice dipendente** breve e leggibile (es. `CRD-014`, modificabile) e un **PIN provvisorio a 6 cifre**, mostrato **una sola volta** a schermo, con un pulsante "Copia messaggio" che prepara il testo da mandare al dipendente (link al sito + codice + PIN).
2.  Il dipendente entra con **codice + PIN**. Al **primo accesso** deve scegliere un nuovo PIN personale (6 cifre, non banale: niente `000000`, `123456`, date ovvie).
3.  Implementazione: ogni utente Supabase ha un'email sintetica interna `<codice>@staff.cordusio.local` e come password il PIN. L'email sintetica non compare mai in UI. Signup pubblico disabilitato.
4.  **Admin**: stesso metodo, ma con **PIN di almeno 8 cifre** (hanno accesso a tutto).
5.  **PIN dimenticato**: lo resetta un admin (nuovo PIN provvisorio, cambio obbligatorio al primo accesso).
6.  **Sicurezza**: blocco temporaneo dopo 5 tentativi errati (15 minuti), contatore lato server per codice e per IP; sessione lunga (30 giorni) sul telefono personale; logout da tutti i dispositivi dal profilo; un admin può **disattivare** un account (persona uscita): accesso bloccato, storico conservato.
7.  **Facoltativo**: il dipendente può aggiungere un'email nel profilo solo per ricevere le notifiche anche via email.
8.  Primo accesso: onboarding in 3 schermate (cambia PIN → aggiungi l'app alla schermata Home → attiva le notifiche).

------------------------------------------------------------------------

## 5. Modello dati (Supabase / Postgres)

Ogni tabella ha `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at` (trigger). **RLS attivo su tutte.**

``` sql
departments (id, name text unique, sort_order int)
-- seed: 'Management', 'Ottici', 'Addetti vendita'

profiles (
  id uuid pk references auth.users,
  first_name text, last_name text,
  display_name text unique not null,     -- univoco: in negozio ci sono 3 "Francesca"
  employee_code text unique not null,    -- usato per il login
  role text check (role in ('admin','employee')) default 'employee',
  weekly_hours numeric(4,1),             -- inserite a mano dall'admin
  short_label text,                      -- intestazione corta di colonna, es. 'FRA D.', 'FRA R' (come nei fogli Week)
  home_zone text check (home_zone in ('vista','sole','jolly')) default 'vista',
  counts_for_coverage boolean default true,  -- valore predefinito dei turni: false per chi di solito fa back office (§7.1)
  color text,                            -- tono personale, usato con discrezione (§9)
  email text null, phone text null, avatar_url text null,
  must_change_pin boolean default true,
  active boolean default true,
  admin_notes text                       -- visibile solo agli admin
)

profile_departments (
  profile_id uuid references profiles on delete cascade,
  department_id uuid references departments,
  is_primary boolean default false,
  primary key (profile_id, department_id)
)  -- una persona può stare in più reparti; esattamente un is_primary per persona

store_settings (                         -- riga singola
  store_name text default 'Salmoiraghi & Viganò — Piazza Cordusio',
  opening_hours jsonb,  -- seed: lun–sab 10:00–20:00, dom 10:30–20:00
  -- le regole di copertura stanno in planning_rules (§7.3)
  request_notice_days int default 7,
  logo_path text null
)

shift_templates (                        -- turni rapidi riutilizzabili (stile codici Excel)
  code text unique,                      -- es. 'MAN', 'A', 'B', 'R', 'F'
  label text, start_time time null, end_time time null,
  break_minutes int default 0,
  is_absence boolean default false,      -- R riposo, F ferie, PE permesso, MA malattia, FO formazione
  sort_order int
)
-- seed: 'MAN' Manager 10:00–20:00 (orario standard dei manager); assenze R, F, PE, MA, FO.
-- Gli altri turni (ottici / addetti vendita) li crea l'admin da Impostazioni.

schedule_weeks (
  week_start date unique,                -- sempre lunedì
  status text check (status in ('draft','published')) default 'draft',
  published_at timestamptz, published_by uuid, version int default 1,
  note text                              -- nota sulla settimana visibile a tutti
)

shifts (
  week_id uuid references schedule_weeks on delete cascade,
  profile_id uuid references profiles,
  date date,
  template_id uuid references shift_templates null,
  start_time time null, end_time time null, break_minutes int default 0,
  working_as_department_id uuid references departments null,
      -- per chi ha più reparti: in che veste lavora quel giorno (default: reparto principale)
  zone text check (zone in ('vista','sole')) null,
      -- area del turno: per i fissi = home_zone (compilata in automatico); per i jolly si sceglie qui
  note text,
  unique (profile_id, date, start_time)  -- ammette turni spezzati
)

shift_changes (shift_id, profile_id, date, before jsonb, after jsonb, changed_by, changed_at)

leaves (                                 -- planning ferie / assenze
  profile_id uuid, date date,            -- UNA RIGA PER GIORNO: rende la griglia ferie identica a un foglio Excel
  type text check (type in ('ferie','permesso','malattia','altro')) default 'ferie',
  hours numeric(4,1) null,               -- giornata parziale (es. permesso di 4 ore)
  status text check (status in ('tentative','confirmed')) default 'confirmed',  -- "da confermare" = il "?" dell'Excel
  source text check (source in ('planning','request')),
  request_id uuid null, note text,
  unique (profile_id, date)
)

requests (
  profile_id uuid,
  type text check (type in ('ferie','permesso','cambio_turno','scambio_turno',
                            'giorno_libero','indisponibilita','malattia','altro')),
  start_date date, end_date date, start_time time null, end_time time null,
  target_profile_id uuid null, target_shift_id uuid null,  -- per scambio turno
  message text, attachment_path text null,
  status text check (status in ('pending','peer_accepted','peer_declined',
                                'approved','rejected','cancelled')) default 'pending',
  decided_by uuid null, decided_at timestamptz null, decision_note text
)
request_comments (request_id, author_id, body)

announcements (
  title text, body_md text,
  category text check (category in ('generale','turni','ferie','vendite','formazione','urgente')),
  audience text check (audience in ('all','department','people')),
  department_ids uuid[], profile_ids uuid[],
  pinned boolean default false, requires_ack boolean default false,
  attachments jsonb, publish_at timestamptz default now(), expires_at timestamptz null,
  author_id uuid
)
announcement_reads (announcement_id, profile_id, read_at, acknowledged_at null,
                    primary key (announcement_id, profile_id))

performance_periods (year int unique, label text)   -- un periodo all'anno, es. 2026 → "Performance 2026"

performance_goals (
  profile_id uuid, period_id uuid,
  pillar text check (pillar in ('achievement','leadership')),
  slot smallint check (slot between 1 and 3),   -- 3 spazi Achievement + 3 spazi Leadership
  title text,                    -- es. "Lenti progressive"
  objective text,                -- l'obiettivo scritto dall'admin
  comment text,                  -- commento/feedback dell'admin, visibile al dipendente
  progress text check (progress in ('non_iniziato','in_corso','raggiunto','non_raggiunto')) null,
  employee_note text null,       -- spazio facoltativo in cui il dipendente risponde/commenta
  private_note text null,        -- solo admin
  published boolean default false,
  unique (profile_id, period_id, pillar, slot)
)

-- ===== Responsabilità (§8.4) =====
responsibilities (
  title text,                    -- es. 'Montaggi', 'Controllo mail annulli WO e Smartly'
  description_md text,           -- come si fa: procedura, link, contatti
  schedule_days smallint[],      -- giorni in cui va svolta: {1..7} (1 = lunedì); tutti i giorni = {1,2,3,4,5,6,7}
                                 -- es. annulli WO e Smartly = {3} (mercoledì)
  all_staff boolean default false,  -- 'Ordini da fare' = TUTTI
  attachments jsonb, sort_order int, active boolean default true
)
responsibility_assignees (
  responsibility_id uuid references responsibilities on delete cascade,
  profile_id uuid references profiles,
  role text check (role in ('owner','support')),  -- owner = il nome in grassetto dell'Excel
  sort_order int,
  primary key (responsibility_id, profile_id)
)  -- esattamente un owner per responsabilità (tranne quando all_staff = true)
responsibility_checks (
  responsibility_id uuid, date date,
  done_by uuid, done_at timestamptz, note text null,
  unique (responsibility_id, date)
)
extra_tasks (                    -- "Attività extra": compiti una tantum
  title text, description_md text,
  due_date date null, created_by uuid,
  status text check (status in ('open','done','cancelled')) default 'open',
  done_by uuid null, done_at timestamptz null
)
extra_task_assignees (task_id uuid, profile_id uuid, primary key (task_id, profile_id))

-- ===== Obiettivi individuali (§8.3) =====
kpi_definitions (
  code text unique,          -- es. 'WO','DOPPI_VISTA','PZ_SOLE','PZ_SOLE_ADV','DOPPI_SOLE','META_RB_OO',
                             --     'DEMO_META','DEMO_NUANCE','NUANCE','TRANSITION','ETE','PROG',
                             --     'ETE_CONTACT','ERGO','PROPOSTA_CHECK'
  label text,                -- come nel file attuale: 'N. WO', 'Doppi vista', 'Pz sole', 'META RB & OO', '&TE', ...
  description text,          -- spiegazione breve (utile ai nuovi assunti)
  default_target_rule jsonb null,  -- es. {"type":"pct_of","kpi":"WO","pct":0.2}  (Doppi vista = 20% dei WO)
                                   --  o {"type":"fixed","value":1}
  sort_order int, active boolean default true
)
kpi_sets (name text unique)      -- seed: 'Vista', 'Sole' (gruppi di KPI predefiniti, §8.3)
kpi_set_items (set_id, kpi_id, sort_order)
profile_kpis (profile_id, kpi_id, sort_order, active,  -- KPI della persona: copiati dal set della sua area,
              primary key (profile_id, kpi_id))         -- poi personalizzabili (es. "Pz sole x ADV")

store_weekly_targets (            -- "Assegnazione obiettivi" del negozio per la settimana
  week_start date unique,
  total_hours numeric,            -- default: somma ore pianificate delle persone conteggiate
  vista_value_eur numeric,        -- OB. GENERATO (es. 45.000 €)
  vista_avg_price numeric,        -- PM vista (es. 410 €)
  vista_wo int,                   -- WO del negozio (es. 120)
  sole_pieces int,                -- OB. PEZZI SOLE (es. 220)
  sole_value_eur numeric,         -- VALORE SOLE (es. 48.500 €)
  sole_avg_price numeric,         -- PM sole (es. 210 €)
  notes text
)
weekly_targets (profile_id, week_start date, kpi_id, target numeric,
                unique (profile_id, week_start, kpi_id))
daily_entries (profile_id, date date, kpi_id, value numeric default 0,
               unique (profile_id, date, kpi_id))      -- compilate dal dipendente ogni giorno
weekly_comments (profile_id, week_start date, kpi_id uuid null,  -- kpi_id null = commento generale della settimana
                 body text, author_id uuid,
                 unique (profile_id, week_start, kpi_id))
employee_week_notes (profile_id, week_start date, body text,     -- risposta/nota del dipendente sulla settimana
                     unique (profile_id, week_start))

holidays (date date unique, label text, store_closed boolean)  -- festività IT + Sant'Ambrogio (7/12)

notifications (profile_id, kind, title, body, link, read_at null)
push_subscriptions (profile_id, endpoint text unique, keys jsonb)
login_attempts (employee_code text, ip text, at timestamptz, success boolean)
audit_log (actor_id, action, entity, entity_id, diff jsonb, at timestamptz)
```

**Helper SQL** (`security definer`, `stable`): `is_admin()`.

**RLS (sintesi)**

- `profiles`: tutti leggono la **view `public_profiles`** (`id, display_name, color, avatar_url, active` + reparti); la riga completa solo il diretto interessato e gli admin. Scrittura solo admin, tranne `email/phone/avatar` del proprio profilo.
- `shifts`: SELECT se la settimana è `published` oppure `is_admin()`. Scrittura solo admin.
- `leaves`: tutti leggono la **view `leaves_public`** (`profile_id, date, status`, e `type` solo se `'ferie'`, altrimenti "assente"). Tabella completa: interessato + admin. Scrittura: admin, oppure i trigger delle richieste approvate.
- `requests`: interessato, collega coinvolto (solo per lo scambio), admin. INSERT solo con `profile_id = auth.uid()`.
- `announcements`: SELECT se `publish_at <= now()` e il profilo rientra nei destinatari.
- `performance_goals`: il dipendente vede **solo le proprie righe con `published = true`**, tramite una view senza `private_note`, e può aggiornare solo `employee_note`. Gli admin vedono e scrivono tutto.
- `responsibilities`, `responsibility_assignees`, `responsibility_checks`, `extra_tasks`: **lettura per tutti** (è il tabellone del negozio). Una spunta in `responsibility_checks` la può inserire o togliere solo chi è assegnato all'attività (owner o supporto, o chiunque se `all_staff`), solo per oggi o ieri; gli admin sempre. Le attività extra le chiude chi ne è assegnatario. Creare e modificare responsabilità: solo admin.
- `daily_entries`: il dipendente legge e scrive **solo le proprie**, e solo per i giorni da 7 giorni fa a oggi (mai date future); gli admin leggono e scrivono tutto.
- `weekly_targets`, `weekly_comments`: il dipendente legge solo le proprie; scrittura solo admin. `employee_week_notes`: il dipendente scrive la propria.
- `store_weekly_targets`, `kpi_*` e i **totali del negozio** (tramite una view aggregata `store_weekly_totals`): **lettura per tutti**, perché i totali del negozio e il best performer sono visibili a tutto lo staff. I numeri giornalieri dei singoli colleghi restano privati, salvo le tabelle per persona del Monitoraggio, che si mostrano a tutti solo se l'admin attiva l'interruttore in Impostazioni (default: no).
- `audit_log`, `login_attempts`, scrittura di `store_settings`: solo admin / service role.

**Storage** (bucket privati, signed URL): `attachments`, `exports`; `avatars` e `branding` leggibili da tutti gli utenti autenticati.

**Trigger e funzioni**

- Richiesta `ferie`/`permesso` **approvata** → crea le righe in `leaves` (una per giorno) e segnala come "in conflitto" gli eventuali turni già presenti in quei giorni.
- `scambio_turno` accettato dal collega e approvato → scambia i due turni in una transazione e scrive `shift_changes`.
- Settimana **ripubblicata** → notifica **solo** chi ha avuto turni modificati, con il prima e dopo ("Mar 14: 10:00–14:00 → 16:00–20:00").
- Ogni scrittura di un admin → `audit_log`.

------------------------------------------------------------------------

## 6. Pagine

### 6.1 Area dipendente (mobile-first: tab bar in basso su telefono, sidebar su desktop)

Tab su mobile: **Home · Orari · Obiettivi · Richieste · Altro** ("Altro" = Ferie, Comunicazioni, Performance, Profilo; le comunicazioni non lette compaiono comunque in Home con un badge). Su desktop tutte le voci stanno nella sidebar.

**`/` Home**

- Prossimo turno in grande ("Domani · 10:00–20:00"), countdown se è oggi.
- La mia settimana: 7 caselle lun→dom.
- Comunicazioni non lette, con le "urgenti" e quelle "da confermare" in testa.
- Stato delle ultime richieste.
- Prossime ferie.
- **Oggi tocca a te**: le responsabilità previste oggi di cui la persona è responsabile, o supporto se il responsabile non è in turno, con la spunta "Fatto" direttamente dalla card.
- **I miei obiettivi della settimana**: le 3–4 voci principali con barra di avanzamento, e il pulsante "Compila oggi" (in evidenza se oggi non è ancora compilato).
- Ore pianificate in settimana vs ore contrattuali.
- Chi è in turno oggi.

**`/orari` I miei orari**

- Vista **Settimana** (default) e **Mese**. Per ogni giorno: orario, pausa, reparto/zona se assegnati, nota, colleghi in turno.
- Totale ore della settimana. Badge "Modificato" sui turni cambiati dopo la pubblicazione.
- **Aggiungi al calendario**: feed iCal personale con token segreto (`/api/ical/[token].ics`) per Google/Apple Calendar.
- "Chiedi un cambio" su un singolo turno → apre la richiesta già compilata.

**`/orari/negozio` Griglia generale (stile Excel, sola lettura)**

- Righe = persone **raggruppate per reparto** (Management / Ottici / Addetti vendita, intestazioni collassabili; chi sta in più reparti compare nel reparto principale con un piccolo segno per gli altri). Colonne = giorni.
- Celle con orario compatto (`10–20`, `10–14 · 16–20`), assenze come "Ferie"/"Assente".
- Prima colonna e intestazione fisse; scroll orizzontale fluido; filtro per reparto; "evidenzia me".
- Righe di riepilogo in fondo: presenze per giorno e indicatori di copertura (§7).
- **Click su un nome** → pagina della persona con **i suoi turni pubblicati** (settimana/mese) e nient'altro. Cliccando sul proprio nome si vedono i propri turni.
- Su mobile, vista alternativa "per giorno": chi lavora, ordinato per orario, con barra timeline 10:00–20:00.
- Export PDF A4 orizzontale / stampa.

**`/richieste`**

- Le mie richieste con stato, dettaglio con timeline e commenti.
- **Nuova richiesta** a step: tipo (ferie, permesso, cambio turno, scambio con un collega, giorno libero, indisponibilità ricorrente, malattia, altro) → date/orari → collega (solo per lo scambio) → messaggio e allegato.
- Avvisi (non bloccanti): preavviso minimo; sovrapposizioni con altre richieste; "in quei giorni sono già in ferie N colleghi del tuo reparto".
- Sezione "Scambi proposti a me": accetta / rifiuta.
- Una richiesta si può annullare finché è in attesa.

**`/ferie`**

- **Planning ferie del negozio** in **sola lettura**, con lo stesso foglio stile Excel usato dagli admin (§8.2), filtrabile per reparto.
- **Le mie ferie**: elenco dei periodi, confermati e da confermare, con i giorni totali dell'anno.
- "Richiedi ferie" selezionando un intervallo direttamente sul foglio.
- *(Residui e monte ore: fuori perimetro.)*

**`/obiettivi` Obiettivi individuali** (dettaglio in §8.3)

- Settimana corrente in testa (numero settimana, es. "Week 41"), con frecce per le settimane precedenti.
- **Su telefono**: una schermata "Oggi" con una riga per ogni voce (WO, Doppi vista, Pz sole, META…) e un contatore **− / +** grande per ciascuna. Sotto il contatore: *a quanto sei* / *quanto ti manca* / *obiettivo*, con una sottile barra di avanzamento. Salvataggio automatico.
- Una striscia lun→dom permette di correggere i giorni precedenti della settimana (fino a 7 giorni indietro).
- **Su desktop**: la stessa tabella del file Excel attuale (voci × lun–dom + A quanto sei · Quanto mi manca? · Obiettivo), compilabile direttamente.
- In alto il **commento generale della settimana** dell'admin; sotto ogni voce il **commento sulla voce** (es. "no demo no party"), se presente.
- Spazio **"La mia nota"** per rispondere o raccontare la settimana.

**`/performance`**

- Selettore anno (gli obiettivi si fissano una volta all'anno).
- Due blocchi affiancati (impilati su mobile): **Achievement** e **Leadership**, **3 obiettivi ciascuno**. Ogni obiettivo è una card con:
  - titolo e testo dell'obiettivo (scritti dall'admin);
  - stato (non iniziato / in corso / raggiunto / non raggiunto), come etichetta discreta;
  - **commento** dell'admin;
  - spazio facoltativo **"La tua nota"** in cui il dipendente può rispondere.
- Visibili solo dopo la pubblicazione e solo le proprie. Se non c'è ancora nulla, uno stato vuoto sobrio.

**`/comunicazioni`**: due schede in alto, **Bacheca** e **Responsabilità**.

- **Bacheca**:
  - feed con le fissate in alto, categoria, data, autore, testo in markdown, allegati;
  - segnata come letta all'apertura; se richiede conferma → pulsante **"Ho letto"**;
  - filtro per categoria e ricerca.
- **Responsabilità** (`/comunicazioni/responsabilita`, dettaglio in §8.4):
  - **Le mie responsabilità** in alto: le attività di cui sono responsabile (evidenziate) e quelle in cui sono di supporto, con i giorni in cui vanno fatte e la descrizione di come si fanno;
  - sotto, il **tabellone del negozio**, come l'Excel attuale: attività × lun–dom della settimana corrente. Per ogni attività: il responsabile in grassetto, il supporto e le caselle spuntate (con chi l'ha fatto e a che ora). Si spunta con un tocco;
  - **Attività extra**: elenco dei compiti una tantum con scadenza e assegnatari, e il pulsante "Fatto";
  - filtro "solo le mie" e ricerca per persona: cliccando su un nome si vede di cosa si occupa quella persona.

**`/profilo`**

- I miei dati (sola lettura, tranne email/telefono/foto), cambio PIN, notifiche (push / email), link iCal, tema chiaro o scuro, logout.

### 6.2 Area amministrazione (`/admin`, solo ruolo `admin`; desktop-first, usabile da tablet)

**`/admin` Cruscotto**

- Richieste in attesa, con approva/rifiuta direttamente dalla lista.
- Settimane delle prossime 3 non ancora pubblicate.
- Buchi di copertura nelle prossime 2 settimane.
- Conferme di lettura mancanti sulle comunicazioni.
- Chi è assente oggi e domani.

**`/admin/turni` Editor turni**: foglio stile Excel (§8.1).

**`/admin/ferie` Planning ferie**: foglio annuale stile Excel (§8.2).

**`/admin/richieste`**

- Tab In attesa / Approvate / Rifiutate / Tutte, con filtri.
- Il dettaglio mostra il contesto: turni di quei giorni, chi altro è in ferie, effetto sulla copertura.
- Approvazione singola o multipla, nota di decisione, commenti.

**`/admin/comunicazioni`**

- Editor markdown con anteprima.
- Categoria, destinatari (tutti / reparti / persone), fissa in alto, richiede conferma, programmazione, scadenza, allegati.
- Per ogni comunicazione: chi ha letto e chi no, e un pulsante "sollecita".
- Scheda **Responsabilità** (`/admin/comunicazioni/responsabilita`):
  - crea e modifica le attività (titolo, come si fa, giorni previsti, allegati) e le riordina trascinandole;
  - assegna **un responsabile** e **una o più persone di supporto**, oppure "Tutti";
  - vede lo storico delle spunte per settimana, con le caselle mancanti in rosso;
  - crea le **attività extra** (titolo, descrizione, scadenza, assegnatari);
  - **vista per persona**: di cosa si occupa ciascuno, utile per bilanciare i carichi;
  - export PDF del tabellone, da appendere in negozio.

**`/admin/obiettivi` Obiettivi individuali** (dettaglio in §8.3)

- Tab **Assegnazione**: obiettivi del negozio per la settimana e calcolo automatico degli obiettivi per persona.
- Tab **Persone**: per ogni persona il foglio della settimana come nell'Excel attuale, con la colonna **Commento week** per ogni voce e un commento generale.
- Tab **Monitoraggio**: totali del negozio vs obiettivo, tabelle META (Vista / Sole) e NUANCE per persona, e la lista di **chi non ha compilato** ieri/oggi con il pulsante "sollecita".
- Tab **Voci**: gestione delle voci (KPI) e dei gruppi Vista / Sole.

**`/admin/performance`**

- Un periodo per anno (es. "Performance 2026").
- Vista a tabella: righe = persone, colonne = A1 A2 A3 · L1 L2 L3 con lo stato. Click su una cella → scheda con i 6 spazi (titolo, obiettivo, stato, commento, nota privata).
- "Copia obiettivi dal periodo precedente" e "applica gli stessi obiettivi a tutto il reparto" (poi personalizzabili).
- Pubblicazione per persona o per tutto il periodo.

**`/admin/dipendenti`**

- Crea / modifica: nome, cognome, **nome visualizzato univoco**, codice, reparti (più di uno, con il principale), ruolo, **ore settimanali**, colore, note riservate.
- Genera o resetta il PIN, disattiva un account.
- Ordinamento manuale delle persone in griglia (trascinandole).

**`/admin/impostazioni`**

- Orari di apertura.
- **Regole di pianificazione** (§7.3): set di regole, regole, variabili e anteprima delle violazioni.
- Turni rapidi: codici, orari e pause.
- Festività e chiusure.
- Preavviso minimo per le richieste.
- Logo.

**`/admin/registro`**: registro delle modifiche, filtrabile per persona, admin e tipo.

------------------------------------------------------------------------

## 7. Orari del negozio e regole di copertura

- **Apertura**: lunedì–sabato **10:00–20:00**, domenica **10:30–20:00** (modificabile da Impostazioni, comprese le eccezioni per singoli giorni).
- **Manager**: quando lavorano fanno sempre **10:00–20:00** (turno rapido `MAN` già proposto) e **contano nella copertura** come Ottici o Addetti vendita, nell'area (Vista/Sole) del loro turno.

### 7.1 Chi conta nella forza vendita

- Contano tutte le persone in turno, manager compresi, **tranne le ore svolte in back office**.
- **Back office**: alcune persone del Management si occupano anche del back office. Tipicamente una di loro **apre il negozio** (es. dalle 8:30, prima dell'apertura al pubblico) e **non sempre fa parte della forza vendita**. Per questo il back office si gestisce **sul turno**, non sulla persona:
  - il turno ha un'opzione **"Back office"**: se attiva, quelle ore non contano nelle coperture di vendita (DELTA, Vista, Sole, COP. OTT.) ma contano nelle ore lavorate e in TESTE;
  - nel profilo si imposta il **valore predefinito** (`profiles.counts_for_coverage = false` per chi di solito fa back office), sovrascrivibile turno per turno;
  - un turno si può spezzare: per esempio 08:30–10:00 in back office, poi 10:00–17:30 in vendita.
- Le pause non contano. Una mezz'ora vale 0,5, come nei fogli attuali.

### 7.2 Indicatori per fascia (colonne a destra nel foglio orario, §8.1)

- **TESTE**: tutte le persone presenti.
- **DELTA**: la forza vendita, cioè TESTE meno le ore di back office. Riproduce il foglio Week 39: dove c'è una persona in back office, DELTA = TESTE − 1.
- **Vista** e **Sole**: la forza vendita per area.
- **COP. OTT.**: ✓ se c'è almeno un ottico in vendita, ✗ altrimenti.

### 7.3 Regole e variabili di pianificazione (configurabili, estendibili)

Le coperture **non sono fisse**: sono **regole** che l'admin crea, modifica, attiva e disattiva da **Admin → Impostazioni → Regole di pianificazione**. Oggi servono le coperture minime; in futuro se ne aggiungeranno altre. Il sistema va quindi costruito come un **motore di regole a tipi**:

- Ogni **tipo di regola** è un modulo in `lib/rules/` con:
  - uno schema zod dei parametri;
  - una funzione pura `evaluate(settimana, regola) → violazioni[]`;
  - una frase leggibile generata in automatico (es. "Sole: almeno 1 persona · lun–dom · 10:00–12:00");
  - il proprio form nell'interfaccia.
- **Aggiungere un nuovo tipo** = aggiungere un modulo e registrarlo, senza toccare il resto. Le regole già salvate sono dati nel database.

**Tipi di regola iniziali**:

| Tipo                      | Parametri                                                                   | Esempio                                              |
|---------------------------|-----------------------------------------------------------------------------|------------------------------------------------------|
| `min_presence`            | ambito (area Vista/Sole, reparto, tutti), minimo, includi back office sì/no | Sole ≥ 1 dalle 10 alle 12; Sole ≥ 2 dalle 12 alle 20 |
| `max_presence`            | ambito, massimo                                                             | Massimo 1 persona in back office il sabato           |
| `opening_presence`        | minuti prima dell'apertura, minimo, ambito                                  | Almeno 1 persona dalle 08:30 (apertura back office)  |
| `max_on_leave`            | ambito, massimo di persone in ferie nello stesso giorno                     | Massimo 2 Ottici in ferie insieme                    |
| `weekly_hours_deviation`  | % di scostamento ammessa dalle ore di contratto                             | ±10%                                                 |
| `min_rest_between_shifts` | ore                                                                         | 11 ore                                               |
| `max_consecutive_days`    | giorni                                                                      | 6 giorni                                             |
| `min_weekly_rest_days`    | giorni                                                                      | 1 giorno                                             |
| `mandatory_break`         | dopo quante ore, durata minima                                              | Pausa di almeno 30' dopo 6 ore                       |

**Campi comuni a ogni regola**:

- nome;
- giorni della settimana;
- fascia oraria di validità (es. 10:00–12:00), ripetibile;
- periodo di validità (dal / al, per regole stagionali come saldi o Natale);
- gravità (**avviso**, oppure **informazione** che non viene segnalata in pubblicazione);
- attiva sì/no.

**Variabili**: una tabella di **variabili con nome** (es. `min_sole_apertura = 1`, `min_sole_sera = 2`, `min_vista = 2`) che i parametri delle regole possono richiamare al posto di un numero fisso. Se cambi una variabile, cambiano tutte le regole che la usano. Ogni variabile ha nome, valore, unità e descrizione.

**Set di regole**:

- le regole si raggruppano in **set**, per esempio "Standard", "Saldi", "Natale";
- ogni settimana usa il set predefinito, oppure un set scelto nel foglio turni (menu "Regole della settimana");
- da un set se ne può creare uno nuovo duplicandolo.

**Anteprima**: mentre si crea o modifica una regola, l'interfaccia mostra quante violazioni produrrebbe nella settimana in corso e nella precedente, così le regole si tarano sui piani reali.

**Seed iniziale** (set "Standard"), ricavato dai fogli Week 39/40 da tarare dall'admin:

- COP. OTT.: almeno **1 Ottico** in vendita per tutto l'orario di apertura, esclusa la fascia 13–14.
- **Vista**: almeno **2** dalle 11:00 alle 19:00 (esclusa 13–14); almeno **1** in apertura e in chiusura.
- **Sole**: almeno **1 in apertura** (10:00–12:00, il piano sole può essere aperto da una persona sola) e almeno **2 dalle 12:00 a chiusura**, perché si preferisce più copertura la sera (esclusa 13–14).
- **Apertura back office**: almeno 1 persona dalle 08:30, lunedì–sabato.
- **Fascia 13–14**: nei fogli attuali è la pausa pranzo convenzionale (8 ore lavorate con 1 ora di pausa), quindi le regole di presenza la escludono.
- Ore di contratto ±10%, 11 ore di riposo tra due turni, massimo 6 giorni consecutivi, almeno 1 riposo a settimana.

**Comportamento**:

- Le violazioni sono **avvisi, non blocchi**. Si vedono in griglia (cella rossa tenue nella colonna dell'indicatore, con il dettaglio al passaggio del mouse, es. "Mar 14 · 12:00–12:30 · Sole: 1/2 · regola 'Sole sera'"), nel pannello laterale del foglio turni, nel cruscotto e nella finestra di pubblicazione.
- Un avviso si può **ignorare per quella settimana** con una nota (es. "inventario"); l'azione resta nel registro.

Tabelle (in aggiunta a §5):

``` sql
planning_rule_sets (name text unique, description text, is_default boolean)
planning_rules (rule_set_id uuid, name text, type text, params jsonb,  -- params validati dallo schema zod del tipo
                days smallint[], time_windows jsonb,   -- [{"from":"10:00","to":"12:00"}, ...]
                valid_from date null, valid_to date null,
                severity text check (severity in ('warning','info')), active boolean, sort_order int)
planning_variables (key text unique, label text, value numeric, unit text, description text)
rule_overrides (week_id uuid, rule_id uuid, date date, note text, created_by uuid)  -- avvisi ignorati
```

Inoltre: `schedule_weeks.rule_set_id uuid null` (null = set predefinito) e `shifts.is_back_office boolean null` (null = usa il valore predefinito del profilo).

La logica sta in `lib/coverage.ts` (indicatori) e `lib/rules/*` (motore e tipi): tutta pura e coperta da test Vitest, inclusa una fixture che ricrea la Week 39 e verifica TESTE, DELTA e totali.

------------------------------------------------------------------------

## 8. I due "fogli stile Excel" (cuore del prodotto)

Un unico componente `SpreadsheetGrid`, usato in due configurazioni. Deve **sentirsi come Excel**:

- selezione di cella e di intervalli con mouse e Shift+frecce; frecce, Tab e Invio per muoversi;
- **digitazione diretta** nella cella selezionata; Canc per svuotare;
- **Ctrl/Cmd+C / V** su celle e intervalli (anche da e verso il vero Excel, come testo separato da tabulazioni);
- **maniglia di riempimento** per trascinare un valore sulle celle vicine;
- **Ctrl+Z / Ctrl+Y**;
- prima riga e prima colonna fisse; zoom (compatto / comodo);
- salvataggio automatico (indicatore "Salvato"); aggiornamento in tempo reale se un altro admin modifica la stessa vista (Supabase Realtime), con un indicatore di chi sta modificando;
- su telefono: tocco su una cella → foglio dal basso con le scelte (niente scorciatoie da tastiera).

### 8.1 Foglio turni (`/admin/turni/[settimana]`)

- Righe = persone raggruppate per reparto, colonne = giorni (settimana; opzione 2 settimane o mese).
- Valori di cella: un **codice di turno rapido** (`MAN`, `R`, `F`…), un orario libero (`10-14`, `10:30-20`), due fasce per lo spezzato (`10-14 16-20`). Il parser accetta formati diversi e normalizza.
- Popover della cella: turno rapido, orario, pausa, reparto in cui lavora quel giorno (per chi ha più reparti), zona Vista/Sole, nota.
- Le ferie e le assenze approvate appaiono già, in grigio e bloccate.
- In fondo al foglio, righe di riepilogo: presenti per reparto e per fascia, esito delle regole di copertura.
- Pannello laterale: ore per persona vs contratto, e la lista degli avvisi (cliccando su un avviso si va alla cella).
- Azioni: **Duplica la settimana precedente**, **Applica un modello** (salva la settimana come modello), **Pubblica** / **Ripubblica** (finestra riassuntiva con avvisi aperti e scelta "notifica tutti / solo chi è cambiato"), export **PDF** ed **Excel**.

#### Modalità "Foglio orario" (come i PDF Week 39 / Week 40 attuali)

Seconda modalità del foglio turni, con gli **stessi dati**: si può passare dall'una all'altra in qualsiasi momento. Replica il modo in cui oggi si pianifica:

- **Un blocco per giorno** (lunedì→domenica, uno sotto l'altro), con la data in verticale a sinistra e il numero settimana in alto ("39").
- **Colonne** = persone, raggruppate per area: prima **Vista** (intestazione blu tenue), poi **Sole** (intestazione ambra tenue), poi **Jolly**. Dentro ogni gruppo, ordine manuale. Si usa `short_label` come intestazione (es. "FRA D.", "FRA R").
- **Righe** = fasce orarie **07:00–22:00** a passo di un'ora; ogni ora è divisa in due mezze celle da 30 minuti. Una cella mostra `1` (ora piena), `0,5` (mezz'ora) o è vuota.
- **Si "dipinge" la presenza**: clic e trascinamento verticale sulle mezze celle per segnare la presenza, di nuovo per toglierla. Anche da tastiera: `1` = ora piena, `.` o `5` = mezz'ora, `Canc` = svuota. I vuoti in mezzo al turno diventano la pausa (es. 13–14).
- **Riga ORARIO** in testa a ogni giorno: le **ore residue della settimana** per persona, cioè le ore di contratto meno quelle già pianificate fino a quel giorno, così come oggi scendono da 40 a 32, 24, 16… In grigio scuro quando arriva a 0, in rosso se va sotto zero.
- **Riga TOT** in fondo a ogni giorno: le ore del giorno per persona, più il totale ore del negozio nel giorno (es. 78).
- **Colonne a destra** per ogni fascia: COP. OTT., DELTA, TESTE, Vista, Sole (§7), con le celle in rosso tenue se una regola non è rispettata.
- **Assenze**: l'intera colonna del giorno si riempie, con la stessa logica dei fogli attuali:
  - **rosso tenue = ferie**;
  - **verde tenue = richiesta fatta dal dipendente e approvata** (giorno libero, permesso, indisponibilità…); se la richiesta è ancora in attesa, verde tratteggiato (solo per gli admin);
  - grigio = altre assenze (malattia, formazione).
- **Back office**: le mezze celle in back office sono dipinte a righe diagonali invece che piene, così si vede subito che non contano in DELTA.
- **Per i jolly** la prima mezza cella dipinta chiede l'area (Vista / Sole); si può cambiare dal popover del turno.
- Il totale delle ore di contratto della settimana (es. 280) è visibile nell'intestazione.
- **Export PDF identico** al formato attuale (A4 verticale, una pagina per settimana), da stampare e appendere in negozio.

### 8.2 Foglio ferie (`/admin/ferie/[anno]`)

Ispirato al primo foglio dell'Excel attuale, che serve **solo come esempio** (non è previsto un import del file).

Due viste dello stesso dato (`leaves`), commutabili:

1.  **Vista "Calendario annuale"**, come l'Excel attuale:
    - 12 blocchi mese (4 per fila su desktop, 1 per fila su mobile);
    - in ogni blocco, una riga per giorno: numero, lettera del giorno (L M M G V S D), e a seguire **le persone in ferie quel giorno** come etichette;
    - weekend e festività leggermente ombreggiati.
    - Click su un giorno → si aggiungono o tolgono persone (ricerca per nome visualizzato).
    - Selezionando più giorni e scegliendo una persona, le ferie si applicano a tutto il periodo.
2.  **Vista "Persone × giorni"** (consigliata per lavorare):
    - righe = persone per reparto, colonne = giorni del mese o dell'anno, con scroll orizzontale;
    - le celle si riempiono digitando `F` (ferie), `F?` (da confermare), `PE` (permesso), `PE4` (permesso di 4 ore), `MA`, oppure trascinando la maniglia;
    - riga in fondo: **numero di persone in ferie per giorno e per reparto**, evidenziata quando si supera una soglia configurabile per reparto.

In entrambe le viste:

- "Da confermare" si distingue con un contorno tratteggiato.
- Filtro per reparto.
- Export **Excel** nello stesso layout a 12 mesi (per chi vuole ancora stamparlo) e **PDF**.
- I dipendenti vedono lo stesso foglio in sola lettura (§6.1).

### 8.3 Obiettivi individuali (basato sul file "OBIETTIVI INDIVIDUALI" attuale)

**Voci (KPI)** — seed iniziale, tutte modificabili da `/admin/obiettivi → Voci`:

| Codice         | Etichetta      | Gruppo Vista             | Gruppo Sole     | Regola obiettivo di default                        |
|----------------|----------------|--------------------------|-----------------|----------------------------------------------------|
| WO             | N. WO          | ✓                        |                 | calcolato dall'Assegnazione (sotto)                |
| DOPPI_VISTA    | Doppi vista    | ✓                        |                 | 20% dei WO                                         |
| PZ_SOLE        | Pz sole        | ✓ (come "Pz sole x ADV") | ✓               | Sole: calcolato dall'Assegnazione · Vista: fisso 1 |
| DOPPI_SOLE     | Doppi sole     |                          | ✓               | 20% dei Pz sole                                    |
| META_RB_OO     | META RB & OO   | ✓                        | ✓ (come "META") | fisso                                              |
| DEMO_META      | Demo META      | ✓                        | ✓               | fisso                                              |
| DEMO_NUANCE    | Demo NUANCE    | ✓                        |                 | fisso                                              |
| NUANCE         | NUANCE         | ✓                        |                 | fisso                                              |
| TRANSITION     | Transition     | ✓                        |                 | 20% dei WO                                         |
| ETE            | &TE            | ✓                        |                 | 20% dei WO                                         |
| PROG           | Progressivi    | ✓                        |                 | 10% dei WO                                         |
| ETE_CONTACT    | &-TE Contact   | ✓                        | ✓               | fisso 1                                            |
| ERGO           | ERGO           |                          | ✓               | fisso                                              |
| PROPOSTA_CHECK | Proposta check |                          | ✓               | fisso                                              |

Ogni persona riceve le voci del gruppo della sua area (i jolly: Vista + Pz sole, modificabile). L'admin può aggiungere o togliere voci per singola persona.

**Assegnazione obiettivi della settimana** (replica il foglio "Assegnazione obiettivi"):

1.  L'admin inserisce gli obiettivi del negozio:
    - **ore totali**: proposte in automatico come somma delle ore pianificate nel foglio turni della settimana, per le persone che contano;
    - **generato vista €**, **PM vista**, **WO**;
    - **pezzi sole**, **valore sole €**, **PM sole**.
2.  Il sistema calcola **€/ora vista** = generato ÷ ore totali e **€/ora sole** = valore sole ÷ ore totali.
3.  Per ogni persona usa le **ore pianificate** quella settimana (dal foglio turni):
    - persone Vista: **valore WO** = €/ora vista × ore, e **WO obiettivo** = valore WO ÷ PM vista (arrotondato);
    - persone Sole: **valore sole** = €/ora sole × ore, e **pezzi sole obiettivo** = valore sole ÷ PM sole (arrotondato).
4.  Le altre voci seguono la loro regola (% di un'altra voce oppure valore fisso).
5.  Ne esce una **tabella di anteprima** (persone × voci) in cui ogni cella si può sovrascrivere a mano; le celle sovrascritte restano evidenziate. **Conferma** salva in `weekly_targets`.
6.  Sotto la tabella, i totali assegnati confrontati con l'obiettivo del negozio (es. "WO assegnati 118 / 120").
7.  Pulsante "Copia dalla settimana precedente".

**Compilazione giornaliera** (dipendente): vedi `/obiettivi` in §6.1.

- "A quanto sei" = somma lun→dom; "Quanto mi manca?" = obiettivo − somma (mostrato come "Obiettivo raggiunto ✓" quando arriva a zero o sotto).
- Promemoria push alle 19:30 nei giorni in cui la persona ha un turno, se non ha ancora compilato la giornata.

**Commenti** (admin):

- Un **commento per ogni voce** della settimana (la colonna "COMMENTO WEEK" dell'Excel) e un **commento generale della settimana** per persona.
- Si scrivono direttamente nel foglio della persona, cliccando sulla cella del commento.
- Il dipendente riceve una notifica quando vengono pubblicati i commenti della sua settimana.

**Monitoraggio** (admin):

- Totali del negozio della settimana vs obiettivo (WO, pezzi sole, META, NUANCE…).
- Tabella **META** con i pezzi per persona, divisi in Vista e Sole, con i totali; tabella **NUANCE** per persona.
- Un **"best performer della settimana"** suggerito: la persona con la percentuale media di raggiungimento più alta. L'admin può confermarlo e citarlo in una comunicazione.
- **Visibile a tutti**: i ragazzi vedono in `/obiettivi` una card "Negozio" con i totali della settimana vs obiettivo (WO, pezzi sole, META, NUANCE…) e il best performer confermato.
- **Chi non ha compilato**: la lista delle persone in turno che non hanno compilato la giornata.
- Export Excel nello stesso layout del file attuale (un foglio per gruppo di persone, colonne lun–dom, A quanto sei, Quanto mi manca, Obiettivo, Commento week).

### 8.4 Responsabilità (basato sul file "Responsabilità" attuale)

**Seed iniziale** delle attività, che l'admin può poi modificare:

- Montaggi
- WhatsApp
- Customer Connect
- Magazzino (pacchi)
- Controllo mail annulli WO e Smartly (**solo mercoledì**)
- Check WO (trasmitted)
- Controllo cassetto (annullati)
- Portale unico assicurazioni
- Controllo Smart Portal aperti
- Controllo stock LAC
- Sostituzione antine sole
- Ordini da fare (**tutti**)
- Carico bolle

I nomi dei responsabili si assegnano da interfaccia: non vanno messi nel seed.

**Regole**:

- Ogni attività ha **un responsabile** (nell'Excel il nome in grassetto) e zero o più **supporti**, oppure è per **tutti**.
- Per ogni giorno previsto c'è una casella da spuntare **quando l'attività è stata svolta**, come nell'Excel ("compilare la casella quando si è svolta l'attività"). La spunta registra chi l'ha fatta e quando, e si può annullare.
- **Integrazione con i turni**: il sistema sa chi è in negozio quel giorno.
  - Se il responsabile è in turno, l'attività compare nella sua card "Oggi tocca a te".
  - Se non è in turno (riposo, ferie), compare al **primo supporto in turno**, con l'etichetta "Oggi sostituisci {responsabile}".
  - Se non c'è nessuno, gli admin ricevono un avviso al mattino.
- **Stati della casella**:
  - spuntata (nero pieno);
  - prevista e non ancora fatta (contorno);
  - non svolta a giornata finita (rosso tenue);
  - giorno non previsto (grigio, non cliccabile).
- **Attività extra**: compiti una tantum con scadenza, assegnati a una o più persone. Compaiono nella card "Oggi tocca a te" fino a quando qualcuno li chiude.
- Quando il responsabile cambia, la vecchia assegnazione resta nello storico.

------------------------------------------------------------------------

## 9. Design: minimal bianco e nero, stile EssilorLuxottica

Riferimento: l'estetica corporate **EssilorLuxottica**, cioè bianco e nero, molto spazio bianco, tipografia protagonista, eleganza da maison di occhialeria. Moderno e curato, mai "gestionale". **Non copiare loghi né elementi grafici proprietari**: il logo del negozio lo carica l'admin da Impostazioni; finché non c'è, si usa un wordmark testuale "SALMOIRAGHI & VIGANÒ · CORDUSIO" in maiuscoletto spaziato.

- **Colori**: nero `#0A0A0A`, bianco `#FFFFFF`, una scala di grigi caldi (`#F5F5F4`, `#E7E5E4`, `#A8A29E`, `#57534E`). **Nessun colore d'accento.** Il colore entra solo per dare informazioni, sempre desaturato e in piccola quantità:
  - rosso scuro `#B42318` per gli avvisi di copertura e i rifiuti;
  - verde scuro `#067647` per le approvazioni;
  - ambra `#B54708` per "in attesa" e "da confermare".
  - Il colore personale dei dipendenti compare solo come pallino accanto al nome e come sottile bordo sinistro in griglia.
  - **Aree**: Vista = blu notte desaturato `#1F3A5F`, Sole = sabbia/ambra `#A87B3D`, usati solo come tinta tenue (10–15%) nelle intestazioni di colonna e come piccolo segno sui turni. Riprendono il blu e l'arancio dei fogli attuali, ma in versione sobria.
  - Il "dipinto" delle presenze nel foglio orario è **nero pieno** (mezz'ora = metà cella), al posto del giallo dell'Excel.
- **Tipografia**:
  - titoli in **"Inter Tight"** 600, in maiuscolo con spaziatura larga (`tracking 0.08em`) per le etichette di sezione;
  - testo in **"Inter"**; numeri e orari con cifre tabellari.
  - Gerarchia netta: titoli di pagina grandi (36–44px) e sottili, molto spazio tra le sezioni.
- **Forme**: angoli quasi retti (raggio 2–4px), linee sottili 1px nere o grigie al posto delle ombre, niente gradienti, niente effetto vetro, niente illustrazioni colorate. I pulsanti principali sono pieni neri con testo bianco; i secondari hanno solo il contorno.
- **Griglie**:
  - stile foglio di calcolo raffinato: righe sottili, intestazioni in maiuscoletto grigio;
  - la colonna di oggi è evidenziata da un bordo nero superiore spesso;
  - i turni in nero su bianco, le assenze in grigio a tratteggio, le ferie da confermare con il contorno tratteggiato.
- **Movimento**: minimo e preciso (dissolvenze di 150–200 ms, sottolineature animate sui link, indicatore della tab bar che scorre). Rispettare `prefers-reduced-motion`.
- **Tema scuro**: l'inversione elegante (sfondo `#0A0A0A`, testo bianco, linee `#292524`); default = impostazione del sistema.
- **Componenti**:
  - tab bar mobile bianca con filo superiore, icone lucide sottili (stroke 1.5);
  - card con solo il bordo;
  - stati vuoti tipografici (una frase in grande, grigia);
  - skeleton loader grigi.
- **Accessibilità**: contrasto AA, focus visibile (contorno nero 2px), griglia navigabile da tastiera, tocchi da almeno 44px, `aria-label` sulle celle.
- **PWA**:
  - manifest, icone in bianco e nero, `display: standalone`;
  - copia offline dell'ultima settimana di turni vista, con il banner "Sei offline".

Prima delle pagine reali, crea `/dev/design` (visibile solo in sviluppo) con colori, tipografia, pulsanti, celle della griglia e card, per validare lo stile.

------------------------------------------------------------------------

## 10. Notifiche

| Evento                                                              | Destinatari                                                     | Canali                             |
|---------------------------------------------------------------------|-----------------------------------------------------------------|------------------------------------|
| Settimana pubblicata                                                | chi ha turni in quella settimana                                | in-app, push (+ email se presente) |
| Turno modificato dopo la pubblicazione                              | solo le persone coinvolte, con il prima e dopo                  | in-app, push (+ email)             |
| Nuova richiesta                                                     | tutti gli admin                                                 | in-app, push                       |
| Richiesta approvata o rifiutata                                     | chi l'ha fatta                                                  | in-app, push (+ email)             |
| Proposta di scambio turno                                           | il collega coinvolto                                            | in-app, push                       |
| Nuova comunicazione                                                 | i destinatari                                                   | in-app, push                       |
| Obiettivi di performance pubblicati                                 | la persona interessata                                          | in-app                             |
| Obiettivi della settimana assegnati                                 | le persone interessate                                          | in-app, push                       |
| Commenti della settimana pubblicati                                 | la persona interessata                                          | in-app, push                       |
| Promemoria "compila la giornata" (19:30, solo nei giorni con turno) | il dipendente                                                   | push                               |
| Responsabilità del giorno (all'inizio del turno)                    | il responsabile in turno, oppure il supporto che lo sostituisce | push                               |
| Responsabilità non spuntata a fine giornata                         | gli admin                                                       | in-app (riepilogo serale)          |
| Nuova responsabilità o nuova attività extra assegnata               | gli assegnatari                                                 | in-app, push                       |
| Promemoria turno (sera prima, facoltativo)                          | il dipendente                                                   | push                               |

- Campanella con contatore in tempo reale (Supabase Realtime).
- Preferenze di notifica nel profilo.
- **Vercel Cron**: promemoria serali, avviso agli admin il giovedì se la settimana successiva non è ancora pubblicata.

------------------------------------------------------------------------

## 11. Struttura del progetto

    app/
      (auth)/accesso, (auth)/primo-accesso
      (app)/layout.tsx, page.tsx
      (app)/orari/, orari/negozio/, persone/[id]/
      (app)/richieste/, richieste/nuova/, richieste/[id]/
      (app)/ferie/, obiettivi/, performance/, comunicazioni/, comunicazioni/[id]/, profilo/
      admin/layout.tsx  (guard is_admin)
      admin/page.tsx, turni/[week]/, ferie/[year]/, richieste/, comunicazioni/,
      admin/obiettivi/[week]/, admin/performance/, dipendenti/, impostazioni/, registro/
      api/ical/[token]/route.ts, api/auth/pin/route.ts, api/cron/*/route.ts
    components/ (ui/, spreadsheet/, calendar/, layout/)
    lib/ (supabase/{server,client,middleware}.ts, auth/pin.ts, dates.ts, shifts/parse.ts,
          coverage.ts, hours.ts, targets.ts (calcolo assegnazione obiettivi), export/{excel,pdf}.ts, notifications.ts, validators/, i18n/it.ts)
    supabase/ (migrations/, seed.sql, config.toml)
    tests/ (unit/, e2e/)
    middleware.ts

Tutte le modifiche passano da Server Actions con validazione zod e controllo del ruolo lato server. RLS resta la difesa finale.

------------------------------------------------------------------------

## 12. Variabili d'ambiente (Vercel)

    NEXT_PUBLIC_SUPABASE_URL=
    NEXT_PUBLIC_SUPABASE_ANON_KEY=
    SUPABASE_SERVICE_ROLE_KEY=        # solo server: creazione utenti, reset PIN, cron
    NEXT_PUBLIC_APP_URL=
    VAPID_PUBLIC_KEY= / VAPID_PRIVATE_KEY=
    RESEND_API_KEY=                   # facoltativa
    EMAIL_FROM=
    CRON_SECRET=
    FIRST_ADMIN_CODE= / FIRST_ADMIN_PIN=   # usati una volta sola dal seed

Fornire `.env.example`. La service role key non va mai esposta al client.

------------------------------------------------------------------------

## 13. Deploy

1.  Progetto Supabase in region **EU (Frankfurt)**. `supabase link`, `supabase db push`.
2.  Auth: signup disabilitato, provider email/password attivo (usato internamente per codice e PIN), conferma email disattivata (le email sono sintetiche).
3.  Repo GitHub → import su Vercel, variabili d'ambiente, `vercel.json` con i cron.
4.  `pnpm seed:admin` crea il primo admin da `FIRST_ADMIN_CODE`/`FIRST_ADMIN_PIN`.
5.  README in italiano, passo-passo per chi non è sviluppatore: creare gli account, deploy, aggiungere i dipendenti, come mandare a ciascuno codice e PIN.

------------------------------------------------------------------------

## 14. Privacy e sicurezza

- Pagina `/privacy` con l'informativa, da accettare al primo accesso.
- Malattia: solo tipo e date, **mai la diagnosi**. Gli eventuali allegati li vedono solo gli admin; i colleghi vedono "Assente".
- Script di test RLS: con la sessione di un `employee` deve risultare impossibile leggere performance, richieste, note e profili completi degli altri, e i turni in bozza.
- Blocco dopo i tentativi di PIN errati, header di sicurezza (CSP, HSTS), PIN mai salvati in chiaro (li gestisce Supabase Auth).
- Backup giornalieri Supabase; export completo in Excel per gli admin.
- Nessun dato reale di dipendenti nel repository: il seed di sviluppo usa nomi inventati (inclusi tre omonimi per provare il nome visualizzato univoco).

------------------------------------------------------------------------

## 15. Milestone

1.  **Fondamenta**: Next.js, Tailwind, shadcn ristilizzato, `/dev/design`, Supabase SSR, migrazioni base, **login con codice + PIN**, primo accesso, protezione dei ruoli, layout dipendente e admin.
2.  **Dipendenti e impostazioni**: gestione dipendenti (più reparti, ore, ruolo, PIN), orari di apertura, turni rapidi, festività.
3.  **Componente `SpreadsheetGrid`**, con test sulle interazioni da tastiera e sul copia-incolla.
4.  **Turni**: foglio turni admin (modalità persone × giorni **e** modalità foglio orario), aree Vista/Sole/Jolly, pubblicazione e versioni, I miei orari, griglia del negozio, pagina della persona, iCal, PDF nel formato "Week" ed Excel.
5.  **Coperture e regole**: back office sul turno, `lib/coverage.ts` (TESTE, DELTA, Vista, Sole, COP. OTT.), motore `lib/rules/*` con i tipi iniziali, variabili, set di regole, pagina Regole di pianificazione con anteprima, avvisi in griglia, test (compresa la fixture Week 39).
6.  **Ferie**: foglio ferie (le due viste), vista dipendente, export.
7.  **Richieste**: procedura guidata, approvazioni, scambi, effetti automatici su ferie e turni.
8.  **Comunicazioni e Responsabilità**: editor, destinatari, letture e conferme; tabellone delle responsabilità con spunte, sostituzione automatica in base ai turni, attività extra, export PDF.
9.  **Obiettivi individuali**: voci e gruppi, assegnazione con calcolo da ore pianificate (`lib/targets.ts` con test), compilazione giornaliera mobile, foglio admin con commenti, monitoraggio, export Excel.
10. **Performance annuale**: 3 + 3 obiettivi, tabella admin, pubblicazione, vista dipendente con la sua nota.
11. **Notifiche**: in-app in tempo reale, push, email facoltativa, cron (compreso il promemoria delle 19:30).
12. **Rifinitura**: Home, cruscotto, PWA offline, registro, accessibilità, Playwright e2e, README.

Alla fine di ogni milestone: `pnpm lint && pnpm typecheck && pnpm test` senza errori e anteprima su Vercel funzionante.

------------------------------------------------------------------------

## 16. Criteri di accettazione

- Un admin crea un dipendente; il dipendente entra con codice e PIN provvisorio, è obbligato a cambiarlo e vede **solo** i turni pubblicati.
- Non si possono creare due persone con lo stesso nome visualizzato (le tre Francesche restano distinguibili ovunque).
- Una persona può stare in due reparti, compare una volta sola in griglia e il giorno del turno si può indicare in che veste lavora.
- L'admin compila una settimana solo da tastiera, copia un blocco dal vero Excel e lo incolla nel foglio, poi pubblica; i dipendenti ricevono la notifica. Una modifica successiva notifica solo chi è coinvolto.
- Con le regole del set "Standard", la griglia segnala le fasce senza ottico o sotto il minimo in Vista o Sole: in Sole basta 1 persona in apertura, ne servono 2 la sera.
- L'admin crea una nuova regola o variabile da Impostazioni (es. "Sabato Vista ≥ 3"), vede subito quante violazioni produce sulla settimana in corso e la attiva senza modifiche al codice.
- Una persona del Management in back office in apertura conta in TESTE ma non in DELTA; lo stesso giorno può passare in vendita e da lì conta.
- Una settimana come la Week 39 si ricrea nel foglio orario dipingendo le presenze. Le righe ORARIO e TOT e le colonne TESTE e DELTA danno gli stessi numeri del PDF, e l'export PDF ha lo stesso layout.
- Un jolly può lavorare in Vista un giorno e in Sole il giorno dopo, e le coperture tengono conto dell'area del turno.
- Inseriti gli obiettivi del negozio (es. 250 ore, 45.000 €, PM 410…), il sistema propone gli obiettivi di ogni persona in proporzione alle sue ore pianificate; l'admin li corregge e li conferma.
- Il dipendente compila i numeri del giorno dal telefono con i pulsanti − / + in meno di 30 secondi, e vede subito "a quanto sei / quanto ti manca".
- L'admin scrive un commento per ogni voce e un commento generale della settimana, e il dipendente li vede sotto i propri numeri.
- In Comunicazioni → Responsabilità ogni dipendente vede di cosa è responsabile e di cosa è supporto, e come si fa. Spunta l'attività quando l'ha fatta, e il tabellone mostra chi l'ha fatta e quando.
- Se il responsabile del mercoledì per "annulli WO e Smartly" è di riposo, il primo supporto in turno riceve l'attività in "Oggi tocca a te".
- I membri del Management con ruolo admin possono fare tutto quello che fa il titolare.
- Il planning ferie si compila interamente sul sito, nelle viste "calendario annuale" e "persone × giorni"; le ferie "da confermare" si distinguono; si esporta in Excel.
- Una richiesta di ferie approvata compare nel planning e blocca le celle nel foglio turni.
- Ogni dipendente vede i suoi 3 obiettivi Achievement e 3 Leadership con i commenti, solo dopo la pubblicazione, e può aggiungere una sua nota.
- Con la sessione di un `employee` è impossibile leggere via API i dati riservati di altri.
- L'interfaccia è in bianco e nero minimal (§9), in tema chiaro e scuro, e si installa sul telefono.

------------------------------------------------------------------------

## 17. Decisioni prese con il titolare

- Persone **fisse** e **jolly**: l'area dei jolly si sceglie turno per turno.
- I manager contano nella copertura come Ottici o Addetti vendita. Chi fa **back office** (tipicamente in apertura) non conta nella forza vendita per quelle ore, e si decide **sul turno**.
- Le coperture **seguono la pratica attuale** (fogli Week 39/40): il Sole può aprire con 1 persona, mentre la sera serve più copertura. Tutti i minimi sono **regole e variabili configurabili** (§7.3), estendibili in futuro con nuovi tipi.
- Colori nel foglio orario: **rosso = ferie**, **verde = richieste fatte dai dipendenti**.
- **Totali del negozio** degli obiettivi individuali e best performer: **visibili a tutti**.
- Performance: **una volta all'anno**.

Nessuna domanda aperta bloccante. In caso di dubbio durante lo sviluppo, scegliere la soluzione configurabile da Impostazioni.

------------------------------------------------------------------------

## 18. Fuori perimetro

- Import del file Excel ferie (il planning si fa direttamente sul sito).
- Residui ferie, monte ore, ROL maturati.
- Timbrature, buste paga.
- Generazione automatica dei turni (possibile evoluzione futura, partendo dalle regole di copertura).

