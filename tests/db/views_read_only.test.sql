-- Le viste sono di sola lettura: nessun ruolo dell'API può scriverci (scavalcherebbero la RLS).

begin;

do $$
declare
  bad text;
begin
  select string_agg(format('%s:%s:%s', g.table_name, g.grantee, g.privilege_type), ', ')
    into bad
    from information_schema.role_table_grants g
    join pg_class c on c.relname = g.table_name and c.relnamespace = 'public'::regnamespace
   where g.table_schema = 'public'
     and c.relkind in ('v', 'm')
     and g.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
     and g.privilege_type <> 'SELECT';
  if bad is not null then
    raise exception 'FALLITO: viste scrivibili: %', bad;
  end if;
  if exists (
    select 1
      from information_schema.role_table_grants g
      join pg_class c on c.relname = g.table_name and c.relnamespace = 'public'::regnamespace
     where g.table_schema = 'public' and c.relkind in ('v', 'm') and g.grantee in ('anon', 'PUBLIC')
  ) then
    raise exception 'FALLITO: una vista è leggibile senza accesso';
  end if;
end;
$$;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000003a1'),
  ('00000000-0000-0000-0000-0000000003e1');
insert into public.profiles (id, first_name, last_name, display_name, employee_code, role) values
  ('00000000-0000-0000-0000-0000000003a1', 'Ada', 'Admin', 'Ada V', 'TST-V01', 'admin'),
  ('00000000-0000-0000-0000-0000000003e1', 'Elio', 'Uno', 'Elio V', 'TST-V02', 'employee');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000003e1', true);

do $$
begin
  -- Si legge ancora.
  if (select count(*) from public.public_profiles where display_name in ('Ada V', 'Elio V')) <> 2 then
    raise exception 'FALLITO: la vista dei profili deve restare leggibile';
  end if;
  begin
    delete from public.public_profiles where id = '00000000-0000-0000-0000-0000000003a1';
    raise exception 'FALLITO: un dipendente cancella un profilo dalla vista';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.public_profiles set avatar_url = 'x' where id = '00000000-0000-0000-0000-0000000003a1';
    raise exception 'FALLITO: un dipendente modifica un profilo dalla vista';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.leaves_public (profile_id, date)
    values ('00000000-0000-0000-0000-0000000003e1', '2030-01-01');
    raise exception 'FALLITO: un dipendente inserisce un''assenza dalla vista';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.published_weeks set note = 'x';
    raise exception 'FALLITO: un dipendente modifica le settimane pubblicate';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.my_performance_goals set progress = 'x';
    raise exception 'FALLITO: un dipendente modifica la propria valutazione';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
