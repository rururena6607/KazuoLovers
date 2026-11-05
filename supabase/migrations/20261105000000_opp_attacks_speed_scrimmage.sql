-- T-48 相手のスパイク・速さ・矢印・列の境目・紅白戦の記録（F-24〜F-27、要件定義書 7 章）
-- contracts（#51）に合わせて、既存の表に列と制約を足し、相手のスパイクの表（opp_attacks）を作る。
-- 既存の行は変えない（足す列はすべて空でよい）。流すのは1回だけ（README）。
-- 全体を1つのトランザクションにする：途中で失敗したら、何も変わらない（半端な状態を残さない）。

begin;

-- ---------------------------------------------------------------------------
-- 紅白戦（F-27）：matches.kind に scrimmage を足す
-- B チームは相手チーム（opponent_id）として持つ。練習だけが相手を持たない
-- ---------------------------------------------------------------------------

alter table public.matches drop constraint matches_kind_check;
alter table public.matches drop constraint matches_check;
alter table public.matches
  add constraint matches_kind_check check (kind in ('match', 'practice', 'scrimmage'));
alter table public.matches
  add constraint matches_practice_no_opponent check (kind <> 'practice' or opponent_id is null);

-- B チームの選手にあたる自チームの選手（紅白戦のときだけ。ふつうの試合は空）
alter table public.opponent_players
  add column player_id uuid references public.players (id) on delete set null;
-- 同じ部員が B チームに 2 回入らない
create unique index opponent_players_player_uniq
  on public.opponent_players (opponent_id, player_id) where player_id is not null;

-- 対応づける自チームの選手は、同じチームの選手だけ（ほかのチームの選手を結べない）
drop policy opponent_players_all on public.opponent_players;
create policy opponent_players_all on public.opponent_players for all to authenticated
  using (private.is_member(private.team_of_opponent(opponent_id)))
  with check (
    private.is_member(private.team_of_opponent(opponent_id))
    and (player_id is null or private.team_of_player(player_id) = private.team_of_opponent(opponent_id))
  );

-- ---------------------------------------------------------------------------
-- 得点の理由：相手のスパイクで得点が決まる場合（要件定義書 6 章「得点とサーブ権」）
-- ---------------------------------------------------------------------------

alter table public.points drop constraint points_cause_check;
alter table public.points
  add constraint points_cause_check check (cause in (
    'ace', 'serve_miss', 'opp_miss', 'aced', 'kill', 'attack_error', 'blocked',
    'opp_kill', 'opp_attack_error', 'manual'
  ));

-- ---------------------------------------------------------------------------
-- 速さ（F-26）と、アタックの矢印（F-20）。どれも任意
-- ---------------------------------------------------------------------------

alter table public.serves
  add column speed text check (speed in ('fast', 'slow'));

alter table public.attacks
  add column from_x public.coord,
  add column from_y public.coord,
  add column speed  text check (speed in ('fast', 'slow'));

-- ---------------------------------------------------------------------------
-- セットごとの列の境目（F-24）。相手コートの縦の点線 2 本。
-- 両方空 ＝ 既定（3 等分。アプリの DEFAULT_COL_SPLITS）。設定するときは両方そろえ、0 ≤ 左 < 右 ≤ 1
-- ---------------------------------------------------------------------------

alter table public.sets
  add column col_split_1 real,
  add column col_split_2 real,
  add constraint sets_col_split_check check (
    (col_split_1 is null and col_split_2 is null)
    or (col_split_1 is not null and col_split_2 is not null
        and col_split_1 >= 0 and col_split_2 <= 1 and col_split_1 < col_split_2)
  );

-- ---------------------------------------------------------------------------
-- 相手のスパイク1本と、自チームのレシーブ（ディグ。F-25）
-- result：killed（拾えず）、A〜D（拾えた）、opp_error（相手のアタックミス）
-- from_x・from_y は相手が打った位置（相手コート）、to_x・to_y は落ちた位置または拾った位置（自コート）
-- ---------------------------------------------------------------------------

create table public.opp_attacks (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null unique,
  set_id      uuid not null references public.sets (id) on delete cascade,
  hitter_id   uuid references public.opponent_players (id) on delete set null,
  digger_id   uuid references public.players (id) on delete set null,
  from_x      public.coord,
  from_y      public.coord,
  to_x        public.coord,
  to_y        public.coord,
  speed       text check (speed in ('fast', 'slow')),
  result      text not null check (result in ('killed', 'A', 'B', 'C', 'D', 'opp_error')),
  recorded_at timestamptz not null,
  created_by  uuid default auth.uid() references auth.users (id) on delete set null
);
create index opp_attacks_set_id_idx on public.opp_attacks (set_id);

alter table public.opp_attacks enable row level security;

-- ほかの記録と同じ：セットが自分のチームのもので、打った相手選手・拾った選手も同じチームのものであること
create policy opp_attacks_all on public.opp_attacks for all to authenticated
  using (private.is_member(private.team_of_set(set_id)))
  with check (
    private.is_member(private.team_of_set(set_id))
    and (hitter_id is null or private.team_of_opponent_player(hitter_id) = private.team_of_set(set_id))
    and (digger_id is null or private.team_of_player(digger_id) = private.team_of_set(set_id))
  );

-- ほかの端末に反映する（T-25 と同じ）
alter publication supabase_realtime add table public.opp_attacks;

commit;
