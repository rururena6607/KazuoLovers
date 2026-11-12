# Supabase

テーブルと RLS は `migrations/` の SQL で作る。所有者はひろし（実装計画書 3 節）。

## 本番のプロジェクトに流す

Supabase CLI を入れていなくても、ダッシュボードの SQL Editor でできる。

1. Supabase のダッシュボードで「SQL Editor」を開く
2. `migrations/` の SQL を、ファイル名の順に1つずつ貼って「Run」を押す
3. `tests/rls_check.sql` を貼って「Run」を押し、`RLS OK` と出ることを確かめる（最後に rollback するので、テスト用のデータは残らない）

流した SQL は、もう一度流さない（同じテーブルを作ろうとしてエラーになる）。テーブルを変えるときは、新しいファイルを `migrations/` に足す。

## 相手のスパイク・速さ・矢印・列の境目・紅白戦（T-48）

`migrations/20261105000000_opp_attacks_speed_scrimmage.sql` で、次を足す。**すでに流した SQL には手を入れず、このファイルだけを1回流す。**

- `opp_attacks` 表（相手のスパイク）。RLS と Realtime つき
- `serves.speed`、`attacks.from_x`・`from_y`・`speed`、`sets.col_split_1`・`col_split_2`、`opponent_players.player_id`
- `matches.kind` に `scrimmage`、`points.cause` に `opp_kill`・`opp_attack_error`

この SQL は全体が 1 つのトランザクション（`begin;` 〜 `commit;`）なので、途中で失敗したら何も変わらない（もう一度流して「すでにある」とエラーになっても、半端な状態は残らない）。

**アプリを配る（main をマージする）前に、先にこの SQL を流す。** 流す前にアプリを配ると、アプリが `speed` などの列を読もうとして、記録の保存・読み込みがすべて失敗する。

流したあと、`tests/rls_check.sql`（`RLS OK`）と `tests/rls_check_opp_attacks.sql`（`T-48 OK`）を貼って「Run」を押して確かめる。どちらも最後に rollback するので、データは残らない。

- 列の境目は、両方空なら既定（3 等分）。設定するときは両方そろえ、0 ≤ 左 < 右 ≤ 1（`check` 制約）
- 紅白戦の B チームは、相手チーム（`opponents`）として持つ。B チームの選手（`opponent_players`）の `player_id` に自チームの選手を入れると、その部員個人の成績に入れられる。同じ部員は B チームに 1 回だけ

## 招待コードでの参加（T-43）

`migrations/20261112000000_invite_code.sql` を1回流す。**アプリを配る（main をマージする）前に流す。** 流す前に配ると、管理画面の招待コードと参加が「見つからない関数」のエラーになる（ほかの画面は動く）。

- 管理者が管理画面で招待コード（8文字）を発行・再発行する。再発行すると前のコードは使えなくなる。コードは管理者だけが見られる（`teams.invite_code` の列は部員から読めなくした。読み書きは `invite_info()`・`regenerate_invite_code()` だけ）
- 部員はコードで参加する（`preview_join()` で確かめてから `join_team()`）。役割は部員（member）
- 1人1チーム：参加すると前のチームから抜ける。前のチームの管理者が自分だけなら、そのチームは消える（選手・試合・記録も消え、残った部員もチームを失う）。画面で2回確かめ、`allow_delete` が true のときだけ消す

流したあと、`tests/rls_check_invite.sql` を貼って「Run」を押し、`T-43 OK` と出ることを確かめる（最後に rollback する）。

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

## LINE の返信（T-33、line-webhook）

部の LINE グループで「結果」「7番」「ヘルプ」と送ると、Bot が返信する Edge Function。コードは `functions/line-webhook/`（`index.ts` と `logic.ts`）。返信（Reply）なので、月 200 通の無料枠を使わない。

- 署名（`x-line-signature`）を確かめ、LINE からのリクエストだけを受け付ける
- Bot をグループに招待すると、そのグループを `LINE_TEAM_ID` のチームにつなぐ（`teams.line_group_id`）。**つなげるのは最初の1グループだけ**で、ほかのグループに招待されてもチームのデータは返さない。つなぎ直すときは Table Editor で `teams.line_group_id` を空にしてから招待し直す
- 「結果」：最新の試合（練習は除く）のセットごとの得点と、保存済みの AI コメント（`match:<試合の id>`）。Gemini は待たない
- 「7番」「#7」：その選手の最新の試合の本数。指標は T-34 で足す

### 1. LINE のチャネルを作る

1. **学校のアドレスで** https://developers.line.biz/console/ に入り、プロバイダーを作る
2. 「Messaging API」のチャネルを作る（LINE 公式アカウントもできる）
3. 「チャネル基本設定」の **チャネルシークレット**と、「Messaging API設定」で発行した **チャネルアクセストークン（長期）** を控える。どちらもどこにも貼らない
4. LINE Official Account Manager の「応答設定」で、**応答メッセージをオフ、Webhook をオン**にする。「アカウント設定」で **グループ・複数人トークへの参加を許可する** をオンにする

### 2. シークレットを入れる

「Edge Functions → Secrets」で、次を足す。

| 名前 | 値 |
| --- | --- |
| `LINE_CHANNEL_SECRET` | チャネルシークレット |
| `LINE_CHANNEL_ACCESS_TOKEN` | チャネルアクセストークン（長期） |
| `LINE_TEAM_ID` | つなぐチームの id（Table Editor の `teams` の `id`） |

### 3. 配る

LINE は Supabase のログインを持たないので、**JWT の確かめをオフにして**配る（代わりに署名で確かめる）。

```
npx supabase functions deploy line-webhook --project-ref （プロジェクトの ID） --use-api --no-verify-jwt
```

### 4. LINE に Webhook の URL を入れる

1. 「Messaging API設定」の **Webhook URL** に `https://（プロジェクトの ID）.supabase.co/functions/v1/line-webhook` を入れる
2. 「検証」を押して「成功」と出ることを確かめ、**Webhook の利用**をオンにする
3. 部のテスト用のグループに Bot を招待する →「このグループをチームにつなぎました」と返ってくる
4. 「結果」と送る → 最新の試合の得点が返ってくる（完了条件）。返ってこなければ「Edge Functions → line-webhook → Logs」を見る

## 公式戦後の自動投稿（T-35、line-push）

公式戦が終わったら、結果を部の LINE グループに送る（Push）Edge Function。記録画面で試合を終えたときに `linePush.pushMatchResult(matchId)`（`src/lib/data/linePush.ts`）で呼ぶ。コードは `functions/line-push/`（`line-webhook/logic.ts` も使う）。

- **公式戦**は、大会名のある試合とする。練習試合は大会名を空にして作る
- 同じ試合は1回しか送らない（`matches.line_pushed_at`。`migrations/20261029010000_line_pushed_at.sql` を流しておく）
- Push は「送った回数 × グループの人数」で数える。送る前に今月の上限・使った通数・グループの人数を LINE に聞き、**足りなければ送らない**（画面に理由を出す。部員はグループで「結果」と送れば見られる）
- AI のコメントが保存済みなら、それも送る（吹き出しの数は通数に関係しない）

シークレットは line-webhook と同じ（`LINE_CHANNEL_ACCESS_TOKEN`・`LINE_TEAM_ID`）。ログインした部員だけが呼べるよう、JWT の確かめは**オンのまま**配る。

```
npx supabase functions deploy line-push --project-ref （プロジェクトの ID） --use-api
```

テストで1回送ったら、LINE Official Account Manager の「利用状況」で、何通と数えられたかを確かめる（要件定義書 11 章の確認事項）。

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
