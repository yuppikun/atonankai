# あと何回。

人生の残り回数を国の統計で数える静的サイト。

## アセットのキャッシュ運用

`_headers` で `/assets/css/*` と `/assets/js/*` は `max-age=0, must-revalidate`（`immutable` は使わない）に設定しています。ブラウザ・CDN が古いCSS/JSを長期間保持しないようにするためです。画像（`/assets/img/*`）は変更頻度が低いため `max-age=31536000, immutable` の長期キャッシュのままにしています。

CSS/JSを更新する際は、`index.html` / `about.html` / `privacy.html` / `terms.html` / `disclaimer.html` / `contact.html` 内の該当ファイル読み込みURLに付与しているクエリ文字列（例: `assets/css/style.css?v=20260815b`）を新しい値に変更してください。これによりキャッシュを確実に無効化できます。バージョン文字列は日付ベース（`YYYYMMDD` + 同日複数回更新時はサフィックス）を推奨します。
