-- Valgono solo le sessioni registrate dall'accesso dell'app (login_sessions).

begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000005e1'),
  ('00000000-0000-0000-0000-0000000005e2');
insert into public.profiles
  (id, first_name, last_name, display_name, employee_code, role, must_change_pin, privacy_accepted_at)
values
  ('00000000-0000-0000-0000-0000000005e1', 'Elio', 'Uno', 'Elio L', 'TST-L01', 'employee', false, now()),
  ('00000000-0000-0000-0000-0000000005e2', 'Elsa', 'Due', 'Elsa L', 'TST-L02', 'employee', false, now());
insert into public.login_sessions (session_id, profile_id) values
  ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-0000000005e1'),
  ('00000000-0000-0000-0000-00000000aa02', '00000000-0000-0000-0000-0000000005e2');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005e1', true);

do $$
begin
  -- Sessione registrata: vale.
  perform set_config('request.jwt.claims', '{"session_id": "00000000-0000-0000-0000-00000000aa01"}', true);
  if not public.is_staff() or (select count(*) from public.public_profiles) = 0 then
    raise exception 'FALLITO: la sessione registrata deve valere';
  end if;
  -- Sessione aperta parlando direttamente con Supabase Auth: non vale.
  perform set_config('request.jwt.claims', '{"session_id": "00000000-0000-0000-0000-00000000bb99"}', true);
  if public.is_staff() or public.is_active_account() then
    raise exception 'FALLITO: una sessione non registrata non deve valere';
  end if;
  if (select count(*) from public.profiles) <> 0 or (select count(*) from public.public_profiles) <> 0 then
    raise exception 'FALLITO: con una sessione non registrata non si legge nulla';
  end if;
  -- La sessione di un altro non vale per me.
  perform set_config('request.jwt.claims', '{"session_id": "00000000-0000-0000-0000-00000000aa02"}', true);
  if public.is_staff() then
    raise exception 'FALLITO: sessione registrata per un''altra persona';
  end if;
  -- Identificativo malformato: semplicemente non vale.
  perform set_config('request.jwt.claims', '{"session_id": "non-un-uuid"}', true);
  if public.is_staff() then
    raise exception 'FALLITO: identificativo di sessione non valido';
  end if;
  -- Il registro non si legge né si scrive dall'API.
  perform set_config('request.jwt.claims', '{"session_id": "00000000-0000-0000-0000-00000000aa01"}', true);
  begin
    insert into public.login_sessions (session_id, profile_id)
    values ('00000000-0000-0000-0000-00000000bb99', auth.uid());
    raise exception 'FALLITO: un utente registra da sé una sessione';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.login_sessions;
    raise exception 'FALLITO: il registro delle sessioni è leggibile';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Tolta la riga (uscita da tutti i dispositivi, reset del PIN) la sessione smette subito di valere.
reset role;
delete from public.login_sessions where profile_id = '00000000-0000-0000-0000-0000000005e1';
set local role authenticated;
do $$
begin
  if public.is_staff() then
    raise exception 'FALLITO: sessione ancora valida dopo la chiusura';
  end if;
end;
$$;

rollback;
