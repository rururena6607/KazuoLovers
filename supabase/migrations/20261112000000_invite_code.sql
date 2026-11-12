-- T-43 招待コードでの部員の参加（F-02。要件定義書 5 章、6 章「管理」、7 章 teams.invite_code）
-- 管理者が招待コードを発行・再発行し、部員はそのコードでチームに参加する。
-- 参加すると、それまでのチームからは抜ける（1人1チーム）。抜けるチームの管理者が自分だけなら、そのチームを消す
-- （選手・試合・記録もいっしょに消える。画面で2回確かめてから allow_delete を true にして呼ぶ）。
-- 流すのは1回だけ（README）。全体を1つのトランザクションにする。

begin;

-- ---------------------------------------------------------------------------
-- 招待コードは管理者だけが見る・変える
-- teams の RLS（部員なら読める）はそのままにして、invite_code の列だけを読めなくする。
-- コードは invite_info()・regenerate_invite_code() からだけ読み書きする
-- ---------------------------------------------------------------------------

revoke select, update on public.teams from anon, authenticated;
grant select (id, name, line_group_id, created_at) on public.teams to authenticated;
grant update (name, line_group_id) on public.teams to authenticated;

-- ---------------------------------------------------------------------------
-- 招待コードを1つ作る：8文字。見間違えやすい 0・O・1・I を除いた 32 文字から選ぶ
-- （src/lib/data/invite.ts の INVITE_CODE_ALPHABET・INVITE_CODE_LENGTH と同じにする）
-- 乱数は gen_random_uuid() の先頭のバイト（v4 の UUID で、先頭のバイトはすべて乱数）
-- ---------------------------------------------------------------------------

create function private.new_invite_code()
returns text
language plpgsql volatile set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  code_length constant int := 8;
  code text := '';
begin
  for i in 1 .. code_length loop
    code := code || substr(alphabet, get_byte(uuid_send(gen_random_uuid()), 0) % length(alphabet) + 1, 1);
  end loop;
  return code;
end;
$$;

-- 入れたコードの空白とハイフンを取り、大文字にする（画面でも同じことをする）
create function private.normalize_invite_code(c text)
returns text
language sql immutable set search_path = ''
as $$
  select upper(regexp_replace(coalesce(c, ''), '[[:space:]-]', '', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- 管理者向け：招待コードを見る・発行する
-- ---------------------------------------------------------------------------

-- 自分がこのチームの管理者か、と今の招待コード（管理者でなければ、コードは null）
create function public.invite_info(t uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'is_admin', private.is_admin(t),
    'code', (select x.invite_code from public.teams x where x.id = t and private.is_admin(t))
  );
$$;

-- 新しい招待コードを作って置き換える。前のコードは使えなくなる
create function public.regenerate_invite_code(t uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  code text;
begin
  if not private.is_admin(t) then
    raise exception '招待コードを発行できるのは、このチームの管理者だけです' using errcode = '42501';
  end if;
  loop
    code := private.new_invite_code();
    begin
      update public.teams set invite_code = code where id = t;
      return code;
    exception when unique_violation then
      -- ほかのチームのコードと重なったら、作り直す
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 部員向け：コードで参加する
-- ---------------------------------------------------------------------------

-- 参加すると抜けるチーム（leave）と、そのうち消えるチーム（delete：自分のほかに管理者がいない）
create function private.join_effects(target uuid)
returns table (team_id uuid, team_name text, deletes boolean)
language sql stable security definer set search_path = ''
as $$
  select m.team_id, x.name,
         m.role = 'admin' and not exists (
           select 1 from public.team_members o
           where o.team_id = m.team_id and o.role = 'admin' and o.user_id <> m.user_id
         )
  from public.team_members m
  join public.teams x on x.id = m.team_id
  where m.user_id = (select auth.uid()) and m.team_id <> target
  order by x.created_at;
$$;

-- コードのチームを探す。見つからない・すでに入っているときは、理由をつけて止める
create function private.team_by_invite_code(c text)
returns public.teams
language plpgsql stable security definer set search_path = ''
as $$
declare
  found public.teams;
begin
  if (select auth.uid()) is null then
    raise exception 'ログインが必要です';
  end if;
  select * into found from public.teams where invite_code = private.normalize_invite_code(c);
  if found.id is null then
    raise exception '招待コードが見つかりません。管理者に、いまのコードを確かめてください';
  end if;
  if private.is_member(found.id) then
    raise exception 'すでに「%」に入っています', found.name;
  end if;
  return found;
end;
$$;

-- 参加する前の確認：入るチームの名前と、抜けるチーム・消えるチーム
create function public.preview_join(code text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  target public.teams := private.team_by_invite_code(code);
begin
  return jsonb_build_object(
    'team_name', target.name,
    'leaving', coalesce((select jsonb_agg(e.team_name) from private.join_effects(target.id) e where not e.deletes), '[]'::jsonb),
    'deleting', coalesce((select jsonb_agg(e.team_name) from private.join_effects(target.id) e where e.deletes), '[]'::jsonb)
  );
end;
$$;

-- 参加する。前のチームから抜け、管理者が自分だけのチームは消す（allow_delete が true のときだけ）
create function public.join_team(code text, allow_delete boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  target public.teams := private.team_by_invite_code(code);
  e record;
begin
  -- 同じ人が2つの端末で同時に参加しても、1人1チームを崩さない（あとの方は、先に入ったチームから抜ける）
  perform pg_advisory_xact_lock(hashtext('join_team:' || (select auth.uid())::text));
  -- 抜けるチームの管理者の行をロックする。管理者2人が同時に抜けても、あとの方は「管理者が自分だけ」と判断して消す
  -- （管理者のいないチームを残さない）。ロックの順をそろえて、互いに待ち合わないようにする
  perform 1 from public.team_members o
  where o.role = 'admin'
    and o.team_id in (select m.team_id from public.team_members m where m.user_id = (select auth.uid()) and m.team_id <> target.id)
  order by o.team_id, o.user_id
  for update;

  if not allow_delete and exists (select 1 from private.join_effects(target.id) x where x.deletes) then
    raise exception '参加すると、いまのチームが消えます。確かめてから、もう一度押してください';
  end if;
  for e in select * from private.join_effects(target.id) loop
    if e.deletes then
      delete from public.teams where id = e.team_id;
    else
      delete from public.team_members where team_id = e.team_id and user_id = (select auth.uid());
    end if;
  end loop;
  insert into public.team_members (team_id, user_id, role) values (target.id, (select auth.uid()), 'member');
  return jsonb_build_object('id', target.id, 'name', target.name);
end;
$$;

revoke all on function private.new_invite_code() from public;
revoke all on function private.normalize_invite_code(text) from public;
revoke all on function private.join_effects(uuid) from public;
revoke all on function private.team_by_invite_code(text) from public;
-- private の4つは、下の public の関数（security definer）の中からだけ呼ぶ。部員には直接呼ばせない

revoke all on function public.invite_info(uuid) from public, anon;
revoke all on function public.regenerate_invite_code(uuid) from public, anon;
revoke all on function public.preview_join(text) from public, anon;
revoke all on function public.join_team(text, boolean) from public, anon;
grant execute on function public.invite_info(uuid) to authenticated;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;
grant execute on function public.preview_join(text) to authenticated;
grant execute on function public.join_team(text, boolean) to authenticated;

commit;
