# CLAUDE.md

**ドキュメント運用ルール(2026-09-18決定)**: 何か大きめの機能を実装・トラブルシュートした際、詳細な経緯(調査過程・原因・試行錯誤・教訓)は都度[CHANGELOG.md](./CHANGELOG.md)に追記し、このCLAUDE.mdには「今どうなっているか」を1〜2行だけ反映する。CLAUDE.mdは**毎回のセッション開始時に自動で読み込まれる**ため肥大化するとトークンを消費し続ける。CHANGELOG.mdは自動では読み込まれず、必要な時にだけ検索・参照する。判断に迷ったら「これは1年後の自分が今の状態を知るために必要か(→CLAUDE.md)、それとも当時の経緯を知りたい時だけ必要か(→CHANGELOG.md)」で振り分けること。

## プロジェクト概要

| 項目 | 内容 |
|------|------|
| プロジェクト名 | City Dogs(LP + 予約管理システム) |
| 対象店舗 | BARBER City Dogs(沖縄県浦添市仲間、フェード専門バーバー) |
| 構成 | LP(静的サイト)と予約管理システム(DB/バックエンド+予約管理画面)を1プロジェクトとして管理。デプロイ先は別々。**「予約管理画面」(`booking/admin/`)と「LPコンテンツ管理画面」は別物ではなく、前者に後者が「LPコンテンツ」タブとして統合されている** |
| 対象ユーザー | 固定客 約500人、店舗スタッフ2〜3名(スタイリスト2名+アシスタント1名程度が上限の見込み)。同時アクセスは僅少 |
| 背景 | HotPepper Beauty掲載料の負担が大きく、自社システムへの移行を検討中。移行期はHotPepperと並行運用する前提 |
| リポジトリ | `https://github.com/khsw098style/city-dogs.git`(private) |
| 本番URL | LP: `https://city-dogs.khs-w098style.workers.dev` / 管理画面: `https://city-dogs-admin-deploy.khs-w098style.workers.dev`(いずれもCloudflare Workers、独自ドメイン未確定の暫定URL) |
| Supabase | Organization: `khsw098style's Org`(Free) / Project: `city-dog-booking`(ref: `cwojmmrnhvemupxubtus`) / Region: Tokyo (ap-northeast-1)。このOrganizationは他案件とも共用する前提 |

## 役割
あなたは10年以上の経験を持つベテランソフトウェアエンジニアです。 Python、JavaScript、Go、Rust、SQLに精通しており、モダンな設計パターン（クリーンアーキテクチャ、DDDなど）やベストプラクティス（テスト、パフォーマンス、セキュリティ）を考慮して回答してください。
基本方針:
コードは堅牢、読みやすく、効率的に書く。
エラーハンドリングと境界値テストを必ず考慮し、横展開反映まで実施する。
冗長なコードを避け、DRY原則を守る。
必要に応じてドキュメントとコメント（docstringなど）を含める。

## 技術スタック

### LP(`lp/`)

