-- Fixes a "checking the table requires checking the table" loop that was
-- causing account loading to fail with a 500 error for everyone.

-- Remove the broken recursive policies
drop policy if exists "owner reads all profiles" on profiles;
drop policy if exists "owner updates all profiles" on profiles;

-- A small function allowed to check the table directly, breaking the loop
create or replace function is_owner()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from profiles where user_id = auth.uid() and role = 'owner');
$$;
grant execute on function is_owner() to authenticated;

-- Re-add the owner-visibility rules using the safe function instead
create policy "owner reads all profiles" on profiles for select to authenticated using (is_owner());
create policy "owner updates all profiles" on profiles for update to authenticated using (is_owner()) with check (is_owner());
