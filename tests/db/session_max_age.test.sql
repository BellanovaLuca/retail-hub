-- Durata massima della sessione: oltre 30 giorni dall'accesso (claim `amr` del token) non si
-- legge né si scrive più nulla, anche con un token appena rinnovato.

begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000002a1'),
  ('00000000-0000-0000-0000-0000000002e1');
insert into public.profiles (id, first_name, last_name, display_name, employee_code, role) values
  ('00000000-0000-0000-0000-0000000002a1', 'Ada', 'Admin', 'Ada S', 'TST-S01', 'admin'),
  ('00000000-0000-0000-0000-0000000002e1', 'Elio', 'Uno', 'Elio S', 'TST-S02', 'employee');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000002a1', true);

do $$
declare
  now_s constant bigint := extract(epoch from now())::bigint;
  claims text;
begin
  -- Token senza `amr` (o impostazione assente): non si blocca.
  if not public.session_fresh() or not public.is_staff() or not public.is_admin() then
    raise exception 'FALLITO: senza istante dell''accesso la sessione deve valere';
  end if;
  perform set_config('request.jwt.claims', '{"amr": ["password"]}', true);
  if not public.session_fresh() then
    raise exception 'FALLITO: amr in forma non riconosciuta non deve bloccare';
  end if;

  -- Accesso di 29 giorni fa: vale.
  claims := format('{"amr": [{"method": "password", "timestamp": %s}]}', now_s - 29 * 86400);
  perform set_config('request.jwt.claims', claims, true);
  if not public.is_staff() or not public.is_admin() then
    raise exception 'FALLITO: a 29 giorni la sessione vale ancora';
  end if;
  if (select count(*) from public.profiles where employee_code like 'TST-S0%') <> 2 then
    raise exception 'FALLITO: l''admin deve leggere i profili';
  end if;

  -- Accesso di 31 giorni fa, token rinnovato un minuto fa: scaduta.
  claims := format(
    '{"amr": [{"method": "token_refresh", "timestamp": %s}, {"method": "password", "timestamp": %s}]}',
    now_s - 60, now_s - 31 * 86400);
  perform set_config('request.jwt.claims', claims, true);
  if public.session_fresh() or public.is_staff() or public.is_admin() then
    raise exception 'FALLITO: a 31 giorni la sessione è scaduta';
  end if;
  if (select count(*) from public.profiles) <> 0 then
    raise exception 'FALLITO: con la sessione scaduta non si legge nulla';
  end if;
  begin
    insert into public.notifications (profile_id, kind, title)
    values ('00000000-0000-0000-0000-0000000002a1', 'generic', 'x');
    raise exception 'FALLITO: con la sessione scaduta non si scrive nulla';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
