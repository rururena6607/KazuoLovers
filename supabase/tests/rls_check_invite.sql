-- T-43 の確認：招待コードの発行・参加と、参加で前のチームから抜ける・消える動き
-- 20261112000000_invite_code.sql と 20261112010000_invite_code_fix.sql を流したあとに、Supabase の SQL Editor に貼って実行する。
-- 最後に rollback するので、データは残らない。成功すると「T-43 OK」と表示される。

begin;

-- チームA：a が1人だけの管理者。チームB：b が管理者、c が部員。チームC：x と y の2人が管理者。d はどこにも入っていない
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'invite-test-a@example.invalid'),
  ('00000000-0000-0000-0000-00000000000b', 'invite-test-b@example.invalid'),
  ('00000000-0000-0000-0000-00000000000c', 'invite-test-c@example.invalid'),
  ('00000000-0000-0000-0000-00000000000d', 'invite-test-d@example.invalid'),
  ('00000000-0000-0000-0000-0000000000e1', 'invite-test-x@example.invalid'),
  ('00000000-0000-0000-0000-0000000000e2', 'invite-test-y@example.invalid');
insert into public.teams (id, name) values
  ('10000000-0000-0000-0000-00000000000a', 'チームA'),
  ('10000000-0000-0000-0000-00000000000b', 'チームB'),
  ('10000000-0000-0000-0000-00000000000c', 'チームC');
