-- Dati iniziali: nessun dato reale di dipendenti (vedi scripts/seed-dev.ts per le persone di prova).

insert into public.departments (name, sort_order) values
  ('Management', 1),
  ('Ottici', 2),
  ('Addetti vendita', 3)
on conflict (name) do nothing;

insert into public.store_settings (id) values (true)
on conflict (id) do nothing;

-- Turno standard dei manager e codici di assenza. Gli altri turni li crea l'admin da Impostazioni.
insert into public.shift_templates (code, label, start_time, end_time, break_minutes, is_absence, sort_order) values
  ('MAN', 'Manager', '10:00', '20:00', 60, false, 1),
  ('R', 'Riposo', null, null, 0, true, 10),
  ('F', 'Ferie', null, null, 0, true, 11),
  ('PE', 'Permesso', null, null, 0, true, 12),
  ('MA', 'Malattia', null, null, 0, true, 13),
  ('FO', 'Formazione', null, null, 0, true, 14)
on conflict (code) do nothing;

-- Festività nazionali + Sant'Ambrogio (patrono di Milano). La chiusura del negozio la decide l'admin.
insert into public.holidays (date, label) values
  ('2026-01-01', 'Capodanno'),
  ('2026-01-06', 'Epifania'),
  ('2026-04-05', 'Pasqua'),
  ('2026-04-06', 'Lunedì dell''Angelo'),
  ('2026-04-25', 'Festa della Liberazione'),
  ('2026-05-01', 'Festa dei Lavoratori'),
  ('2026-06-02', 'Festa della Repubblica'),
  ('2026-08-15', 'Ferragosto'),
  ('2026-11-01', 'Ognissanti'),
  ('2026-12-07', 'Sant''Ambrogio'),
  ('2026-12-08', 'Immacolata Concezione'),
  ('2026-12-25', 'Natale'),
  ('2026-12-26', 'Santo Stefano'),
  ('2027-01-01', 'Capodanno'),
  ('2027-01-06', 'Epifania'),
  ('2027-03-28', 'Pasqua'),
  ('2027-03-29', 'Lunedì dell''Angelo'),
  ('2027-04-25', 'Festa della Liberazione'),
  ('2027-05-01', 'Festa dei Lavoratori'),
  ('2027-06-02', 'Festa della Repubblica'),
  ('2027-08-15', 'Ferragosto'),
  ('2027-11-01', 'Ognissanti'),
  ('2027-12-07', 'Sant''Ambrogio'),
  ('2027-12-08', 'Immacolata Concezione'),
  ('2027-12-25', 'Natale'),
  ('2027-12-26', 'Santo Stefano')
on conflict (date) do nothing;

-- Voci degli obiettivi individuali (§8.3), modificabili da Admin → Obiettivi → Voci.
insert into public.kpi_definitions (code, label, description, default_target_rule, sort_order) values
  ('WO', 'N. WO', 'Numero di work order (occhiali vista venduti)', '{"type": "assignment"}', 1),
  ('DOPPI_VISTA', 'Doppi vista', 'Secondo paio vista venduto insieme al primo', '{"type": "pct_of", "kpi": "WO", "pct": 0.2}', 2),
  ('PZ_SOLE', 'Pz sole', 'Pezzi sole venduti', '{"type": "assignment"}', 3),
  ('DOPPI_SOLE', 'Doppi sole', 'Secondo paio sole venduto insieme al primo', '{"type": "pct_of", "kpi": "PZ_SOLE", "pct": 0.2}', 4),
  ('META_RB_OO', 'META RB & OO', 'Occhiali smart Ray-Ban e Oakley Meta', '{"type": "fixed", "value": 1}', 5),
  ('DEMO_META', 'Demo META', 'Dimostrazioni degli occhiali Meta', '{"type": "fixed", "value": 3}', 6),
  ('DEMO_NUANCE', 'Demo NUANCE', 'Dimostrazioni Nuance Audio', '{"type": "fixed", "value": 2}', 7),
  ('NUANCE', 'NUANCE', 'Nuance Audio venduti', '{"type": "fixed", "value": 1}', 8),
  ('TRANSITION', 'Transition', 'Lenti fotocromatiche Transitions', '{"type": "pct_of", "kpi": "WO", "pct": 0.2}', 9),
  ('ETE', '&TE', 'Trattamenti &TE', '{"type": "pct_of", "kpi": "WO", "pct": 0.2}', 10),
  ('PROG', 'Progressivi', 'Lenti progressive', '{"type": "pct_of", "kpi": "WO", "pct": 0.1}', 11),
  ('ETE_CONTACT', '&-TE Contact', 'Contatti &-TE', '{"type": "fixed", "value": 1}', 12),
  ('ERGO', 'ERGO', 'Lenti ergonomiche', '{"type": "fixed", "value": 1}', 13),
  ('PROPOSTA_CHECK', 'Proposta check', 'Proposte di controllo della vista', '{"type": "fixed", "value": 2}', 14)
