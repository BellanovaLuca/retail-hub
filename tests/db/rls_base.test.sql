-- RLS di base: un dipendente non vede i profili completi degli altri e non può
-- cambiare ruolo, ore o note; un admin può tutto; il registro traccia l'admin.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'adm-001@staff.cordusio.local'),
  ('00000000-0000-0000-0000-0000000000e1', 'crd-001@staff.cordusio.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'crd-002@staff.cordusio.local');

insert into public.profiles (id, first_name, last_name, display_name, employee_code, role, weekly_hours, admin_notes) values
  ('00000000-0000-0000-0000-00000000000a', 'Anna', 'Admin', 'Anna', 'ADM-001', 'admin', 40, null),
  ('00000000-0000-0000-0000-0000000000e1', 'Francesca', 'Uno', 'Francesca', 'CRD-001', 'employee', 40, 'riservato 1'),
  ('00000000-0000-0000-0000-0000000000e2', 'Francesca', 'Due', 'Francy', 'CRD-002', 'employee', 24, 'riservato 2');

-- Nome visualizzato univoco, anche cambiando le maiuscole.
do $$
begin
  begin
    insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000e3');
    insert into public.profiles (id, first_name, last_name, display_name, employee_code)
    values ('00000000-0000-0000-0000-0000000000e3', 'Francesca', 'Tre', 'FRANCY', 'CRD-003');
    raise exception 'FALLITO: due persone con lo stesso nome visualizzato';
  exception when unique_violation then null;
  end;
end;
$$;

-- ---- come dipendente -------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);

do $$
declare
  n int;
begin
  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'FALLITO: il dipendente vede % profili completi (atteso 1)', n; end if;

  select count(*) into n from public.public_profiles;
  if n <> 3 then raise exception 'FALLITO: public_profiles mostra % righe (attese 3)', n; end if;

  if public.is_admin() then raise exception 'FALLITO: il dipendente risulta admin'; end if;

  select count(*) into n from public.audit_log;
  if n <> 0 then raise exception 'FALLITO: il dipendente legge il registro modifiche'; end if;

  -- Contatti propri: ammesso.
  update public.profiles set phone = '+39 000 0000000' where id = auth.uid();

  -- Ruolo proprio: vietato.
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'FALLITO: il dipendente si è dato il ruolo admin';
  exception when insufficient_privilege then null;
  end;

  -- Profilo altrui: invisibile, quindi nessuna riga aggiornata.
  update public.profiles set phone = 'x' where id = '00000000-0000-0000-0000-0000000000e2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLITO: il dipendente modifica un altro profilo'; end if;

  -- Impostazioni: sola lettura.
  update public.store_settings set request_notice_days = 1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLITO: il dipendente modifica le impostazioni'; end if;

  begin
    perform 1 from public.login_attempts;
    raise exception 'FALLITO: il dipendente legge i tentativi di accesso';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- ---- come admin ------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

do $$
declare
  n int;
begin
  if not public.is_admin() then raise exception 'FALLITO: l''admin non risulta admin'; end if;

  select count(*) into n from public.profiles;
  if n <> 3 then raise exception 'FALLITO: l''admin vede % profili (attesi 3)', n; end if;

  update public.profiles set weekly_hours = 32 where id = '00000000-0000-0000-0000-0000000000e2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLITO: l''admin non modifica le ore'; end if;

  select count(*) into n
  from public.audit_log
  where entity = 'profiles'
    and entity_id = '00000000-0000-0000-0000-0000000000e2'
    and actor_id = auth.uid()
    and diff ? 'weekly_hours';
  if n <> 1 then raise exception 'FALLITO: la modifica dell''admin non è nel registro'; end if;
end;
$$;

-- ---- anonimo ---------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

do $$
begin
  begin
    perform 1 from public.public_profiles;
    raise exception 'FALLITO: un utente anonimo legge public_profiles';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
