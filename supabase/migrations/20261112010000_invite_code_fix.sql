-- T-43 の直し（20261112000000_invite_code.sql のあとに1回流す）
-- 1. 管理者が自分だけのチームに記録があると、チームを消せなかった。
--    serves.server_id・receptions.receiver_id・attacks.attacker_id は players を「消したら止める」で参照しているので、
--    先に試合を消し（セットと記録が外部キーの連鎖で消える）、それからチームを消す
-- 2. 同じ人が2台で同時に同じチームに参加すると、「すでに入っている」の確かめをすり抜けた。ロックのあとに確かめ直す
-- 3. ハイフンに似た文字（‐ – — − ー －）も取り除く。抜けるチームの名前を、作った順に並べる
-- 全体を1つのトランザクションにする。

begin;

create or replace function private.normalize_invite_code(c text)
returns text
language sql immutable set search_path = ''
as $$
  select upper(regexp_replace(coalesce(c, ''), '[[:space:]‐‑‒–—―−ー－-]', '', 'g'));
$$;

create or replace function public.preview_join(code text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  target public.teams := private.team_by_invite_code(code);
begin
  return (
    select jsonb_build_object(
      'team_name', target.name,
      'leaving', coalesce(jsonb_agg(e.team_name order by e.ord) filter (where not e.deletes), '[]'::jsonb),
      'deleting', coalesce(jsonb_agg(e.team_name order by e.ord) filter (where e.deletes), '[]'::jsonb)
    )
    from (select x.*, row_number() over () as ord from private.join_effects(target.id) x) e
  );
end;
$$;

create or replace function public.join_team(code text, allow_delete boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  target public.teams;
  e record;
begin
  -- 同じ人が2つの端末で同時に参加しても、1人1チームを崩さない（あとの方は、先に入ったチームから抜ける）
  perform pg_advisory_xact_lock(hashtext('join_team:' || (select auth.uid())::text));
  -- ロックを取ってから探す。先の参加が終わっていれば「すでに入っている」で止まる
  target := private.team_by_invite_code(code);
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
      -- 記録が選手を参照しているので、先に試合（セット・記録・得点）を消してから、チームを消す
      delete from public.matches where team_id = e.team_id;
      delete from public.teams where id = e.team_id;
    else
      delete from public.team_members where team_id = e.team_id and user_id = (select auth.uid());
    end if;
  end loop;
  insert into public.team_members (team_id, user_id, role) values (target.id, (select auth.uid()), 'member');
  return jsonb_build_object('id', target.id, 'name', target.name);
end;
$$;

-- create or replace は権限を引き継ぐが、念のためもう一度そろえる
revoke all on function private.normalize_invite_code(text) from public;
revoke all on function public.preview_join(text) from public, anon;
revoke all on function public.join_team(text, boolean) from public, anon;
grant execute on function public.preview_join(text) to authenticated;
grant execute on function public.join_team(text, boolean) to authenticated;

commit;
