-- Obiettivi: richieste di Alessandro del 26/11/2026.
--
-- 1. Produttività oraria: oltre a vista e sole entrano le lenti a contatto (prezzo medio, numero,
--    fatturato) e il «mondo altro» (solo fatturato). La produttività totale è il fatturato totale
--    diviso le ore lavorate.
-- 2. Un dipendente del Sole vede solo le voci del Sole, uno del Vista solo quelle del Vista: il
--    foglio di ciascuno segue il gruppo della sua area. Le copie personali delle voci
--    (profile_kpis) erano state create in automatico alla conferma degli obiettivi, mescolando
--    le due aree: si tolgono. Gli obiettivi «misti» assegnati a una persona restano visibili
--    nella settimana in cui sono assegnati (weekly_targets non viene toccata).

alter table public.store_weekly_targets
  add column lac_avg_price numeric,
  add column lac_pieces int,
  add column lac_value_eur numeric,
  add column other_value_eur numeric;

delete from public.profile_kpis;
