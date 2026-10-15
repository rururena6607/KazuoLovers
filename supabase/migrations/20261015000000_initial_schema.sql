-- T-02 テーブルと RLS（要件定義書 7 章・9 章）
-- データは「チーム → 試合 → セット → サーブ／レシーブ／アタック／得点」を外部キーでつなぐ。
-- RLS で「自分のチームのデータだけ読み書きできる」を保証する。


-- ---------------------------------------------------------------------------
-- テーブル
-- ---------------------------------------------------------------------------

create table public.teams (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 100),
  invite_code   text unique,
  line_group_id text,
  created_at    timestamptz not null default now()
);

create table public.team_members (
  team_id    uuid not null references public.teams (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_id_idx on public.team_members (user_id);

create table public.players (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams (id) on delete cascade,
  number     smallint not null check (number between 0 and 99),
  name       text not null check (char_length(name) between 1 and 50),
  position   text,
  serve_type text not null default 'float' check (serve_type in ('float', 'jump_float', 'jump', 'other')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index players_team_id_idx on public.players (team_id);

create table public.opponents (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now()
);
create index opponents_team_id_idx on public.opponents (team_id);

create table public.opponent_players (
  id          uuid primary key default gen_random_uuid(),
  opponent_id uuid not null references public.opponents (id) on delete cascade,
  number      smallint not null check (number between 0 and 99),
  created_at  timestamptz not null default now(),
  unique (opponent_id, number)
);

create table public.matches (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  kind        text not null default 'match' check (kind in ('match', 'practice')),
  opponent_id uuid references public.opponents (id) on delete set null,
  date        date not null default current_date,
  tournament  text,
  set_points  smallint not null default 25 check (set_points between 1 and 50),
  created_at  timestamptz not null default now(),
  -- 練習には相手がいない
  check (kind = 'match' or opponent_id is null)
);
create index matches_team_id_idx on public.matches (team_id);

create table public.sets (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches (id) on delete cascade,
  set_no     smallint not null check (set_no between 1 and 5),
  our_score  smallint not null default 0 check (our_score >= 0),
  opp_score  smallint not null default 0 check (opp_score >= 0),
  created_at timestamptz not null default now(),
  unique (match_id, set_no)
);

-- 座標は 0.0〜1.0。アウトは範囲外（例：1.1）も許すので、少し広めに取る
create domain public.coord as real check (value between -0.5 and 1.5);

create table public.serves (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null unique,
  set_id      uuid not null references public.sets (id) on delete cascade,
  server_id   uuid not null references public.players (id),
  serve_type  text not null check (serve_type in ('float', 'jump_float', 'jump', 'other')),
  from_x      public.coord,
  to_x        public.coord,
  to_y        public.coord,
  target_zone smallint check (target_zone between 1 and 9),
  result      text not null check (result in ('ace', 'in', 'miss')),
  miss_type   text check (miss_type in ('net', 'out', 'other')),
  reception   text check (reception in ('A', 'B', 'C', 'D')),
  receiver_id uuid references public.opponent_players (id) on delete set null,
  recorded_at timestamptz not null,
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  check (miss_type is null or result = 'miss'),
  check (reception is null or result = 'in')
);
create index serves_set_id_idx on public.serves (set_id);

create table public.receptions (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null unique,
  set_id         uuid not null references public.sets (id) on delete cascade,
  receiver_id    uuid references public.players (id),
  opp_server_id  uuid references public.opponent_players (id) on delete set null,
  opp_serve_type text check (opp_serve_type in ('float', 'jump_float', 'jump', 'other')),
  at_x           public.coord,
  at_y           public.coord,
  result         text not null check (result in ('ace', 'A', 'B', 'C', 'D', 'opp_miss')),
  recorded_at    timestamptz not null,
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  -- 相手ミス以外は、受けた選手がいる
  check (result = 'opp_miss' or receiver_id is not null)
);
create index receptions_set_id_idx on public.receptions (set_id);

create table public.attacks (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null unique,
  set_id         uuid not null references public.sets (id) on delete cascade,
  attacker_id    uuid not null references public.players (id),
  attack_type    text check (attack_type in ('left', 'center', 'right', 'back', 'other')),
  is_back        boolean not null default false,
  to_x           public.coord,
  to_y           public.coord,
  result         text not null check (result in ('kill', 'continue', 'error', 'blocked')),
  prev_reception text check (prev_reception in ('A', 'B', 'C', 'D')),
  recorded_at    timestamptz not null,
  created_by     uuid default auth.uid() references auth.users (id) on delete set null
);
create index attacks_set_id_idx on public.attacks (set_id);

create table public.points (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null unique,
  set_id      uuid not null references public.sets (id) on delete cascade,
  side        text not null check (side in ('us', 'opp')),
  cause       text not null check (cause in ('ace', 'serve_miss', 'opp_miss', 'aced', 'kill', 'attack_error', 'blocked', 'manual')),
  -- 元になったサーブ・レシーブ・アタックの client_id。テーブルをまたぐので外部キーにしない
  source_id   uuid,
  our_score   smallint not null check (our_score >= 0),
  opp_score   smallint not null check (opp_score >= 0),
  recorded_at timestamptz not null,
  created_by  uuid default auth.uid() references auth.users (id) on delete set null
);
create index points_set_id_idx on public.points (set_id);

create table public.ai_reports (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams (id) on delete cascade,
  scope      text not null,
  input_json jsonb not null,
  comment    text not null,
  created_at timestamptz not null default now()
);
create index ai_reports_team_scope_idx on public.ai_reports (team_id, scope);

-- ---------------------------------------------------------------------------
-- RLS の判定に使う関数
-- security definer にして、判定のために team_members などを読めるようにする。
-- 関数の中で RLS を通すと、判定のたびに判定が呼ばれて止まらなくなるため。
-- ---------------------------------------------------------------------------

create schema if not exists private;

create function private.is_member(t uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = t and m.user_id = (select auth.uid())
  );
$$;

create function private.is_admin(t uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = t and m.user_id = (select auth.uid()) and m.role = 'admin'
  );
$$;

create function private.team_of_set(s uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.team_id from public.sets x join public.matches m on m.id = x.match_id where x.id = s;
$$;

create function private.team_of_match(mt uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select team_id from public.matches where id = mt;
$$;

create function private.team_of_opponent(o uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select team_id from public.opponents where id = o;
$$;

create function private.team_of_player(p uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select team_id from public.players where id = p;
$$;

create function private.team_of_opponent_player(op uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select o.team_id from public.opponent_players x join public.opponents o on o.id = x.opponent_id where x.id = op;
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ログインした部員（authenticated）だけが、自分のチームの行を読み書きできる。
-- 未ログイン（anon）には何も許さない。
-- ---------------------------------------------------------------------------

alter table public.teams            enable row level security;
alter table public.team_members     enable row level security;
alter table public.players          enable row level security;
alter table public.opponents        enable row level security;
alter table public.opponent_players enable row level security;
alter table public.matches          enable row level security;
alter table public.sets             enable row level security;
alter table public.serves           enable row level security;
alter table public.receptions       enable row level security;
alter table public.attacks          enable row level security;
alter table public.points           enable row level security;
alter table public.ai_reports       enable row level security;

-- チーム：読むのは部員、変えるのは管理者。作るのは create_team() だけ
create policy teams_select on public.teams for select to authenticated
  using (private.is_member(id));
create policy teams_update on public.teams for update to authenticated
  using (private.is_admin(id)) with check (private.is_admin(id));
create policy teams_delete on public.teams for delete to authenticated
  using (private.is_admin(id));

-- 部員の一覧：読むのは部員、追加・変更・削除は管理者。参加は招待コード（F-02）で別に作る
create policy team_members_select on public.team_members for select to authenticated
  using (private.is_member(team_id));
create policy team_members_insert on public.team_members for insert to authenticated
  with check (private.is_admin(team_id));
create policy team_members_update on public.team_members for update to authenticated
  using (private.is_admin(team_id)) with check (private.is_admin(team_id));
create policy team_members_delete on public.team_members for delete to authenticated
  using (private.is_admin(team_id) or user_id = (select auth.uid()));

-- チームに直接ぶら下がる表：部員なら読み書きできる
create policy players_all on public.players for all to authenticated
  using (private.is_member(team_id)) with check (private.is_member(team_id));
create policy opponents_all on public.opponents for all to authenticated
  using (private.is_member(team_id)) with check (private.is_member(team_id));
create policy matches_all on public.matches for all to authenticated
  using (private.is_member(team_id))
  with check (
    private.is_member(team_id)
    and (opponent_id is null or private.team_of_opponent(opponent_id) = team_id)
  );
create policy ai_reports_select on public.ai_reports for select to authenticated
  using (private.is_member(team_id));
-- ai_reports の書き込みは Edge Function（service_role）だけが行う

create policy opponent_players_all on public.opponent_players for all to authenticated
  using (private.is_member(private.team_of_opponent(opponent_id)))
  with check (private.is_member(private.team_of_opponent(opponent_id)));

create policy sets_all on public.sets for all to authenticated
  using (private.is_member(private.team_of_match(match_id)))
  with check (private.is_member(private.team_of_match(match_id)));

-- 1本ごとの記録：セットが自分のチームのもので、選手も同じチームのものであること
create policy serves_all on public.serves for all to authenticated
  using (private.is_member(private.team_of_set(set_id)))
  with check (
    private.is_member(private.team_of_set(set_id))
    and private.team_of_player(server_id) = private.team_of_set(set_id)
    and (receiver_id is null or private.team_of_opponent_player(receiver_id) = private.team_of_set(set_id))
  );

create policy receptions_all on public.receptions for all to authenticated
  using (private.is_member(private.team_of_set(set_id)))
  with check (
    private.is_member(private.team_of_set(set_id))
    and (receiver_id is null or private.team_of_player(receiver_id) = private.team_of_set(set_id))
    and (opp_server_id is null or private.team_of_opponent_player(opp_server_id) = private.team_of_set(set_id))
  );

create policy attacks_all on public.attacks for all to authenticated
  using (private.is_member(private.team_of_set(set_id)))
  with check (
    private.is_member(private.team_of_set(set_id))
    and private.team_of_player(attacker_id) = private.team_of_set(set_id)
  );

create policy points_all on public.points for all to authenticated
  using (private.is_member(private.team_of_set(set_id)))
  with check (private.is_member(private.team_of_set(set_id)));

-- ---------------------------------------------------------------------------
-- チームを作る：作った人を管理者にする
-- ---------------------------------------------------------------------------

create function public.create_team(team_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'ログインが必要です';
  end if;
  insert into public.teams (name) values (team_name) returning id into new_id;
  insert into public.team_members (team_id, user_id, role) values (new_id, (select auth.uid()), 'admin');
  return new_id;
end;
$$;

revoke all on function public.create_team(text) from public, anon;
grant execute on function public.create_team(text) to authenticated;
