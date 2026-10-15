# Supabase

テーブルと RLS は `migrations/` の SQL で作る。所有者はひろし（実装計画書 3 節）。

## 本番のプロジェクトに流す

Supabase CLI を入れていなくても、ダッシュボードの SQL Editor でできる。

1. Supabase のダッシュボードで「SQL Editor」を開く
2. `migrations/` の SQL を、ファイル名の順に1つずつ貼って「Run」を押す
3. `tests/rls_check.sql` を貼って「Run」を押し、`RLS OK` と出ることを確かめる（最後に rollback するので、テスト用のデータは残らない）

流した SQL は、もう一度流さない（同じテーブルを作ろうとしてエラーになる）。テーブルを変えるときは、新しいファイルを `migrations/` に足す。

## 認証の設定（T-03 の前に）

「Authentication → URL Configuration」で次を設定する。

- **Site URL**：Vercel の本番の URL
- **Redirect URLs**：Vercel の本番の URL、`http://localhost:5173`

設定しないと、メールのログインリンクからアプリに戻れない。

## キーの置き場所

| キー | 置く場所 |
| --- | --- |
| Project URL、anon キー | `.env.local`（手元）と Vercel の環境変数。ブラウザに出てもよい |
| service_role キー | どこにも置かない。Edge Functions では自動で使える |
| Gemini・LINE のキー | Edge Functions のシークレット（第3回、T-30・T-33） |
