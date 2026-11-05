-- T-35 公式戦後の自動投稿（F-15）：同じ試合の結果を LINE に2回送らないよう、送った時刻を残す。
-- 書くのは Edge Function（line-push、service_role）だけ。画面からは使わない。

alter table public.matches add column line_pushed_at timestamptz;