| レイヤー | 技術 | 備考 |
|----------|------|------|
| フロントエンド | HTML / CSS / Vanilla JS | フレームワーク不使用 |
| デザイン | White × Green(実店舗の緑の壁・白基調・黒什器 + Instagram @citydogs928 の雰囲気に合わせる) | トークン変数名(`--cream`, `--gold`等)は歴史的経緯で残っているが値は緑基調 |
| SNS導線 | ヘッダー・フッターにInstagram(実リンク)・LINE(仮リンク`href="#"`) | LINEは公式アカウント開設後に実URLへ差し替え(index.html内にTODOコメントあり) |
| ロゴ/favicon | `images/logo-mark.png`(ヘッダー・フッター用)、`favicon-32.png`/`favicon-16.png`/`apple-touch-icon.png`(いずれも`lp/`直下)。同じアセットを`booking/admin/`にもコピー済み |
| WEB予約(`reserve.html`) | Supabase公開APIへ直接fetch(publishable keyをクライアントに埋め込み)。メールアドレスが予約時必須項目。**現在LPからの導線は意図的に一時クローズ中**(下記「現在地・未決事項」参照) |
| 予約管理リンク(`manage.html`) | ログイン不要。`manage_token`をURLクエリで受け取り、予約1件の照会・キャンセルを行う。詳細は[booking/design/data-model.md](./booking/design/data-model.md)の「6.」 |
| ホスティング | Cloudflare Workers(静的アセット配信)。`lp/wrangler.jsonc`・`lp/.assetsignore`必須 |
| ローカル開発サーバー | `npm run serve`(ポート5500固定、`serve.json`で`cleanUrls:false`。理由: クエリ文字列付きURL(`manage.html?token=...`)の欠落防止。`npx serve`だとCORSで弾かれるので必ず`npm run serve`を使うこと) |
| 画像 | Supabase Storage(公開バケット`site-images`)経由でアップロード可能(管理画面から)。既存の`lp/images/`配下への相対パス指定も後方互換で動作 |
| LPコンテンツ管理画面 | 別アプリではなく`booking/admin/`の「LPコンテンツ」タブとして実装。CONCEPT・SHOP & STYLE・MENU & PRICE・STAFF・評価バッジをコード修正なしに更新できる |

### 予約管理システム(`booking/`)

