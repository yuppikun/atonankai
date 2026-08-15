# キャッシュ設定バグ修正 完了報告

## 問題

`_headers` の `/assets/*` に対する `Cache-Control: public, max-age=31536000, immutable` により、
ブラウザ・CDNがCSS/JSを最長1年間キャッシュし続け、リリースしたデザイン修正・機能修正が
ユーザーに反映されない状態になっていた。

## 対応内容

### 1. `_headers` の修正

`/assets/*` の一括指定をやめ、種別ごとに分離した。

- `/assets/css/*`、`/assets/js/*` → `Cache-Control: public, max-age=0, must-revalidate`
  （`immutable` を外し、毎回サーバーへ検証リクエストを送らせる）
- `/assets/img/*` → `Cache-Control: public, max-age=31536000, immutable`（従来どおり長期キャッシュ）
- `/*` のセキュリティヘッダー（`X-Content-Type-Options` / `X-Frame-Options` / `Referrer-Policy` /
  `Permissions-Policy`）はそのまま維持。

### 2. 全HTMLのCSS/JS読み込みにバージョンクエリを付与

`index.html` / `about.html` / `privacy.html` / `terms.html` / `disclaimer.html` / `contact.html` の
`<link rel="stylesheet">` と `<script src>` に `?v=20260815b` を付与し、既存にキャッシュされている
古いCSS/JSを確実に無効化した。

これに伴い、ローカルのHTMLをファイルシステムから直接読み込んでテストしていた
`test.js` / `verify_clock.js` / `date_select_test.js` の `script[src]` 解決処理が
クエリ文字列付きのパスをそのまま `fs.readFileSync` に渡してしまい `ENOENT` になっていたため、
`src.replace(/\?.*$/, '')` でクエリを除去してから読み込むよう修正した（`npm test` で全100件が成功することを確認済み）。

### 3. README.md にキャッシュ運用を追記

今後CSS/JSを更新する際は、各HTMLのURLに付与したバージョンクエリ（例: `?v=20260815b`）を
新しい値に変更する運用であることを明記した。

### 4. commit・push

`main` ブランチに commit し、`origin/main` へ push 済み。

### 5. 本番反映確認

デプロイ後にproduction URLへ `curl -sI` を実行し、想定どおりのヘッダーになっていることを確認した。

```
$ curl -sI https://atonankai.pages.dev/assets/css/style.css
cache-control: public, max-age=0, must-revalidate   ← immutable が消えている
```

```
$ curl -sI https://atonankai.pages.dev/assets/js/app.js
cache-control: public, max-age=0, must-revalidate
```

```
$ curl -sI https://atonankai.pages.dev/assets/img/ogp.png
cache-control: public, max-age=31536000, immutable   ← 画像は従来どおり長期キャッシュ
```

デプロイ後のHTMLにも `assets/css/style.css?v=20260815b` のようにバージョンクエリが反映されていることを確認。

### 6. Playwrightによる目視確認

新規プロファイル（キャッシュなし）で本番URL `https://atonankai.pages.dev/` をChromiumで開き、
フルページスクリーンショットを取得して確認した。

- 背景色: `rgb(250, 250, 247)` — 白に近いオフホワイトで、オレンジ等の旧配色は残っていない。
- ボタン（「数えはじめる」）: 背景色は本文と同じオフホワイトに黒枠のスタイルで、オレンジではない。
- タイトル「あと何回。」: 大きな見出しとして単独で表示されており、背景の装飾的な数式（`e^(...)` 等）が
  本文として横並びに埋め込まれるような崩れは見られない。

## 結論

CSS/JSのキャッシュバグは解消され、今後のデプロイでは `max-age=0, must-revalidate` によって
ブラウザ・CDNが毎回検証リクエストを行うため、修正が即座に反映される。加えてバージョンクエリの
運用により、既存キャッシュも確実に無効化できる状態になった。