on conflict (code) do nothing;

insert into public.kpi_sets (name) values ('Vista'), ('Sole') on conflict (name) do nothing;

insert into public.kpi_set_items (set_id, kpi_id, label_override, sort_order)
select s.id, k.id, i.label_override, i.sort_order
from (values
  ('Vista', 'WO', null, 1), ('Vista', 'DOPPI_VISTA', null, 2), ('Vista', 'PZ_SOLE', 'Pz sole x ADV', 3),
  ('Vista', 'META_RB_OO', null, 4), ('Vista', 'DEMO_META', null, 5), ('Vista', 'DEMO_NUANCE', null, 6),
  ('Vista', 'NUANCE', null, 7), ('Vista', 'TRANSITION', null, 8), ('Vista', 'ETE', null, 9),
  ('Vista', 'PROG', null, 10), ('Vista', 'ETE_CONTACT', null, 11),
  ('Sole', 'PZ_SOLE', null, 1), ('Sole', 'DOPPI_SOLE', null, 2), ('Sole', 'META_RB_OO', 'META', 3),
  ('Sole', 'DEMO_META', null, 4), ('Sole', 'ETE_CONTACT', null, 5), ('Sole', 'ERGO', null, 6),
  ('Sole', 'PROPOSTA_CHECK', null, 7)
) as i (set_name, code, label_override, sort_order)
join public.kpi_sets s on s.name = i.set_name
join public.kpi_definitions k on k.code = i.code
on conflict do nothing;

-- Responsabilità iniziali (§8.4): i responsabili si assegnano da interfaccia.
insert into public.responsibilities (title, schedule_days, all_staff, sort_order)
select v.title, v.days::smallint[], v.all_staff, v.sort_order
from (values
  ('Montaggi', '{1,2,3,4,5,6,7}', false, 1),
  ('WhatsApp', '{1,2,3,4,5,6,7}', false, 2),
  ('Customer Connect', '{1,2,3,4,5,6,7}', false, 3),
  ('Magazzino (pacchi)', '{1,2,3,4,5,6}', false, 4),
  ('Controllo mail annulli WO e Smartly', '{3}', false, 5),
  ('Check WO (trasmitted)', '{1,2,3,4,5,6,7}', false, 6),
  ('Controllo cassetto (annullati)', '{1,2,3,4,5,6,7}', false, 7),
  ('Portale unico assicurazioni', '{1,2,3,4,5,6,7}', false, 8),
  ('Controllo Smart Portal aperti', '{1,2,3,4,5,6,7}', false, 9),
  ('Controllo stock LAC', '{1,2,3,4,5,6,7}', false, 10),
  ('Sostituzione antine sole', '{1,2,3,4,5,6,7}', false, 11),
  ('Ordini da fare', '{1,2,3,4,5,6,7}', true, 12),
  ('Carico bolle', '{1,2,3,4,5,6}', false, 13)
) as v (title, days, all_staff, sort_order)
where not exists (select 1 from public.responsibilities);

insert into public.performance_periods (year, label) values (2026, 'Performance 2026')
on conflict (year) do nothing;
