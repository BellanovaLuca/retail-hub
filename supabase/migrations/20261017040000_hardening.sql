-- Indurimento suggerito dagli advisor di sicurezza di Supabase.
-- Le viste "security definer" (public_profiles, leaves_public, published_shifts…) sono volute:
-- espongono solo le colonne e le righe ammesse, al posto delle tabelle protette da RLS.

alter function public.set_updated_at() set search_path = '';
alter function public.profiles_guard_self_update() set search_path = '';
alter function public.today_rome() set search_path = '';

-- Le funzioni dei trigger non vanno chiamate via API (il trigger scatta comunque).
revoke execute on function public.audit_row(), public.apply_approved_request(),
  public.revoke_request_leaves() from public, anon, authenticated;

-- Helper usati nelle policy: servono agli utenti autenticati, non agli anonimi.
revoke execute on function public.is_announcement_recipient(public.announcements, uuid),
  public.is_responsibility_assignee(uuid, uuid) from public, anon;
grant execute on function public.is_announcement_recipient(public.announcements, uuid),
  public.is_responsibility_assignee(uuid, uuid) to authenticated;
