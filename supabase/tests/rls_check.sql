-- RLS の確認（T-02 の完了条件：別のチームのデータが読めないこと）
-- Supabase の SQL Editor に貼って実行する。最後に rollback するので、データは残らない。
-- 成功すると「RLS OK」と表示される。失敗すると、どの確認で失敗したかがエラーで出る。

begin;

-- 2人の部員と、それぞれのチームを用意する（postgres の権限で、RLS を通さずに作る）
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'rls-test-a@example.invalid'),
  ('00000000-0000-0000-0000-00000000000b', 'rls-test-b@example.invalid');

insert into public.teams (id, name) values
  ('10000000-0000-0000-0000-00000000000a', 'チームA'),
  ('10000000-0000-0000-0000-00000000000b', 'チームB');
insert into public.team_members (team_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'admin'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'admin');

insert into public.players (id, team_id, number, name) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 7, 'Aの選手'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 7, 'Bの選手');
insert into public.matches (id, team_id, kind) values
  ('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'practice'),
  ('30000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'practice');
insert into public.sets (id, match_id, set_no) values
  ('40000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 1),
  ('40000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000b', 1);
insert into public.serves (client_id, set_id, server_id, serve_type, result, recorded_at) values
  (gen_random_uuid(), '40000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'float', 'ace', now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'float', 'ace', now());

-- ここから部員Aとしてふるまう
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.teams;
  if n <> 1 then raise exception '確認1 失敗：見えるチームが % 件（1件のはず）', n; end if;

  select count(*) into n from public.players;
  if n <> 1 then raise exception '確認2 失敗：見える選手が % 件（1件のはず）', n; end if;

  select count(*) into n from public.serves;
  if n <> 1 then raise exception '確認3 失敗：見えるサーブが % 件（1件のはず）', n; end if;

  select count(*) into n from public.serves where set_id = '40000000-0000-0000-0000-00000000000b';
  if n <> 0 then raise exception '確認4 失敗：チームBのサーブが見える'; end if;

  -- 自分のチームには書ける
  insert into public.serves (client_id, set_id, server_id, serve_type, result, recorded_at)
  values (gen_random_uuid(), '40000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'jump', 'miss', now());

  -- チームBのセットには書けない
  begin
    insert into public.serves (client_id, set_id, server_id, serve_type, result, recorded_at)
    values (gen_random_uuid(), '40000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'float', 'ace', now());
    raise exception '確認5 失敗：チームBのセットに書けてしまった';
  exception when insufficient_privilege then null;
  end;

  -- 自分のセットに、チームBの選手のサーブは書けない
  begin
    insert into public.serves (client_id, set_id, server_id, serve_type, result, recorded_at)
    values (gen_random_uuid(), '40000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000b', 'float', 'ace', now());
    raise exception '確認6 失敗：チームBの選手でサーブを書けてしまった';
  exception when insufficient_privilege then null;
  end;

  -- チームBの選手は書き換えられない（見えないので 0 件の更新になる）
  update public.players set name = '書き換え' where id = '20000000-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception '確認7 失敗：チームBの選手を書き換えられた'; end if;

  -- チームは直接作れない（create_team() を使う）
  begin
    insert into public.teams (name) values ('直接作ったチーム');
    raise exception '確認8 失敗：チームを直接作れてしまった';
  exception when insufficient_privilege then null;
  end;

  -- create_team() で作ると、作った人が管理者になる
  perform public.create_team('新しいチーム');
  select count(*) into n from public.teams;
  if n <> 2 then raise exception '確認9 失敗：create_team() のあと見えるチームが % 件（2件のはず）', n; end if;
end;
$$;

-- 未ログイン（anon）には何も見えない
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.serves;
  if n <> 0 then raise exception '確認10 失敗：未ログインでサーブが % 件見える', n; end if;
end;
$$;

select 'RLS OK' as result;

rollback;
