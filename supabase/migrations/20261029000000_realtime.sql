-- T-25 同時記録の基礎（F-14）：ほかの端末の記録を Realtime で受け取る。
-- 記録の4つの表と、セット（ほかの端末で次のセットを作ったとき）の変更を知らせる。
-- 受け取れるのは、RLS で読める行（自分のチームの行）だけ。

alter publication supabase_realtime
  add table public.serves, public.receptions, public.attacks, public.points, public.sets;
