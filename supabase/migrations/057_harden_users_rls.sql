-- 057_harden_users_rls.sql
-- Hardening RLS su public.users — GIA' APPLICATA IN PRODUZIONE via SQL Editor.
-- Questo file riallinea il repo allo stato del DB (chiude il drift file<->DB).
-- Chiude tre falle: (a) INSERT non autenticato, (b) self-elevation via UPDATE,
-- (c) DELETE no-op. Registrazione (handle_new_user) e inviti (invite_user) sono
-- SECURITY DEFINER: non passano dalle policy, quindi non sono toccati.
begin;

revoke insert on public.users from anon;

drop policy if exists users_insert_anyone        on public.users;
drop policy if exists users_insert_admin_or_self on public.users;
create policy users_insert_admin_or_self
on public.users
for insert
to authenticated
with check (
  get_my_role() = any (array['admin','super_admin'])
  or (auth_id = auth.uid() and role = 'operatore')
);

drop policy if exists users_update on public.users;
create policy users_update
on public.users
for update
to authenticated
using (
  auth_id = auth.uid()
  or get_my_role() = any (array['admin','super_admin'])
)
with check (
  get_my_role() = any (array['admin','super_admin'])
  or role = get_my_role()
);

drop policy if exists users_delete_admin on public.users;
create policy users_delete_admin
on public.users
for delete
to authenticated
using (
  get_my_role() = any (array['admin','super_admin'])
);

commit;