| レイヤー | 技術 | 備考 |
|----------|------|------|
| データベース | PostgreSQL(Supabase) | スキーマは [booking/supabase/migrations/](./booking/supabase/migrations/)(0001〜0012) |
| API | Supabase Edge Functions(Deno/TypeScript) | テーブルへの直接アクセス(PostgREST自動API)は使わず必ずこの層を経由。設計は [booking/design/api-design.md](./booking/design/api-design.md)。全テーブルRLS有効化済み(ポリシーなし、service_roleのみアクセス可) |
| 認証(予約管理画面) | Supabase Auth(email/password)。`staff.auth_user_id`でstaffと紐付け | `_shared/auth.ts`のrequireStaff()で検証。顧客側(公開API)は認証なし |
| 予約管理画面(`booking/admin/`) | HTML / CSS / Vanilla JS + `@supabase/supabase-js`(CDN) | スタッフ・オーナー向け内部ツール。予約管理・LPコンテンツ編集・営業日/シフト設定・顧客管理まですべて実装済み(api-design.md記載の機能はすべて完了) |
| ホスティング | Cloudflare Workers(静的アセット配信) | `booking/admin/wrangler.jsonc`・`.assetsignore`必須 |
| ボット対策 | Cloudflare Turnstile(`POST /reservations`・管理画面ログイン) + レート制限(`_shared/rateLimit.ts`) | 本番用サイトキー・シークレットキー設定済み |
| メール送信 | Resend(https://resend.com、無料枠) | `RESEND_API_KEY`設定済み。`MANAGE_PAGE_BASE_URL`・`RESEND_FROM_ADDRESS`は独自ドメイン未確定のため未設定(下記参照) |
| 通知 | LINE公式アカウント(予約リマインド) | 未連携・未着手 |
| 二重予約防止 | PostgreSQLの `EXCLUDE` 制約(`btree_gist`) | アプリ側チェックに頼らずDBで保証。詳細は [booking/design/data-model.md](./booking/design/data-model.md) |
| 画像アップロード | Supabase Storage公開バケット`site-images`。書き込みは稼働中スタッフ(`staff.is_active`)のみに制限(`0010`/`0011`マイグレーション) | 管理画面からファイル選択→自動アップロード→URLを`image_url`/`avatar_image_url`に反映 |

設計上の背景・判断理由は [booking/design/data-model.md](./booking/design/data-model.md) にまとめてあるので、実装前に必ず参照すること。過去の実装経緯・バグ調査の詳細は[CHANGELOG.md](./CHANGELOG.md)を参照。

## ディレクトリ構成と役割

```
city-dogs/
├── CLAUDE.md                    # プロジェクト概要・役割定義(このファイル)
├── CHANGELOG.md                 # 過去の実装経緯・トラブルシュート記録(自動読み込みされない)
├── TEMPLATE.md                  # 新規店舗展開時のチェックリスト
├── lp/                          # LP(静的サイト・公開中)
│   ├── index.html
│   ├── reserve.html             # WEB予約ウィザード(3ステップ、メールアドレス必須)
│   ├── manage.html              # 予約確認・変更ページ(ログイン不要、manage_tokenで本人確認)
│   ├── favicon-16.png / favicon-32.png / apple-touch-icon.png
│   ├── wrangler.jsonc / .assetsignore  # Cloudflare Workers配信設定
│   ├── css/
│   │   ├── styles.css / reserve.css / manage.css
│   ├── js/
│   │   ├── config.js            # 🏪店舗固有: SUPABASE_URL/ANON_KEY/TURNSTILE_SITE_KEY
│   │   ├── script.js / reserve.js / manage.js
│   │   └── site-content.js      # GET /site-content・GET /menus から動的描画
│   ├── serve.json               # ローカルserve用設定(cleanUrls:false)
│   ├── package.json             # devDependency: playwright, serve, @supabase/supabase-js
│   ├── tests/
│   │   ├── reserve.e2e.mjs      # 予約フロー+manage.htmlのE2Eテスト
│   │   └── site-content.e2e.mjs
│   └── images/                  # 店内・スタイル写真(静的ファイル、Storageアップロードとは別に後方互換で残る)
└── booking/                     # 予約管理システム
    ├── design/
    │   ├── data-model.md / er-diagram.html / api-design.md / api-diagrams.html
    ├── reference/                # HotPepper参考資料(公開リポジトリには含めない、.gitignoreで除外)
    ├── package.json / .gitignore
    ├── admin/                    # 予約管理画面(要ログイン。「LPコンテンツ」タブとしてLP編集機能も統合)
    │   ├── index.html
    │   ├── wrangler.jsonc / .assetsignore
    │   ├── css/admin.css
    │   ├── js/
    │   │   ├── config.js         # 🏪店舗固有
    │   │   └── admin.js
    │   └── tests/admin.e2e.mjs   # 要SUPABASE_SERVICE_ROLE_KEY環境変数
    └── supabase/
        ├── README.md             # セットアップ・デプロイ手順
        ├── seed.sql              # 🏪店舗固有: 動作確認用テストデータ
        ├── migrations/           # 0001〜0012(詳細はCHANGELOG.md、内容はマイグレーションファイル自体を参照)
        └── functions/
            ├── deno.json
            ├── _shared/          # 空き枠計算・認証・range解析・バリデーション・メール送信等。*.test.ts同居
            ├── menus/ staff/ availability/    # 公開API
            ├── reservations/     # POST /reservations, GET /reservations/manage, POST /reservations/manage/cancel
            ├── admin-reservations/ admin-menus/ admin-business-days/ admin-staff-shifts/ admin-customers/  # 要ログイン
            ├── site-content/     # GET /site-content(公開)
            └── admin-site-content/  # 要ログイン、features/gallery/staff/ratingのCRUD
```

## テスト

いずれもサーバー起動〜終了まで1コマンドで完結する。**実際にデプロイ済みの本番相当Supabaseに対してテストデータを作成する**(テスト予約`B0000000xx`がDBに残る。気になれば後でSQL Editorからまとめて削除する)。

- 静的サーバー起動にWindowsで`spawn(shell:true)`を使うと子プロセスが正しく終了しないため、対象ポートを`netstat`で特定してkillする`killByPort()`ヘルパーを両E2Eテストで使っている。新しいテストスクリプトを書く場合もこれを再利用すること
- 実データが絡むテストの後片付けは「初期値に戻す」のであって「決め打ちの値にする」のではない(例: `admin.e2e.mjs`は実行前の`staff.auth_user_id`を読み取って保存し、後片付けではその値に復元する)
- `_shared/`に新しいロジックを追加する際は、I/O(Supabase呼び出し)と純粋ロジックを分離してからテストを書く方針(`generateSlots()`のように)を踏襲すること

### バックエンド単体テスト(Deno、Supabase接続不要)

```bash
cd city-dogs/booking
npm run test
```

`_shared/availability.ts`・`_shared/range.ts`・`_shared/validation.ts`・`_shared/rateLimit.ts`に対する`Deno.test`ベースの単体テスト(65件、オールグリーン)。

### 予約UI(顧客向け)

```bash
cd city-dogs/lp
npm install                      # 初回のみ
npx playwright install chromium  # 初回のみ
npm run test:e2e
```

`SUPABASE_SERVICE_ROLE_KEY=<service_roleキー> npm run test:e2e` とすると、`manage.html`経由の照会・キャンセルまで通しで検証する。

### 予約管理画面(スタッフ向け)

```bash
cd city-dogs/booking/admin
npm install                      # 初回のみ
npx playwright install chromium  # 初回のみ(lpで導入済みなら不要)
SUPABASE_SERVICE_ROLE_KEY=<Project Settings > API のservice_roleキー> npm run test:e2e
```

テスト用のSupabase Authユーザーを一時作成し、既存スタッフに紐付けてログイン確認した後、必ず後片付け(紐付け解除・ユーザー削除)まで行う。service_roleキーはコードにハードコードしないこと(環境変数経由のみ)。

## 現在地・未決事項

- **LP**: WEB予約(`reserve.html`)は実装・デプロイ済みで稼働可能だが、オーナー説明の都合で**導線を意図的に一時クローズ中**(「WEBで予約する」ボタン非表示→「近日公開予定」の案内文に差し替え)。バックエンドは温存しているので、リンクを戻すだけで即座に再公開できる
- **モバイル優先**: LP・予約フロー(`index.html`/`reserve.html`/`manage.html`)はスマホ利用が大多数の想定。変更時は必ずモバイル幅での見た目を優先して確認すること。管理画面(`booking/admin/`)はPC専用でよい(スタッフはPC/タブレットから利用)
- **予約管理リンク(`manage_token`方式)は実装済みだが実運用不可**: `MANAGE_PAGE_BASE_URL`が独自ドメイン未確定のため未設定。設定するまでメール内リンクは`https://your-domain-not-configured.example/manage.html`というプレースホルダーのまま送信される
- **独自ドメイン確定後に必ずやること**: `ALLOWED_ORIGINS`・`MANAGE_PAGE_BASE_URL`・`RESEND_FROM_ADDRESS`のsecretを新ドメインの値に更新(TEMPLATE.md参照)。**ローカルE2Eテスト用のlocalhostオリジン(`http://localhost:5500`/`5501`/`5502`)は`ALLOWED_ORIGINS`に残すこと**(消すと既存のテストスイートが壊れる)
- **メニューは区分(カット/カラー/パーマ/オプション)付きの複数選択制(2026-09-24)**: 予約は`reservation_items`に内訳を持ち、料金・時間は単純合算。所要時間は店舗回答(2026-09-25)反映済み。施術後のインターバルは「不要」と確認済みなので実装しない。パーマ・ツイストは併用可(カット・カラーは各1つまで)。詳細はCHANGELOG.md
- **staff.roleは当面、管理APIの認可には使わない(全スタッフ同権限)と決定済み(2026-09-18)**: スタイリスト2名+アシスタント1名程度の運用規模であれば権限差別化の必要性が薄いため。`staff.role`列自体はLP表示用(紹介文・指名リストの絞り込み)にそのまま使う。将来差別化したくなった場合もスキーマ変更は不要で、`_shared/auth.ts`に`requireOwner()`のような認可ヘルパーを追加するだけで対応できる(ただしオーナーの実ログインが現状スタイリストのstaffレコードに仮で紐付いている状態なので、先にオーナー専用staffレコードを分離する必要がある)
- **Google口コミ連携は規約上の理由で撤回済み**(詳細はCHANGELOG.md)。評価バッジは管理画面「LPコンテンツ」タブから手動更新する方式(`site_rating`テーブル)
- **「指名なし(おまかせ)」は廃止し、担当スタイリストの指名を常に必須にした(2026-09-18)**: LP予約・管理画面の電話予約登録・リスケジュールいずれも`staff_id`必須(`GET /availability`もサーバー側で必須化)。詳細・廃止理由はCHANGELOG.md参照。将来的にメニューごとの担当可能スタッフ制限や、指名なし時の割り当てロジックを検討する余地はあるが未着手
- **未着手**: LINE公式アカウント通知連携、HotPepper併走期間の運用ルール確定
- **既知のテストカバレッジのギャップ**: メール本文・送信自体の自動テストなし(Resend実送信は手動確認のみ)。各Functionのルーティング・リクエスト検証部分(`*/index.ts`)自体は依然E2Eテストのみでカバー
- **Supabase無料枠**: DB 500MB / ファイルストレージ1GB / 月間帯域5GB / Edge Function月50万回呼び出し。現状の利用規模では十分。**⚠️注意**: 無料プロジェクトは1週間アクセスがないと自動的に一時停止(auto-pause)される。「繋がらない」となった場合はまずこれを疑うこと

## 他店舗への展開方針(テンプレートとして複製する場合)

City Dogs向けに作ったこの予約システムを、将来的に別の店舗でも使い回す方針が決まっている(2026-09-16)。**「1つのシステムを複数店舗で共有する本格的なマルチテナントSaaS」ではなく、「店舗ごとにこのリポジトリを複製し、個別にSupabaseプロジェクト・ホスティングを持たせるテンプレート方式(1店舗1リポジトリ)」を採用する**。理由・見送った案は下の「検討したが見送ったもの」の「マルチテナント化」項目を参照。

物理的にフォルダを「店舗固有」「共通」に分割するような重い抽象化はせず、代わりに以下の軽量な対応にとどめている:

- 接続情報(`SUPABASE_URL`/`ANON_KEY`)は`lp/js/config.js`・`booking/admin/js/config.js`の2ファイルに集約
- 店舗固有ファイル(`lp/js/config.js`・`booking/admin/js/config.js`・`booking/supabase/seed.sql`・`lp/index.html`・`lp/reserve.html`・`lp/manage.html`・`booking/admin/index.html`・`booking/supabase/functions/_shared/reservationEmail.ts`)の先頭(またはハードコード箇所の直前)に`🏪 店舗固有`というコメントを付与し、`grep -rn "🏪"`で一覧できるようにした。**店舗固有情報の洗い出しは、フロントエンド(HTML)だけでなくメール本文・件名のようにバックエンドが生成する顧客向け出力も対象に含めること**(`_shared/email.ts`の`DEFAULT_FROM`も店舗名を含まない汎用表示名にしてある)
- `lp/`・`booking/admin/`それぞれ、CSS/JSを`css/`・`js/`サブフォルダに整理済み
- 新しい店舗を作る際の実作業チェックリストを [TEMPLATE.md](./TEMPLATE.md) にまとめてある。**新規店舗を作る際はこのファイルを読むこと**

`booking/reference/`(HotPepper参考資料)はルートの`.gitignore`で除外済みなので、複製時に気にする必要はない。

## 今後の実装予定(バックログ)

(現時点で残っている項目なし。直近の完了分は「現在地・未決事項」の該当エントリを参照)

### 検討したが見送ったもの

- **予約UIの日付選択で休業日を選択不可にする(自前カレンダーグリッド化)**: ネイティブ`<input type="date">`では特定の日だけ選択不可にできないため、実現するには自前カレンダーUI+営業日一覧を返す新規公開APIが必要になる規模の変更。「選んだ後に休業日と表示する」現状のフィードバックで十分と判断し、見送り。再検討する場合はこの制約を踏まえること
- **マルチテナント化(他店舗への横展開)**: 現状のスキーマ・インフラは完全にシングルテナント前提(店舗を区別する`shop_id`等のカラムなし、Supabaseプロジェクトも1店舗1個)。まずCity Dogs(1店舗)の完成度を上げることを優先し、マルチテナント化は着手しない。将来的に本格マルチテナント化を検討する場合の方向性メモ: 共有スキーマ+`tenant_id`+Postgres RLSでのテナント分離、独自ドメインは店舗ごとの実費(有料プランのオプション)にしてサブドメイン/共通ドメイン配下を無料枠の基本形にする、という設計が有力候補
