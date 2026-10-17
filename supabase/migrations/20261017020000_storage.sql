-- Bucket di Storage (§5): `attachments` ed `exports` privati (URL firmati),
-- `avatars` e `branding` leggibili da tutti gli utenti autenticati.
-- Lo schema storage esiste solo su Supabase: altrove (test locali) si salta.

do $do$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'Schema storage assente: bucket non creati.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit)
  values
    ('attachments', 'attachments', false, 10485760),
    ('exports', 'exports', false, 52428800),
    ('avatars', 'avatars', false, 2097152),
    ('branding', 'branding', false, 2097152)
  on conflict (id) do nothing;

  -- Lettura: avatar e logo per tutti gli autenticati; allegati ed export solo admin
  -- (i dipendenti li scaricano tramite URL firmati generati dal server).
  execute $p$
    create policy "storage: lettura avatar e branding" on storage.objects
      for select to authenticated
      using (bucket_id in ('avatars', 'branding') or public.is_admin())
  $p$;

  -- Logo e allegati delle comunicazioni: solo admin.
  execute $p$
    create policy "storage: scrittura admin" on storage.objects
      for all to authenticated
      using (public.is_admin())
      with check (public.is_admin())
  $p$;

  -- Ogni utente gestisce la propria foto in avatars/<uid>/… e i propri allegati in attachments/<uid>/….
  execute $p$
    create policy "storage: file propri" on storage.objects
      for all to authenticated
      using (bucket_id in ('avatars', 'attachments') and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id in ('avatars', 'attachments') and (storage.foldername(name))[1] = auth.uid()::text)
  $p$;
end;
$do$;
