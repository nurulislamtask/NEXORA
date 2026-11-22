-- Run after both migrations. Verifies user isolation and sync version bump.
grant all on all tables in schema public to authenticated; grant select on public.app_versions to anon;
insert into auth.users (id,email) values ('00000000-0000-0000-0000-00000000000a','a@x.io'),('00000000-0000-0000-0000-00000000000b','b@x.io');
select set_config('request.uid','00000000-0000-0000-0000-00000000000a',false);
set role authenticated;
insert into workspaces (user_id,name) values ('00000000-0000-0000-0000-00000000000a','A-ws');
insert into tasks (user_id,workspace_id,title) select user_id,id,'secret' from workspaces;
update tasks set title='secret2';
do $$ begin assert (select version from tasks)=2, 'version bump failed'; end $$;
select set_config('request.uid','00000000-0000-0000-0000-00000000000b',false);
do $$ begin assert (select count(*) from tasks)=0, 'RLS leak: B can read A tasks'; end $$;
do $$ begin
  begin insert into tasks (user_id,workspace_id,title) select '00000000-0000-0000-0000-00000000000a',id,'x' from (select gen_random_uuid() id) s;
    raise exception 'RLS allowed cross-user insert';
  exception when insufficient_privilege or foreign_key_violation then null; end;
end $$;
select 'RLS TESTS PASSED' as result;

-- Account deletion removes only the caller's data.
reset role; insert into workspaces (user_id,name) values ('00000000-0000-0000-0000-00000000000b','B-ws');
select set_config('request.uid','00000000-0000-0000-0000-00000000000b',false); set role authenticated;
select public.delete_my_account();
reset role;
do $$ begin
  assert (select count(*) from auth.users where id='00000000-0000-0000-0000-00000000000b')=0, 'B not deleted';
  assert (select count(*) from workspaces where user_id='00000000-0000-0000-0000-00000000000b')=0, 'B data not cascaded';
  assert (select count(*) from workspaces where user_id='00000000-0000-0000-0000-00000000000a')=1, 'A data was touched';
end $$;
set role anon; do $$ begin begin perform public.delete_my_account(); raise exception 'anon could call'; exception when insufficient_privilege then null; end; end $$;
reset role; select 'ACCOUNT DELETION TESTS PASSED' as result;
