-- T-43 の直し その2（20261112010000_invite_code_fix.sql のあとに1回流す）
-- 自分がただ一人の管理者で、ほかに部員がいるチームからは、移れないようにする（レビュー #81）。
-- そのチームを消すと、ほかの部員も記録もいっしょに失うため。先にほかの人を管理者にしてから移る。
-- ほかに部員のいないチームは、今までどおり確かめてから消して移れる。
-- あわせて、抜けるチームの名前の並びを、join_effects の順（作った順）で必ず保つ（with ordinality）。
-- 全体を1つのトランザクションにする。

begin;

-- 移ると消えるチームのうち、自分のほかに部員がいるもの（移れない）
create function private.join_blocked(target uuid)
returns table (team_id uuid, team_name text, ord bigint)
language sql stable security definer set search_path = ''
as $$
  select e.team_id, e.team_name, e.ord
  from private.join_effects(target) with ordinality as e(team_id, team_name, deletes, ord)
  where e.deletes and exists (
    select 1 from public.team_members o
    where o.team_id = e.team_id and o.user_id <> (select auth.uid())
  );
$$;

revoke all on function private.join_blocked(uuid) from public;

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
      'deleting', coalesce(jsonb_agg(e.team_name order by e.ord) filter (where e.deletes), '[]'::jsonb),
      'blocked', coalesce(
        (select jsonb_agg(b.team_name order by b.ord) from private.join_blocked(target.id) b), '[]'::jsonb)
    )
    from private.join_effects(target.id) with ordinality as e(team_id, team_name, deletes, ord)
  );
end;
$$;

create or replace function public.join_team(code text, allow_delete boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  target public.teams;
  blocked text;
  e record;
begin
  -- 同じ人が2つの端末で同時に参加しても、1人1チームを崩さない（あとの方は、先に入ったチームから抜ける）
  perform pg_advisory_xact_lock(hashtext('join_team:' || (select auth.uid())::text));
  -- ロックを取ってから探す。先の参加が終わっていれば「すでに入っている」で止まる
  target := private.team_by_invite_code(code);
  -- 抜けるチームの管理者の行をロックする。管理者2人が同時に抜けても、あとの方は「管理者が自分だけ」と判断する
  -- （管理者のいないチームを残さない）。ロックの順をそろえて、互いに待ち合わないようにする
  perform 1 from public.team_members o
  where o.role = 'admin'
    and o.team_id in (select m.team_id from public.team_members m where m.user_id = (select auth.uid()) and m.team_id <> target.id)
  order by o.team_id, o.user_id
  for update;

  select string_agg('「' || b.team_name || '」', '・' order by b.ord) into blocked from private.join_blocked(target.id) b;
  if blocked is not null then
    raise exception 'あなたは%のただ一人の管理者で、ほかに部員がいるので移れません。先にほかの人を管理者にしてください', blocked;
  end if;
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

revoke all on function public.preview_join(text) from public, anon;
revoke all on function public.join_team(text, boolean) from public, anon;
grant execute on function public.preview_join(text) to authenticated;
grant execute on function public.join_team(text, boolean) to authenticated;

commit;
