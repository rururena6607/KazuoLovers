# サーブ・レシーブ・アタック分析アプリ

バレー部の試合中に、スマホでサーブ・サーブレシーブ・アタックを1本ずつ記録し、集計と AI で振り返る Web アプリ。授業「API を用いた自由課題」の制作物。

- [要件定義書](docs/requirements.md)
- [実装計画書](docs/implementation-plan.md)
- [回ごとの担当表](docs/weekly-assignments.md)

## はじめかた

Node.js 22 以上を入れてから、次を実行する。

```
npm install
npm run dev
```

表示された URL（`http://localhost:5173`）をブラウザで開く。同じ Wi-Fi のスマホから試すときは `npm run dev -- --host` を使う。

## チェック

PR を出す前に、CI と同じチェックを手元で通す。

```
npm run typecheck && npm run lint && npm test && npm run build
```

## 公開

`main` に入ると Vercel が自動で公開する（Vercel と GitHub の連携は、リポジトリの管理者が Vercel の画面で行う）。
