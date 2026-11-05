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

Supabase の標準のメール送信では、テンプレートを編集できない（コードが入らず、リンクだけのメールになる）。送れる相手も組織（Organization）のメンバーだけで、部員には届かない。そのため、先に SMTP を設定する。

### 1. メールを送るサービスを用意する

まず学校の Gmail を試し、使えなければ Brevo にする。どちらも**学校のアドレスで**用意する（実装計画書 10.1）。

**A. 学校の Gmail**（Google から送るので迷惑メールに入りにくい）

1. 学校の Gmail で https://myaccount.google.com/security を開き、「2段階認証プロセス」をオンにする
2. https://myaccount.google.com/apppasswords で、名前を「Supabase」にして**アプリ パスワード**（16文字）を作る。このページが使えない場合は学校が止めているので、B にする

**B. Brevo**（無料で1日300通まで）

1. https://www.brevo.com で、学校のアドレスでアカウントを作る
2. 「Senders, Domains & Dedicated IPs → Senders」で学校のアドレスを送信元に追加し、届いたメールで確かめる
3. 「SMTP & API → SMTP」で SMTP キーを作る。画面の「Login」（`〜@smtp-brevo.com`）も控える

アプリ パスワードと SMTP キーは秘密情報なので、コード・コミット・チャットに書かない。Supabase の画面にだけ入れる。

### 2. Supabase に SMTP を設定する

「Authentication → Emails → SMTP Settings」で **Enable custom SMTP** をオンにして、次を入れて保存する。

| 項目 | A. 学校の Gmail | B. Brevo |
| --- | --- | --- |
| Sender email | 学校のアドレス | 学校のアドレス（B-2 で確かめたもの） |
| Sender name | サーブレシーブ記録 | サーブレシーブ記録 |
| Host | `smtp.gmail.com` | `smtp-relay.brevo.com` |
| Port | `587` | `587` |
| Username | 学校のアドレス | Brevo の Login（`〜@smtp-brevo.com`） |
| Password | アプリ パスワード（空白なしの16文字） | SMTP キー |

### 3. テンプレートにコードを入れる

SMTP を保存すると、「Authentication → Emails → Templates」の件名と本文を編集できるようになる。**Confirm sign up** と **Magic Link** の2つを、次のように直して「Save changes」を押す。初めてログインする人には Confirm sign up が、2回目からは Magic Link が届く。

- Subject：`サーブレシーブ記録のログインコード`
- Body：右上を「Source」に切り替え、中身を全部次に替える

  ```html
  <h2>サーブレシーブ記録のログイン</h2>
  <p>アプリに次のコードを入れてください（1時間有効）。</p>
  <p style="font-size:24px;font-weight:bold">{{ .Token }}</p>
  ```

### 4. そのほかの設定

- 「Authentication → Providers → Email」で、**Email OTP Length** が 6 になっていることを確かめる
- 「Authentication → URL Configuration」の **Site URL** に Vercel の本番の URL を入れる（メールの中のリンクの戻り先。コードでログインするので Redirect URLs は要らない）

### 届かないとき

- 迷惑メールのフォルダを見る
- 「Authentication → Logs」で、SMTP のエラー（パスワードの間違いなど）が出ていないか見る
- 「メールを送りすぎました」と出たら、「Authentication → Rate Limits」の1時間あたりのメールの上限を確かめる。部員が一度にログインする日は、上限を上げておく

## AI コメント（T-30、gemini-report）

分析画面から集計（背番号と数値だけ）を受け取り、Gemini のコメントを返して `ai_reports` に残す Edge Function。コードは `functions/gemini-report/`（`index.ts` と `logic.ts` の2つ）。

- ログインした部員だけが、自分のチームについて呼べる
- 同じ範囲（scope）で同じ集計なら、保存済みのコメントを返す（Gemini を呼ばない）
- 集計に選手の名前や `name` などのキーが入っていたら、Gemini に送らずに断る
- 1チームが1日に作れるのは 20 回まで（保存済みを返すときは数えない）

### 1. Gemini の API キーを作る

1. **学校のアドレスで** https://aistudio.google.com を開く
2. 「Get API key」→「Create API key」でキーを作る。キーはどこにも貼らない（コード・コミット・チャット）

### 2. シークレットを入れる

Supabase の「Edge Functions → Secrets」で、次を足す。

| 名前 | 値 |
| --- | --- |
| `GEMINI_API_KEY` | 1 で作ったキー |
| `GEMINI_MODEL`（任意） | 使うモデル。入れなければ `gemini-2.5-flash`。AI Studio で無料枠の Flash 系の名前を確かめ、変わっていたら入れる |
| `AI_DAILY_LIMIT`（任意） | 1日の回数の上限。入れなければ 20 |

`SUPABASE_URL`・`SUPABASE_ANON_KEY`・`SUPABASE_SERVICE_ROLE_KEY` は Supabase が自動で入れるので、足さない。

### 3. 配る（デプロイ）

Supabase CLI を入れなくても、`npx` で配れる（Docker は要らない）。

```
npx supabase login
npx supabase functions deploy gemini-report --project-ref （プロジェクトの ID） --use-api
```

プロジェクトの ID は、Project URL の `https://（ここ）.supabase.co` の部分。配ったら「Edge Functions → gemini-report」の **Verify JWT** がオンになっていることを確かめる（ログインしていない人は呼べない）。

### 4. 確かめる

ログインしたアプリで、分析画面の「AI に分析してもらう」を押す（T-32）。それまでは、ブラウザの開発者ツールのコンソールで次を実行して確かめる。

```js
const { aiReports } = await import('/src/lib/data/aiReport.ts')
await aiReports.request({ teamId: '（チームの id）', scope: 'test', summary: { minSample: 10, serve: { total: { attempts: 12, efficiency: 10.0, reference: false } } } })
```

2回目は `cached: true` になる。エラーは「Edge Functions → gemini-report → Logs」で見る。

## キーの置き場所

| キー | 置く場所 |
| --- | --- |
| Project URL、anon キー | `.env.local`（手元）と Vercel の環境変数。ブラウザに出てもよい |
| service_role キー | どこにも置かない。Edge Functions では自動で使える |
| Gemini・LINE のキー | Edge Functions のシークレット（Gemini は T-30、LINE は T-33） |
| SMTP のパスワード（Gmail のアプリ パスワード、Brevo の SMTP キー） | Supabase の SMTP Settings にだけ入れる（T-03） |