insert into public.team_members (team_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'admin'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'admin'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c', 'member'),
  ('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000e1', 'admin'),
  ('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000e2', 'admin');
insert into public.players (id, team_id, number, name) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 7, 'Aの選手');
-- チームA には記録もある（記録が選手を参照していても、チームを消せることを確かめる）
insert into public.matches (id, team_id, kind) values
  ('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'practice');
insert into public.sets (id, match_id, set_no) values
  ('40000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 1);
insert into public.serves (client_id, set_id, server_id, serve_type, result, recorded_at) values
  (gen_random_uuid(), '40000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'float', 'in', now());
insert into public.receptions (client_id, set_id, receiver_id, result, recorded_at) values
  (gen_random_uuid(), '40000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'A', now());
insert into public.attacks (client_id, set_id, attacker_id, result, recorded_at) values
  (gen_random_uuid(), '40000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'kill', now());

set local role authenticated;

-- 部員 c：コードは見えない・作れない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
do $$
declare info jsonb;
begin
  begin
    perform invite_code from public.teams;
    raise exception '確認1 失敗：部員が invite_code を読めてしまった';
  exception when insufficient_privilege then null;
  end;

  -- name は今までどおり読める
  perform name from public.teams;

  info := public.invite_info('10000000-0000-0000-0000-00000000000b');
  if (info->>'is_admin')::boolean or info->>'code' is not null then
    raise exception '確認2 失敗：部員に招待コードが返った（%）', info;
  end if;

  begin
    perform public.regenerate_invite_code('10000000-0000-0000-0000-00000000000b');
    raise exception '確認3 失敗：部員が招待コードを発行できてしまった';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 管理者 b：発行・再発行。前のコードは使えなくなる。コードを直接書き換えることはできない
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
do $$
declare first_code text; second_code text; info jsonb;
begin
  first_code := public.regenerate_invite_code('10000000-0000-0000-0000-00000000000b');
  if first_code !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$' then
    raise exception '確認4 失敗：コードの形が違う（%）', first_code;
  end if;
  second_code := public.regenerate_invite_code('10000000-0000-0000-0000-00000000000b');
  info := public.invite_info('10000000-0000-0000-0000-00000000000b');
  if not (info->>'is_admin')::boolean or info->>'code' <> second_code or second_code = first_code then
    raise exception '確認5 失敗：再発行したコードが返らない（%）', info;
  end if;
  perform set_config('t43.old_code', first_code, true);
  perform set_config('t43.code_b', second_code, true);

  begin
    update public.teams set invite_code = 'AAAAAAAA' where id = '10000000-0000-0000-0000-00000000000b';
    raise exception '確認6 失敗：管理者がコードを直接書き換えられた';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 管理者 a と x：あとで使うコードを発行しておく
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select set_config('t43.code_a', public.regenerate_invite_code('10000000-0000-0000-0000-00000000000a'), true);

-- どこにも入っていない d：古いコード・違うコードは見つからない。小文字・ハイフンつきでも参加できる
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
do $$
declare p jsonb; joined jsonb; typed text;
begin
  begin
    perform public.preview_join(current_setting('t43.old_code'));
    raise exception '確認7 失敗：再発行の前のコードで見つかった';
  exception when raise_exception then
    if sqlerrm like '確認7%' then raise; end if;
  end;

  -- 小文字、ハイフンに似た文字（‐ U+2010）、空白が入っていても見つかる
  typed := lower(substr(current_setting('t43.code_b'), 1, 4) || '‐ ' || substr(current_setting('t43.code_b'), 5));
  p := public.preview_join(typed);
  if p->>'team_name' <> 'チームB' or p->'leaving' <> '[]'::jsonb or p->'deleting' <> '[]'::jsonb then
    raise exception '確認8 失敗：参加前の確認が違う（%）', p;
  end if;

  joined := public.join_team(typed);
  if joined->>'name' <> 'チームB' then raise exception '確認9 失敗：参加したチームが違う（%）', joined; end if;
  if not exists (select 1 from public.team_members where team_id = '10000000-0000-0000-0000-00000000000b'
                 and user_id = '00000000-0000-0000-0000-00000000000d' and role = 'member') then
    raise exception '確認9 失敗：部員として入っていない';
  end if;

  begin
    perform public.preview_join(current_setting('t43.code_b'));
    raise exception '確認10 失敗：すでに入っているチームに、もう一度参加できる';
  exception when raise_exception then
    if sqlerrm like '確認10%' then raise; end if;
  end;
end $$;

-- 部員 c：チームA に移る。B からは抜けるが、B は消えない（管理者 b がいる）
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
do $$
declare p jsonb;
begin
  p := public.preview_join(current_setting('t43.code_a'));
  if p->'leaving' <> '["チームB"]'::jsonb or p->'deleting' <> '[]'::jsonb then
    raise exception '確認11 失敗：抜けるチームの表示が違う（%）', p;
  end if;
  perform public.join_team(current_setting('t43.code_a'));
  if (select count(*) from public.teams) <> 1 or (select name from public.teams) <> 'チームA' then
    raise exception '確認12 失敗：移ったあとに見えるチームが違う';
  end if;
end $$;

-- 管理者が自分だけの a：チームB に移ると、チームA が消える。allow_delete なしでは止まる
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$
declare p jsonb;
begin
  p := public.preview_join(current_setting('t43.code_b'));
  if p->'leaving' <> '[]'::jsonb or p->'deleting' <> '["チームA"]'::jsonb then
    raise exception '確認13 失敗：消えるチームの表示が違う（%）', p;
  end if;
  begin
    perform public.join_team(current_setting('t43.code_b'));
    raise exception '確認14 失敗：確かめずにチームを消せてしまった';
  exception when raise_exception then
    if sqlerrm like '確認14%' then raise; end if;
  end;
  perform public.join_team(current_setting('t43.code_b'), true);
end $$;

-- 管理者が2人いる C の y：移っても C は残る
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
do $$
declare p jsonb; code_b text;
begin
  code_b := current_setting('t43.code_b');
  p := public.preview_join(code_b);
  if p->'leaving' <> '["チームC"]'::jsonb or p->'deleting' <> '[]'::jsonb then
    raise exception '確認15 失敗：管理者がほかにいるのに消えると出た（%）', p;
  end if;
  perform public.join_team(code_b);
end $$;

reset role;
do $$
begin
  if exists (select 1 from public.teams where id = '10000000-0000-0000-0000-00000000000a') then
    raise exception '確認16 失敗：チームA が消えていない';
  end if;
  if exists (select 1 from public.players where team_id = '10000000-0000-0000-0000-00000000000a') then
    raise exception '確認16 失敗：チームA の選手が残っている';
  end if;
  if exists (select 1 from public.matches where team_id = '10000000-0000-0000-0000-00000000000a')
     or exists (select 1 from public.serves where set_id = '40000000-0000-0000-0000-00000000000a') then
    raise exception '確認16 失敗：チームA の試合・記録が残っている';
  end if;
  if exists (select 1 from public.team_members where user_id = '00000000-0000-0000-0000-00000000000c') then
    raise exception '確認17 失敗：消えたチームの部員 c の所属が残っている';
  end if;
  if not exists (select 1 from public.team_members where team_id = '10000000-0000-0000-0000-00000000000c'
                 and user_id = '00000000-0000-0000-0000-0000000000e1' and role = 'admin') then
    raise exception '確認18 失敗：チームC と管理者 x が残っていない';
  end if;
  if (select count(*) from public.team_members where team_id = '10000000-0000-0000-0000-00000000000b') <> 4 then
    raise exception '確認19 失敗：チームB の人数が違う（b・d・a・y の4人のはず）';
  end if;
end $$;

select 'T-43 OK' as result;

rollback;
