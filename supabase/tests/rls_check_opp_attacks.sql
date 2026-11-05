-- T-48 の確認：相手のスパイク（opp_attacks）の RLS と、足した制約（紅白戦・得点の理由・列の境目・選手の対応）
-- 20261105000000_opp_attacks_speed_scrimmage.sql を流したあとに、Supabase の SQL Editor に貼って実行する。
-- 最後に rollback するので、データは残らない。成功すると「T-48 OK」と表示される。

begin;

-- 2人の部員と、それぞれのチーム、選手、相手チーム、試合、セットを用意する（RLS を通さずに作る）
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
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 8, 'Aの選手2'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 7, 'Bの選手');
insert into public.opponents (id, team_id, name) values
  ('50000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '相手A'),
  ('50000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', '相手B');
insert into public.opponent_players (id, opponent_id, number) values
  ('60000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a', 4),
  ('60000000-0000-0000-0000-00000000000b', '50000000-0000-0000-0000-00000000000b', 4);
insert into public.matches (id, team_id, kind, opponent_id) values
  ('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'match', '50000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'match', '50000000-0000-0000-0000-00000000000b');
insert into public.sets (id, match_id, set_no) values
  ('40000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 1),
  ('40000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000b', 1);
insert into public.opp_attacks (client_id, set_id, digger_id, result, recorded_at) values
  (gen_random_uuid(), '40000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'A', now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'killed', now());

-- ここから部員Aとしてふるまう
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- ---- opp_attacks の RLS ----
  select count(*) into n from public.opp_attacks;
  if n <> 1 then raise exception '確認1 失敗：見える相手のスパイクが % 件（1件のはず）', n; end if;

  select count(*) into n from public.opp_attacks where set_id = '40000000-0000-0000-0000-00000000000b';
  if n <> 0 then raise exception '確認2 失敗：チームBの相手のスパイクが見える'; end if;

  -- 自分のチームには、すべての項目つきで書ける
  insert into public.opp_attacks (client_id, set_id, hitter_id, digger_id, from_x, from_y, to_x, to_y, speed, result, recorded_at)
  values (gen_random_uuid(), '40000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-00000000000a',
          '20000000-0000-0000-0000-00000000000a', 0.3, 0.9, 0.6, 1.1, 'fast', 'B', now());

  -- チームBのセットには書けない
  begin
    insert into public.opp_attacks (client_id, set_id, result, recorded_at)
    values (gen_random_uuid(), '40000000-0000-0000-0000-00000000000b', 'killed', now());
    raise exception '確認3 失敗：チームBのセットに書けてしまった';
  exception when insufficient_privilege then null;
  end;

  -- 自分のセットに、チームBの選手が拾ったとは書けない
  begin
    insert into public.opp_attacks (client_id, set_id, digger_id, result, recorded_at)
    values (gen_random_uuid(), '40000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000b', 'A', now());
    raise exception '確認4 失敗：チームBの選手を拾った選手にできてしまった';
  exception when insufficient_privilege then null;
  end;

  -- 打った相手選手は、チームBの相手チームの選手にできない
  begin
    insert into public.opp_attacks (client_id, set_id, hitter_id, result, recorded_at)
    values (gen_random_uuid(), '40000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-00000000000b', 'A', now());
    raise exception '確認5 失敗：チームBの相手選手を打った選手にできてしまった';
  exception when insufficient_privilege then null;
  end;

  -- チームBの行は書き換えられない（見えないので 0 件の更新）
  update public.opp_attacks set result = 'A' where set_id = '40000000-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception '確認6 失敗：チームBの相手のスパイクを書き換えられた'; end if;

  -- 結果の値の制約
  begin
    insert into public.opp_attacks (client_id, set_id, result, recorded_at)
    values (gen_random_uuid(), '40000000-0000-0000-0000-00000000000a', 'ace', now());
    raise exception '確認7 失敗：決められていない結果（ace）を書けてしまった';
  exception when check_violation then null;
  end;
  begin
    insert into public.opp_attacks (client_id, set_id, speed, result, recorded_at)
    values (gen_random_uuid(), '40000000-0000-0000-0000-00000000000a', 'medium', 'A', now());
    raise exception '確認8 失敗：決められていない速さ（medium）を書けてしまった';
  exception when check_violation then null;
  end;

  -- ---- 紅白戦（matches.kind） ----
  insert into public.matches (id, team_id, kind, opponent_id)
  values ('30000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'scrimmage', '50000000-0000-0000-0000-00000000000a');

  begin
    insert into public.matches (team_id, kind, opponent_id)
    values ('10000000-0000-0000-0000-00000000000a', 'practice', '50000000-0000-0000-0000-00000000000a');
    raise exception '確認9 失敗：練習に相手を付けられてしまった';
  exception when check_violation then null;
  end;
  begin
    insert into public.matches (team_id, kind) values ('10000000-0000-0000-0000-00000000000a', 'friendly');
    raise exception '確認10 失敗：決められていない種類（friendly）を書けてしまった';
  exception when check_violation then null;
  end;

  -- ---- B チームの選手にあたる自チームの選手（opponent_players.player_id） ----
  insert into public.opponent_players (opponent_id, number, player_id)
  values ('50000000-0000-0000-0000-00000000000a', 8, '20000000-0000-0000-0000-0000000000a2');

  begin
    insert into public.opponent_players (opponent_id, number, player_id)
    values ('50000000-0000-0000-0000-00000000000a', 9, '20000000-0000-0000-0000-00000000000b');
    raise exception '確認11 失敗：チームBの選手を B チームの選手に結べてしまった';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.opponent_players (opponent_id, number, player_id)
    values ('50000000-0000-0000-0000-00000000000a', 10, '20000000-0000-0000-0000-0000000000a2');
    raise exception '確認12 失敗：同じ部員が B チームに 2 回入れてしまった';
  exception when unique_violation then null;
  end;

  -- ---- 得点の理由 ----
  insert into public.points (client_id, set_id, side, cause, our_score, opp_score, recorded_at) values
    (gen_random_uuid(), '40000000-0000-0000-0000-00000000000a', 'opp', 'opp_kill', 0, 1, now()),
    (gen_random_uuid(), '40000000-0000-0000-0000-00000000000a', 'us', 'opp_attack_error', 1, 1, now());
  begin
    insert into public.points (client_id, set_id, side, cause, our_score, opp_score, recorded_at)
    values (gen_random_uuid(), '40000000-0000-0000-0000-00000000000a', 'us', 'unknown', 1, 1, now());
    raise exception '確認13 失敗：決められていない理由を書けてしまった';
  exception when check_violation then null;
  end;

  -- ---- 速さと矢印（serves・attacks） ----
  insert into public.serves (client_id, set_id, server_id, serve_type, speed, result, recorded_at)
  values (gen_random_uuid(), '40000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'float', 'slow', 'ace', now());
  insert into public.attacks (client_id, set_id, attacker_id, from_x, from_y, to_x, to_y, speed, result, recorded_at)
  values (gen_random_uuid(), '40000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 0.2, 0.8, 0.7, 0.2, 'fast', 'kill', now());

  -- ---- 列の境目（sets.col_split_1・2） ----
  update public.sets set col_split_1 = 0.3, col_split_2 = 0.7 where id = '40000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  if n <> 1 then raise exception '確認14 失敗：列の境目を設定できない'; end if;
  begin
    update public.sets set col_split_1 = 0.3, col_split_2 = null where id = '40000000-0000-0000-0000-00000000000a';
    raise exception '確認15 失敗：片方だけ設定できてしまった';
  exception when check_violation then null;
  end;
  begin
    update public.sets set col_split_1 = 0.7, col_split_2 = 0.3 where id = '40000000-0000-0000-0000-00000000000a';
    raise exception '確認16 失敗：左が右より大きい境目を設定できてしまった';
  exception when check_violation then null;
  end;
  begin
    update public.sets set col_split_1 = 0.3, col_split_2 = 1.2 where id = '40000000-0000-0000-0000-00000000000a';
    raise exception '確認17 失敗：範囲外（1 より大きい）の境目を設定できてしまった';
  exception when check_violation then null;
  end;
  -- 両方空に戻せる（既定の 3 等分）
  update public.sets set col_split_1 = null, col_split_2 = null where id = '40000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  if n <> 1 then raise exception '確認18 失敗：列の境目を既定に戻せない'; end if;
end;
$$;

-- 未ログイン（anon）には何も見えない
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.opp_attacks;
  if n <> 0 then raise exception '確認19 失敗：未ログインで相手のスパイクが % 件見える', n; end if;
end;
$$;

select 'T-48 OK' as result;

rollback;
