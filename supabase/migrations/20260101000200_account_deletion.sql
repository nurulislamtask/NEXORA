-- Self-service account deletion. SECURITY DEFINER lets an authenticated user delete only THEIR OWN auth row;
-- every user-owned table references auth.users ON DELETE CASCADE, so all cloud rows go with it.
-- Files in Storage are NOT removed by this (delete them via the Storage API first; the app does this before calling).
create or replace function public.delete_my_account() returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
