# サーブ・レシーブ・アタック分析アプリ — AI への指示

このファイルは AI（Claude Code など）が作業のたびに自動で読む。同じ内容を他の AI 向けに `AGENTS.md` に置いている。変えるときは両方を直す。

**従う文書**：[要件定義書](docs/requirements.md)（何を作るか）、[実装計画書](docs/implementation-plan.md)（誰がどのファイルを持つか、どう進めるか）、[回ごとの担当表](docs/weekly-assignments.md)。

## 守ること

- 編集してよいのは、作業している人が**所有する範囲の中だけ**（実装計画書 3 節）。それ以外のファイルは変更せず、変更が必要なら理由と案を示す。
- `src/contracts/` の型やインターフェースを変える必要がある場合は、変更せずに理由と案を示す（`contracts` の変更は専用の PR で3人全員が承認する）。
- 指標の式は要件定義書 5 章（JVA の公式記録票の式）に従い、独自に変えない。
- 参考値の本数などの定数は `src/contracts/config.ts` を使い、数値を直接書かない。
- **TypeScript**（`strict`）で書き、`any` を使わない。
- `src/lib/` の関数には Vitest のテストを書く。指標のテストには JVA の記録票の数字を使う（実装計画書 8 節）。
- API キーをブラウザのコードに書かない。Gemini と LINE は Supabase の Edge Functions からだけ呼ぶ。
- 依存ライブラリの追加・更新、無関係な整形や名前の変更はしない。

## してはいけないこと

- 担当外の範囲、`src/contracts/`、ビルド設定（`package.json`、`vite.config.ts`、`tsconfig*.json`、`eslint.config.js`）、`supabase/migrations/` の書き換え（所有者以外の場合）
- ファイル全体の自動整形、一括リネーム、依存の一括更新
- 指標の式を「わかりやすく」変えること（JVA の式から外れる）
- RLS を外したり緩めたりして、エラーを消すこと
- 選手の名前を Gemini に送ること
- 秘密情報（`.env`、Supabase の service_role キー、Gemini・LINE のキー）をコードやコミットに入れること
- テストを通すために、テストや合格条件を弱めること
- `main` への直接の push

## 範囲と所有者

| 範囲 | 所有者 |
| --- | --- |
| `src/app/`、`src/components/`、`src/features/record/`、`src/features/practice/`、`public/`、ビルド設定、`.github/` | ガブ |
| `src/contracts/` | ひろし（変更は3人全員の承認） |
| `src/lib/data/`、`src/features/auth/`、`src/features/admin/`、`supabase/` | ひろし |
| `src/lib/stats/`、`src/lib/rally/`、`src/lib/court/`、`src/lib/csv/`、`src/features/analysis/` | とりはる |
| `docs/` | 3人全員の承認 |

依存の向き：`features → lib → contracts`。`lib/stats`・`lib/rally`・`lib/court` は React にも Supabase にも依存しない純粋な TypeScript にする。画面は `RecordRepository`（`contracts`）だけを使い、Supabase を直接呼ばない。

## コマンド

```
npm install          # 依存を入れる（最初の1回）
npm run dev          # 開発用サーバ
npm run typecheck    # 型チェック
npm run lint         # Lint
npm test             # テスト（Vitest）
npm run build        # ビルド（CI と同じ）
```

Node.js 22 以上を使う（CI は 24）。

## ブランチと PR

- ブランチ名：`<役割>/<タスクID>-<短い説明>`（例：`ui/T-11-serve-record`、`data/T-15-offline-queue`、`stats/T-06-jva-metrics`）
- 作業前と PR 前に `git pull --rebase origin main`
- PR のタイトルは `[T-xx] 内容`。本文に要件 ID を書き、テンプレートのチェックリストを埋める
- 1タスク＝1PR、300 行程度まで。マージは squash
