# Supabase

テーブルと RLS は `migrations/` の SQL で作る。所有者はひろし（実装計画書 3 節）。

## 本番のプロジェクトに流す

Supabase CLI を入れていなくても、ダッシュボードの SQL Editor でできる。

1. Supabase のダッシュボードで「SQL Editor」を開く
2. `migrations/` の SQL を、ファイル名の順に1つずつ貼って「Run」を押す
3. `tests/rls_check.sql` を貼って「Run」を押し、`RLS OK` と出ることを確かめる（最後に rollback するので、テスト用のデータは残らない）

流した SQL は、もう一度流さない（同じテーブルを作ろうとしてエラーになる）。テーブルを変えるときは、新しいファイルを `migrations/` に足す。

## 認証の設定（T-03）

ログインは、メールに届く6桁のコードを入れる方式にする（ログインリンクは、iPhone ではホーム画面のアプリではなく Safari で開くので使わない）。

1. 「Authentication → Emails → Templates」で、**Confirm signup** と **Magic Link** の2つの本文に `{{ .Token }}` を入れる。初めてログインする人には Confirm signup が、2回目からは Magic Link が届く。例：

   ```html
   <h2>サーブレシーブ記録のログイン</h2>
   <p>アプリに次のコードを入れてください（1時間有効）。</p>
   <p style="font-size:24px;font-weight:bold">{{ .Token }}</p>
   ```

2. 「Authentication → Providers → Email」で、**Email OTP Length** が 6 になっていることを確かめる
3. 「Authentication → URL Configuration」の **Site URL** に Vercel の本番の URL を入れる（メールの中のリンクの戻り先。コードでログインするので Redirect URLs は要らない）

Supabase の標準のメール送信は1時間に数通までしか送れない。部員が一度にログインして「メールを送りすぎました」と出たら、しばらく待つか、SMTP を設定する。

## キーの置き場所

| キー | 置く場所 |
| --- | --- |
| Project URL、anon キー | `.env.local`（手元）と Vercel の環境変数。ブラウザに出てもよい |
| service_role キー | どこにも置かない。Edge Functions では自動で使える |
| Gemini・LINE のキー | Edge Functions のシークレット（第3回、T-30・T-33） |
