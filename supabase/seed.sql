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
