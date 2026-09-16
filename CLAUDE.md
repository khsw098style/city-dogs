# CLAUDE.md

## プロジェクト概要

| 項目 | 内容 |
|------|------|
| プロジェクト名 | City Dogs(LP + 予約管理システム) |
| 対象店舗 | BARBER City Dogs(沖縄県浦添市仲間、フェード専門バーバー) |
| 構成 | LP(静的サイト)と予約管理システム(DB/バックエンド+予約管理画面)を1プロジェクトとして管理。デプロイ先は別々になる想定だが、開発・ドキュメントは同一フォルダで進める。**「予約管理画面」(`booking/admin/`、実装済み)と「LPコンテンツ管理画面」(将来構想、未着手)は別物**なので混同しないこと(詳細は下記) |
| 対象ユーザー | 固定客 約500人、店舗スタッフ2〜3名。同時アクセスは僅少 |
| 背景 | HotPepper Beauty掲載料の負担が大きく、自社システムへの移行を検討中。LPは公開可能な状態。予約システムは移行期にHotPepperと並行運用する前提で設計している |
| リポジトリ | 未作成(ローカルのみ、git未初期化) |
| 本番URL | 未定 |
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
| デザイン | White × Green(実店舗の緑の壁・白基調・黒什器 + Instagram @citydogs928 の雰囲気に合わせる) | 2026-09-12に旧「ダーク×ヴィンテージ」から刷新。トークン変数名(--cream, --gold等)は維持し値のみ変更(styles.css参照) |
| SNS導線 | ヘッダー・フッターにInstagram(実リンク)・LINE(仮リンク`href="#"`) | LINEは公式アカウント開設後に実URLへ差し替え(index.html内にTODOコメントあり) |
| ロゴ/favicon | 実際の店舗ロゴ(`shop_logo.png`)から犬マスコット部分を切り出して使用 | `images/logo-mark.png`(ヘッダー・フッター用)、`favicon-32.png`/`favicon-16.png`/`apple-touch-icon.png`(いずれも`lp/`直下)。元画像は`images/shop_logo.png`に保管。同じアセットを`booking/admin/`にもコピー済み |
| WEB予約(`reserve.html`) | 同上。Supabase公開APIへ直接fetch | publishable keyをクライアントに埋め込み(想定通りの使い方)。メールアドレスが予約時必須項目 |
| 予約管理リンク(`manage.html`) | ログイン不要。`manage_token`をURLクエリで受け取り、予約1件の照会・キャンセルを行う | 予約確定メールに記載されるリンク。詳細は[booking/design/data-model.md](./booking/design/data-model.md)の「6. 顧客ログインを作らない予約管理」 |
| ホスティング | 未定(Vercel / Netlify / Cloudflare Pages想定、無料枠) | 独自ドメインのみ有料(年数千円)。**ホスティング先選定時に、クエリ文字列付きURL(`manage.html?token=...`)がリダイレクトで欠落しないか要確認**(ローカルの`serve`パッケージでは「clean URLs」機能がこれを壊す不具合があり実際に踏んだ。`lp/serve.json`で無効化済み) |
| 画像 | `images/`配下にローカル格納 | HotPepper掲載写真を店舗オーナー了承のもと使用。Web公開前に改めて許諾を得ること |
| LPコンテンツ管理画面【実装済み(2026-09-13〜14)】 | 別アプリは新設せず`booking/admin/`に「LPコンテンツ」タブとして統合 | 当初は別アプリ構想だったが、既存の予約管理画面に統合する方針に変更して実装済み。CONCEPT(特徴カード)・SHOP & STYLE(写真)・MENU & PRICE(メニュー・料金)・STAFF(紹介文)をコード修正なしに更新できる。詳細は下の「予約管理画面(`booking/admin/`)」の行を参照 |

### 予約管理システム(`booking/`)

| レイヤー | 技術 | 備考 |
|----------|------|------|
| データベース | PostgreSQL(Supabase) | 無料枠で開始。スキーマは [booking/supabase/migrations/](./booking/supabase/migrations/) |
| API | Supabase Edge Functions(Deno/TypeScript) | テーブルへの直接アクセス(PostgREST自動API)は使わず必ずこの層を経由。設計は [booking/design/api-design.md](./booking/design/api-design.md) |
| 認証(予約管理画面) | Supabase Auth(email/password)。`staff.auth_user_id`でstaffと紐付け | `_shared/auth.ts`のrequireStaff()で検証。顧客側(公開API)は認証なし |
| 予約管理画面(`booking/admin/`)【実装済み】 | HTML / CSS / Vanilla JS + `@supabase/supabase-js`(CDN) | スタッフ・オーナー向け内部ツール。予約の閲覧機能(スケジュール・検索)に加え、「LPコンテンツ」タブとしてCONCEPT/SHOP & STYLE/MENU & PRICE/STAFFの編集機能(上の「LPコンテンツ管理画面」の行を参照)も統合済み。デザインはLPと同じWhite × Greenトークンで統一(admin.css) |
| ホスティング | 未定 | LPと同一ホスティングにまとめるか分けるかは要検討 |
| メール送信 | Resend(https://resend.com、無料枠) | 予約確認・変更・キャンセルリンクの送信用。`RESEND_API_KEY`のsecret設定が必要(未設定時はfail-softでスキップされ予約自体は成立する)。独自ドメイン未検証の間は`onboarding@resend.dev`から送信 |
| 通知 | LINE公式アカウント(予約リマインド) | 月200通まで無料。未連携・今後実装 |
| 二重予約防止 | PostgreSQLの `EXCLUDE` 制約(`btree_gist`) | アプリ側チェックに頼らずDBで保証。詳細は [booking/design/data-model.md](./booking/design/data-model.md) |

設計上の背景・判断理由は [booking/design/data-model.md](./booking/design/data-model.md) にまとめてあるので、実装前に必ず参照すること。

## ディレクトリ構成と役割

```
city-dogs/
├── CLAUDE.md                    # プロジェクト概要・役割定義(このファイル)
├── lp/                          # LP(静的サイト・公開可能な状態)
│   ├── index.html
│   ├── reserve.html             # WEB予約ウィザード(3ステップ、メールアドレス必須)
│   ├── manage.html              # 予約確認・変更ページ(ログイン不要、manage_tokenで本人確認)
│   ├── favicon-16.png / favicon-32.png / apple-touch-icon.png  # faviconはルート直下のまま(慣習に合わせる)
│   ├── css/
│   │   ├── styles.css
│   │   ├── reserve.css
│   │   └── manage.css
│   ├── js/
│   │   ├── config.js            # SUPABASE_URL/ANON_KEYを window.CITY_DOGS_CONFIG として定義。他店舗展開時に書き換えるのはここだけ(下記「他店舗への展開方針」参照)
│   │   ├── script.js
│   │   ├── reserve.js           # Supabase公開APIへ直接fetch。電話番号はハイフン自動整形
│   │   ├── manage.js
│   │   └── site-content.js      # トップページのCONCEPT/SHOP&STYLE/MENU&PRICE/STAFFを GET /site-content・GET /menus から動的描画
│   ├── serve.json               # ローカルserve用設定。cleanUrls:falseでmanage.htmlのクエリ文字列欠落を防ぐ
│   ├── package.json             # devDependency: playwright, serve, @supabase/supabase-js
│   ├── tests/
│   │   ├── reserve.e2e.mjs      # 予約フロー+manage.htmlのE2Eテスト(サーバー起動〜終了まで自己完結)
│   │   └── site-content.e2e.mjs # トップページの動的描画(CONCEPT/SHOP&STYLE/MENU&PRICE/STAFF)のE2Eテスト
│   └── images/                  # 店内・スタイル写真
└── booking/                     # 予約管理システム
    ├── design/
    │   ├── data-model.md        # データモデルの設計ドキュメント(ER図・設計判断・未決事項)
    │   ├── er-diagram.html      # ER図をブラウザ単体表示するビューア(mermaid.js)
    │   ├── api-design.md        # API設計(エンドポイント一覧・状態遷移・エラー仕様)
    │   └── api-diagrams.html    # ステータス状態遷移図・予約作成シーケンス図のビューア(mermaid.js)
    ├── reference/                # 現行HotPepper(SALON BOARD)のスクリーンショット。仕様把握用の参考資料。公開リポジトリには含めない(ルートの.gitignoreでbooking/reference/を除外済み)
    ├── package.json               # Supabase CLIをdevDependencyとして保持(Windowsはグローバルインストール廃止のため)
    ├── .gitignore
    ├── admin/                    # 予約管理画面(スタッフ・オーナー向け、要ログイン。「LPコンテンツ」タブとしてLP編集機能も統合済み)
    │   ├── index.html
    │   ├── favicon-16.png / favicon-32.png / apple-touch-icon.png
    │   ├── css/
    │   │   └── admin.css
    │   ├── js/
    │   │   ├── config.js         # SUPABASE_URL/ANON_KEYを window.CITY_DOGS_CONFIG として定義(lp/js/config.jsと同じ値だが別ホスティングの可能性があるため独立ファイル)
    │   │   └── admin.js          # Supabase Authでログイン→管理APIへfetch。LPコンテンツタブはadmin-site-contentを叩く
    │   ├── package.json         # devDependency: playwright, serve, @supabase/supabase-js
    │   └── tests/
    │       └── admin.e2e.mjs    # 管理画面のE2Eテスト(要SUPABASE_SERVICE_ROLE_KEY環境変数)。api-design.md記載の全機能をカバー済み(2026-09-16時点)
    └── supabase/                 # Supabase CLIが直接読む実装一式
        ├── README.md             # セットアップ・デプロイ手順(現状の進捗込み)
        ├── seed.sql              # 動作確認用テストデータ(メニュー・スタッフ・営業日)
        ├── migrations/
        │   ├── 0001_init.sql    # PostgreSQL DDL(旧 design/schema.sql から移動)
        │   ├── 0002_staff_auth.sql  # staff.auth_user_id 追加(管理画面ログイン用)
        │   ├── 0003_reservation_manage_token.sql  # reservations.manage_token 追加(顧客向け予約管理リンク用)
        │   ├── 0004_site_content.sql  # LPコンテンツ管理用(staffのbio系カラム、site_features、site_gallery_photos)
        │   ├── 0005_google_rating_cache.sql  # Google口コミ連携のキャッシュ用(1行のみ、プレースホルダー実装)
        │   ├── 0006_enable_row_level_security.sql  # 【セキュリティ修正】全テーブルでRLS有効化(ポリシーなし=直接アクセス全遮断)
        │   └── 0007_rate_limiting.sql  # 公開APIのレート制限用(rate_limit_buckets テーブル+ rate_limit_hit() RPC)
        └── functions/
            ├── deno.json         # npm:specifierはインラインのまま(import map未使用、理由はsupabase/README.md参照)
            ├── _shared/          # 複数Functionで共有するロジック(空き枠計算・認証・range解析・バリデーション・メール送信等)。
            │                     # *.test.ts が同居(Deno.test、Supabase未接続で動く単体テスト。下記「テスト」節参照)
            ├── menus/            # GET /menus
            ├── staff/            # GET /staff(指名可能なスタッフ一覧)
            ├── availability/     # GET /availability
            ├── reservations/     # POST /reservations, GET /reservations/lookup, POST /reservations/:reservation_number/cancel,
            │                     # GET /reservations/manage, POST /reservations/manage/cancel
            ├── admin-reservations/  # 【要ログイン】GET/POST /admin-reservations, GET /admin-reservations/schedule, PATCH /admin-reservations/:id
            ├── site-content/     # GET /site-content(LPのCONCEPT/SHOP&STYLE/STAFF紹介文。公開・認証不要)
            ├── admin-site-content/  # 【要ログイン】/admin/site-content/features・/gallery・/staff のCRUD(LPコンテンツ編集用)
            ├── admin-menus/      # 【要ログイン】GET/POST /admin-menus, PATCH /admin-menus/:id(メニュー・料金編集用。削除は不可)
            ├── admin-business-days/  # 【要ログイン】GET/PUT /admin-business-days, POST .../generate-month(月次営業日設定)
            ├── admin-staff-shifts/   # 【要ログイン】GET/PUT /admin-staff-shifts, POST .../generate-month(月次シフト設定)
            ├── admin-customers/      # 【要ログイン】GET /admin-customers(検索), GET/PATCH /admin-customers/:id(お客様管理)
            └── google-rating/    # GET /google-rating(LP評価バッジ用。公開・認証不要。2026-09-14プレースホルダー実装)
```

管理APIは「閲覧」機能(予約一覧検索・日付×スタッフのスケジュール表示)、LPコンテンツ編集系(CONCEPT/SHOP&STYLE/STAFF/メニュー)、電話予約の代理登録・ステータス変更、月次営業日・シフト設定、顧客管理(no_show/ブロック)まで、api-design.mdに記載の管理API・管理画面がすべて実装済み(2026-09-16時点)。

## テスト

いずれもサーバー起動〜終了まで1コマンドで完結する。**実際にデプロイ済みの本番相当Supabaseに対してテストデータを作成する**(テスト予約`B0000000xx`がDBに残る。気になれば後でSQL Editorからまとめて削除する)。

**Windowsでのハマりどころ**: テストスクリプト内で`spawn(cmd, { shell: true })`して立てた静的サーバーは、`server.kill()`はおろか`taskkill /pid <pid> /f /t`(プロセスツリー指定)でも終了しないことを実機で確認した(npx経由の子プロセスがツリーから外れてしまう模様)。放置すると次回実行時にポート衝突でテストがタイムアウトする。対策として、対象ポートを実際にLISTENしているプロセスを`netstat`で特定して直接killする`killByPort()`をどちらのテストにも実装済み。同種のスクリプトを新しく書く場合もこの関数を再利用すること。

**⚠️ 実際に事故った教訓(2026-09-12)**: `admin.e2e.mjs`は当初、テスト前に`staff.auth_user_id`を無条件で`null`に戻す後片付けをしていた。これにより、オーナーの実ログイン(`khs.w098style@gmail.com`)を當眞優希のstaffレコードに紐付けた**後**にこのテストを実行したところ、後片付け処理が実ログインの紐付けを`null`で上書きして消してしまい、ログインできなくなった。修正済み: テスト実行前の`auth_user_id`を必ず読み取って保存し、後片付けでは`null`固定ではなくその値に復元する方式に変更(`previousAuthUserId`)。**教訓: テストの後片付けは「初期値に戻す」のであって「決め打ちの値にする」のではない。実データが絡むテストを書く/直すときは、この非対称性に注意すること。**

**⚠️ もう1つのハマりどころ(2026-09-12、manage.html実装時)**: `serve`パッケージはデフォルトで「clean URLs」機能が有効で、`/manage.html?token=xxx`のようなリクエストを`/manage`に301リダイレクトし、その際**クエリ文字列ごと消してしまう**(`Location: /manage`、tokenが消える)。クエリ文字列が本質的に重要なページ(manage.htmlのような)をローカルテストする際は要注意。`lp/serve.json`に`{"cleanUrls": false}`を設定して解決した。**本番ホスティング先を選ぶ際も、同様の「pretty URL」機能でクエリ文字列が欠落しないか確認すること**(Vercel/Netlify/Cloudflare Pagesそれぞれ挙動を要確認)。

### バックエンド単体テスト(Deno、Supabase接続不要)

```bash
cd city-dogs/booking
npm run test
```

`_shared/availability.ts`・`_shared/range.ts`・`_shared/validation.ts`に対する`Deno.test`ベースの単体テスト(2026-09-12追加、56件、オールグリーン)。Supabaseへの接続やデプロイは不要で、ローカルで即座に実行できる。

**設計判断**: `computeAvailability()`は元々Supabase呼び出し(`fetch*`ヘルパー)と空き枠計算ロジックが1関数に同居しており、そのままでは`SupabaseClient`をモックする脆いテストになってしまう。そこで空き枠計算の中核を`generateSlots()`という純粋関数(入力: 営業日・スタッフ一覧・シフトMap・既存予約Map・メニュー所要時間・現在時刻。Supabase型に一切依存しない)として切り出し、`computeAvailability()`はデータ取得後に`generateSlots()`へ委譲する薄いI/Oラッパーに変更した。`availability.test.ts`はこの`generateSlots()`を直接叩いており、境界値(最終受付ちょうど・施術時間が閉店をまたぐ・シフトと営業時間の交差・予約との重なり判定の隣接/包含/一部重複・過去枠の除外・複数スタッフのソート順)を実DBなしで網羅している。**今後`_shared/`に新しいロジックを追加する際も、I/O(Supabase呼び出し)と純粋ロジックを分離してからテストを書く方針を踏襲すること。**

### 予約UI(顧客向け)

```bash
cd city-dogs/lp
npm install                      # 初回のみ
npx playwright install chromium  # 初回のみ
npm run test:e2e
```

`SUPABASE_SERVICE_ROLE_KEY=<service_roleキー> npm run test:e2e` とすると、`manage.html`(予約確認・キャンセルページ)経由の照会・キャンセル、不正トークン時のエラー表示まで通しで検証する(未設定でも予約作成・スタイリスト指名までは検証される)。

### 予約管理画面(スタッフ向け)

```bash
cd city-dogs/booking/admin
npm install                      # 初回のみ
npx playwright install chromium  # 初回のみ(lpで導入済みなら不要)
SUPABASE_SERVICE_ROLE_KEY=<Project Settings > API のservice_roleキー> npm run test:e2e
```

テスト用のSupabase Authユーザーを一時作成し、既存スタッフ(當眞優希)に紐付けてログイン確認した後、必ず後片付け(紐付け解除・ユーザー削除)まで行う。service_roleキーはコードにハードコードしないこと(環境変数経由のみ)。

## 現在地・未決事項

- **LP**: 一通り完成(店内・スタイル写真反映済み)。WEB予約ボタンは実装済みの予約UI(`reserve.html`)に接続済み(旧「準備中」ダミー・モーダルは削除)。電話番号がプレースホルダー(`098-XXX-XXXX`)のままなので、実際の番号への差し替えが必要
- **⚠️ デバイス優先度の確認(2026-09-13)**: 顧客向けLP・予約フロー(`index.html`/`reserve.html`/`manage.html`)は**スマホ利用が大多数になる想定**とユーザーが明言。`styles.css`/`reserve.css`のブレークポイント(860/720/560/520px)とE2Eテスト(420×900のスマホ相当ビューポート)で確認済みだが、今後この3画面に手を入れる際は必ずモバイル幅での見た目を優先して確認すること。逆に予約管理画面(`booking/admin/`)はPC専用で問題ない、とユーザーが確定(スタッフはPC/タブレットから利用する運用のため、モバイル最適化は不要)
- **⚠️ 営業時間の要確認**: Instagram(@citydogs928)のbioには「10:00〜19:00」と記載されているが、LP・seed.sqlは元のHotPepper記載(平日10:00〜18:00・土日9:00〜18:00)のまま。どちらが正しいか店舗に確認し、正しければLPの表記と`booking/supabase/seed.sql`の営業日生成ロジック両方を修正すること
- **予約UI(`lp/reserve.html`)**: メニュー選択→**担当スタイリスト選択(リストボックス、「指名なし(おまかせ)」がデフォルト)**→日時選択→お客様情報入力→確定、の3ステップウィザード。電話番号はハイフン自動整形。Playwrightで実ブラウザ・実APIに対してエンドツーエンドテスト済み(二重予約防止の除外、指名したスタイリストどおりに予約されることもUI経由で確認済み)
- **担当スタイリスト選択**: `staff`テーブルに行を追加するだけで(コード変更不要で)リストボックスに自動反映される設計。`GET /staff`(`role != 'assistant'`かつ稼働中のスタッフを返す)を新設し、`computeAvailability()`が元々持っていた`staffId`フィルタ引数と組み合わせて実現。現状スタイリストは當眞優希1名のみだが、2人目以降が増えてもフロント・バックエンドとも改修不要
- **予約システム(バックエンド公開API)**: `menus` / `staff` / `availability` / `reservations` を実装・デプロイ・テスト済み。空き枠の時間刻みは30分(元15分から変更)。動作確認中に発見・修正したバグ: ①`--use-api`デプロイがimport mapを含むdeno.jsonを拾わずビルド失敗(インライン`npm:`指定子に戻して解決) ②`POST /reservations/:id/cancel`が顧客の知り得ない内部UUIDを要求していた設計バグ(`reservation_number`ベースに変更) ③型チェックで検出した埋め込みクエリの型不整合(2段階クエリに分割) ④完了画面で進捗インジケーターが「完了」にならない表示バグ(`hidden`属性とCSSの`display`指定の競合。`[hidden]{display:none!important}`を追加して解決)
- **予約管理画面(`booking/admin/`)— 実装済み**: Supabase Auth(email/password)によるログイン、日付×スタッフのスケジュール表示、予約番号/電話番号/氏名/日付範囲/ステータスでの検索を実装・デプロイ・テスト済み(実ログイン→実データでのE2Eテスト実施済み)。ログイン用アカウントは`khs.w098style@gmail.com`で作成済み(當眞優希のstaffレコードに仮で紐付け。将来的に店舗オーナー用として別レコードに分ける可能性あり)。**当初は「閲覧」機能のみだったが、2026-09-14〜16にかけて電話予約の代理登録・ステータス変更・リスケジュール・月次営業日/シフト設定・顧客管理まで実装済み(詳細は以下の各項目参照)。api-design.mdに記載の管理機能は2026-09-16時点ですべて実装完了**
- **予約管理画面が使う管理API(バックエンド)— 書き込み系の一部を実装(2026-09-14)**: `GET /admin-reservations`(検索)・`GET /admin-reservations/schedule`(スケジュール)に加え、`POST /admin-reservations`(電話予約の代理登録)・`PATCH /admin-reservations/:id`(ステータス変更・スタッフ/時間のリスケジュール)を実装・デプロイ済み(型チェック・Lint・単体テストすべてグリーン)。`admin-menus`(メニューCRUD)も実装済み。
  - 公開の`POST /reservations`と共通のロジック(空き枠再検証・EXCLUDE制約による競合検知)は`_shared/customers.ts`(顧客upsert)・`_shared/reservationEmail.ts`(確認メール本文)に切り出して重複を解消した
  - リスケジュール(`PATCH`でstaff_id/start_atを変更)は、変更対象の予約自身を空き判定から除外する`excludeReservationId`を`computeAvailability()`に追加して対応(除外しないと同じ時間のままスタッフだけ変える等のケースで自分自身とぶつかって誤って`SLOT_UNAVAILABLE`になる、実装時に発見した境界値)
  - **電話番号チェックは最終的に公開予約(`reserve.js`)と完全に同一仕様に統一(2026-09-14)**: 当初は電話受付を想定して固定電話も許容する`isValidJpPhone`を追加していたが、管理画面のハイフン自動整形もreserve.jsと揃えたいというユーザー判断を受け、バックエンドの検証も携帯限定の`isValidJpMobilePhone`に統一した(`isValidJpPhone`は削除、単体テストも整理済み)。固定電話からの代理予約登録は現状できない
  - **管理画面(`booking/admin/`)側のUIも実装済み(2026-09-14)**: スケジュールタブに「電話予約を登録」ボタン(モーダルで氏名・電話番号・メールアドレス任意・メニュー・担当・日時・メモを入力→`POST /admin-reservations`)を追加。スケジュール/検索両タブの各予約に「編集」ボタンを追加し、共通の編集モーダルから①ステータス変更(現在のステータスから遷移可能な選択肢のみをクライアント側でも絞り込んで表示。理由必須の遷移は理由入力欄を表示)②リスケジュール(担当・来店日・開始時刻の変更)を`PATCH /admin-reservations/:id`で行える
  - メニュー・スタッフの選択肢は`GET /menus`・`GET /staff`(いずれも公開API)から取得してキャッシュする方式
  - **⚠️ 実際に踏んだ教訓**: 当初「開始時刻」を自由入力の`<input type="time">`にしていたが、空き枠は30分刻みでしか生成されないため、その刻みに乗らない時刻(例: 11:15)を送信すると「その時刻の枠自体が存在しない」だけなのに「選択した時間はすでに埋まっています」という紛らわしいエラーになる不具合が実機で発生した。予約画面(`reserve.js`)と同様に**`GET /availability`を叩いて実際に予約可能な時刻だけを選択肢にする方式**に修正した。リスケジュール用の選択肢も同じ理屈で`GET /availability`を使うが、変更対象の予約自身が今使っている枠はこのAPIでは(自分自身とぶつかって)除外されてしまうため、担当・日付を変えていない場合は現在の枠を選択肢に補って表示している(`admin.js`の`refreshEditSlots()`のコメント参照)。この対応に伴い、`schedule.ts`・`list.ts`のレスポンスに`menu_id`を追加した(空き枠取得に必要なため、従来は`menu_name`しか含んでいなかった)
  - **🐛 実際に踏んだ教訓(2026-09-16、E2Eテストで発見した実害のあるバグ)**: 代理予約登録モーダルで「メニューを選ぶ→続けて日付を変える」のように短時間に連続して操作すると、それぞれの操作が空き枠取得(非同期)を呼ぶため、**後の操作(日付変更)によるリクエストより、前の操作(メニュー変更、まだ古い日付)によるリクエストの応答が遅れて返ってくることがあり、古い応答が新しい応答を上書きしてしまう**不具合があった。実機では「+14日後を指定したはずが今日の日付で予約が作られる」という形で再現した。E2Eテストを`.last()`(一覧の末尾要素を掴む、同姓同名の予約が複数あると曖昧になる)から、POSTレスポンスのidで一意に対象を特定する方式に直したことで初めて検出できた(名前ベースの検索だと過去の別予約と誤ってマッチし、この不具合を素通りしていた)。`refreshCreateSlots()`・`refreshEditSlots()`双方に、呼び出しごとに増分するリクエストトークンを持たせ、自分より後のリクエストが既に完了していれば結果を破棄するガードを追加して解決。**教訓: 複数のUI操作がそれぞれ独立した非同期処理(特に選択肢の取得)を発火させる作りにする場合、リクエストの完了順序は保証されないことを前提に設計すること。E2Eテストで要素を特定する際も、名前など重複しうる属性ではなく一意なID(サーバーが発行したもの)を使うべき**
  - **ユーザーによる実機動作確認済み(2026-09-16)**: 電話予約の代理登録→ステータス変更→リスケジュールの一連の流れを実際にログインして確認、正常動作を確認済み
  - **E2Eテストを追加・ユーザーの実行でAllグリーン確認済み(2026-09-16)**: `admin.e2e.mjs`に「電話予約の代理登録(空き枠セレクトからの選択・電話番号の自動ハイフン整形の検証込み)→ステータス変更(確定→施術中)→リスケジュール(担当そのまま別日の空き枠へ)」を追加し、ユーザー自身が`SUPABASE_SERVICE_ROLE_KEY`を使って実行、exit code 0・`E2Eテスト失敗`表示なし・`ブラウザ側のコンソールエラーなし`をすべて確認済み。作成したテスト予約は`lp/tests/reserve.e2e.mjs`と同じ方針で後片付けしない(納品前に一括クリアする運用のため)
  - **🐛 実際に踏んだ教訓(2026-09-16、後日の別作業で発覚)**: リスケジュール先に固定の「実行日+15日」を使っていたところ、同日中に(別の不具合調査で)8回以上実行し直した結果、この日にテスト予約が積み上がって當眞優希さんの当日の枠(10:00-18:00)が完全に埋まり、「空き枠がありません」でテストが失敗した。「予約は後片付けしない」方針(上記)と「固定の相対日付を使う」設計を組み合わせると、同日に何度も実行し直すケースに弱いことが露呈した。応急で+40日に変えたところ今度は定休日(月曜)に当たって別の形で失敗し、固定オフセットそのものが根本的に脆いと判断。**最終対応**: `findDateWithRealOptions()`ヘルパーを新設し、日付を1日ずつ進めながら実際に空き枠が見つかる日まで探す方式(+30日から開始、最大15日分試す)に変更した。**教訓: 日付が絡むE2Eテストで固定の相対オフセットを使う場合、(a)後片付けしない予約が積み上がる、(b)たまたま定休日に当たる、の両方が起こりうる。決め打ちの日付ではなく、実際に条件(空き枠がある等)を満たす日を探す方式を最初から使うこと**
  - **この過程で発見・修正したテスト自体の不具合3件**: ①`card.innerText()`では`<input value>`の値が拾えず常に誤判定していた(`inputValue()`に修正) ②`.last()`(一覧末尾の動的参照)で削除後のdetached判定をしていたため、他の要素が残っていると永久に検知できなかった(`data-id`指定のロケータに変更) ③追加直後に固定時間だけ待って一発判定していたため、Edge Functionの応答が遅いと誤って失敗していた(該当フィールドが期待値になるまでポーリングする方式に変更)
  - **🐛 この過程で発見・修正した実際のアプリのバグ1件(下記「実際に踏んだ教訓」参照)**: `.last()`(顧客名で検索、同姓同名の予約が複数あると曖昧)からPOSTレスポンスのidで一意に特定する方式に直したことで初めて検出できた、`refreshCreateSlots()`/`refreshEditSlots()`の非同期リクエスト順序不整合バグ
- **シフト/営業日設定(バックエンド)— 実装・デプロイ済み(2026-09-16)**: `admin-business-days`(`GET/PUT /admin-business-days`、`POST .../generate-month`)・`admin-staff-shifts`(`GET/PUT /admin-staff-shifts`、`POST .../generate-month`)を実装。型チェック・Lint・単体テストすべてグリーン
  - `PUT`メソッドを初めて使うAPIだったため、`_shared/cors.ts`の許可メソッド一覧に`PUT`を追加(以前DELETEを入れ忘れた教訓を踏まえ、実装時に気づいて対応。全11 Functionを再デプロイ)
  - `generate-month`は「まだ行が無い日だけ」デフォルト値で埋める設計(`ON CONFLICT DO NOTHING`)。手動でカスタマイズ済みの日(祝日等)を上書きしない。スタッフシフトの`generate-month`は営業日(`business_days.is_open=true`)が先に存在することが前提(未生成の月は何もしない)
  - **⚠️ 実際に踏んだ教訓**: 新しいFunctionをデプロイした直後、数十秒ほど`401`(期待通り)と`404`(Supabase基盤側の"Requested function was not found")が不規則に混在する現象を実機で確認した。エッジネットワークへの伝播待ちと見られ、待てば自然に安定する(今回は約30秒で解消)。新規Functionを初めてデプロイした直後の動作確認では、これに驚いて実装を疑わないよう注意
  - **管理画面(`booking/admin/`)側のUI(2026-09-16)**: 新しい「営業日・シフト」タブを追加。**初版は当月の全日付をカードで縦に並べる一覧UIだったが、ユーザーから「30日分をベタッと並べるのは使いづらい」と即フィードバックを受け、SALON BOARD相当のカレンダーグリッド表示(7列×週数、日付セルをクリックするとモーダルで編集)に作り直した**。営業日設定・スタッフシフト設定それぞれに月送り(前月/翌月ボタン)・カレンダー・「この月を生成」ボタンを用意。スタッフシフトはスタッフ選択のプルダウンで表示対象を切り替える(月ごとの全shiftsデータは1回のGETでキャッシュし、スタッフ切り替え時は再フェッチしない)
  - **教訓**: 「1か月分の設定」のような月次データは、最初から縦並びリストではなくカレンダー形式を検討すべきだった(SALON BOARDという実例が既に参考資料にあったにもかかわらず、既存の`content-card-list`パターンを安易に流用してしまった)。今後、月次・日次の設定系UIを作る際はカレンダー表示を第一候補にすること
  - E2Eテストも合わせて更新(2026-09-16、ユーザーの実行でAllグリーン確認済み): `admin.e2e.mjs`のステップ13を、カレンダーのセルをクリック→モーダルで編集→保存→再度開いて反映確認、という新UIに合わせた手順に書き換えた。対象月は実行日の8か月後(実データと絶対に被らない未来月)
- **予約管理リンク(顧客ログイン不要、上記の予約管理画面とは別機能)— 実装済みだが実際には未稼働**: Web予約時にメールアドレスを必須化し、予約ごとに`manage_token`(uuid)を発行。予約確定メール(Resend経由)に「確認・変更・キャンセルリンク」を記載し、`manage.html?token=...`でログインなしにその予約1件だけを照会・キャンセルできる。実装・デプロイ・E2Eテスト(照会→キャンセル→不正トークンのエラー表示まで)済み。**`RESEND_API_KEY`は2026-09-11から設定済みでメール自体は送信されるが、`MANAGE_PAGE_BASE_URL`が未設定のため(2026-09-14に`npx supabase secrets list`で実際に確認)、メール内のリンクは`https://your-domain-not-configured.example/manage.html`というプレースホルダーURLのまま送信される**(`reservations/create.ts`の意図的なフェイルセーフ)。つまり今Web予約すると実際のお客様にはリンク切れのメールが届く。ホスティング先確定後に`MANAGE_PAGE_BASE_URL`を設定するまでは実運用不可
- **LPコンテンツ管理画面 — 実装・デプロイ・実機テストまで完了(2026-09-13〜14)**: 別アプリを新設せず、既存の予約管理画面(`booking/admin/`)に「LPコンテンツ」タブとして統合した。対象はCONCEPT(特徴カード)・SHOP & STYLE(写真)・MENU & PRICE(メニュー・料金、2026-09-14追加)・STAFF(紹介文)の4つ。
  - バックエンド: `GET /site-content`(公開)、`admin-site-content`(要ログイン、features/gallery/staffのCRUD)、`admin-menus`(要ログイン、menusの追加・更新。2026-09-14実装・デプロイ済み)。`npm run check`/`lint`/`test`すべてグリーン
  - LP: `lp/index.html`のCONCEPT/SHOP&STYLE/MENU&PRICE/STAFFセクションをハードコードHTMLから`site-content.js`によるAPI駆動描画に変更。E2Eテスト`lp/tests/site-content.e2e.mjs`で実際のデプロイ済みAPIに対して検証済み(オールグリーン)
  - 管理画面: 「LPコンテンツ」タブに特徴カード・写真・メニューの一覧編集/追加、スタッフの編集UIを実装済み。**E2Eテスト追加・ユーザーの実行でAllグリーン確認済み(2026-09-16)**: `admin.e2e.mjs`にCONCEPT/SHOP&STYLE/MENU&PRICE/STAFFそれぞれの追加→編集→(features/galleryは削除、menus/staffは削除ボタン非表示の確認)を追加した。menus/staffは削除UIを提供しない設計のため、テストデータの後片付けはservice_roleクライアントで直接DELETEする方式(`cleanupTestContentRows()`、実行前後の両方で呼び冪等)
  - **スタッフ管理も同じタブに統合(2026-09-13追加)**: 当初はLP紹介文(`name_en`/`bio_role_label`/`bio_comment`/`avatar_image_url`)の編集のみに絞る設計だったが、「オーナーにDBの`staff`テーブルへの直接行追加を求めるのはハードルが高い」というフィードバックを受けて、氏名・権限区分(`role`)・稼働状況(`is_active`)・表示順の編集と新規スタッフの追加も同じ`admin-site-content/staff`エンドポイントに統合した。管理画面から`role=stylist`かつ稼働中で追加すれば、コード変更なしに`GET /staff`(予約画面の指名リスト)にも自動反映される(ただし実際に予約を受け付けるには別途シフト登録が必要。現状シフト設定はSQLでの登録のまま=未解決のバックログ)
  - **スタッフ・メニューの削除機能を追加(2026-09-16)**: 当初は「削除は一切提供しない、`is_active=false`で運用」という設計だったが、ユーザーから「テストで登録したスタッフ/メニューを消せないと困るのでは」と指摘を受け見直した。実際の制約は`reservations.staff_id`/`menu_id`という**外部キー制約**であり、一度でも予約に使われた行だけがDBレベルで物理削除できない(参照されていなければ削除は技術的に可能)。そこで「削除を一律禁止」ではなく「削除を試みて、外部キー違反(Postgresエラーコード`23503`)ならエラーメッセージで`is_active=false`運用を案内する」方式に変更。`DELETE /admin-site-content/staff/:id`・`DELETE /admin-menus/:id`を追加し、管理画面にも削除ボタンを復活させた。**教訓: 「削除不可」という制約を実装する際は、本当にDB制約でそうなるケースだけに絞り込めないか(=一律で機能ごと封印していないか)を疑うこと**。E2Eテストも「削除ボタンが出ないことの確認」から「実際に削除できることの確認」に更新済み
  - **画像アップロード機能(Supabase Storage連携)は意図的にスコープ外のまま**: `image_url`/`avatar_image_url`はテキスト入力(パス直書き)のみ。管理画面上も「アップロード機能は未実装」と明記してある
  - **既知の副作用**: メニュー価格表示から「〜10,000」のような価格帯表示が失われた(`menus.price`が単一整数のため、元のハードコードHTMLにあった価格帯表現は再現できない。seed.sqlの元コメント参照)
  - **⚠️ 実際に踏んだ教訓(2026-09-13)**: マイグレーション適用直後は`db push --include-seed`がseed実行を「成功」と報告してもデータが実際には反映されないことがあった(ハッシュ管理の挙動によるものと推測、`npx supabase db query --linked -f supabase/seed.sql`で直接実行して解決)。また、新テーブル作成直後はPostgREST側のスキーマキャッシュが追いつかず`GET /site-content`が数十秒だけ500を返すことがある(自然に解消する)。この対策として、LP側の`site-content.js`は1回だけ間隔を置いて自動リトライする実装にしてある
  - **⚠️ 実際に踏んだ教訓(2026-09-14)**: `_shared/cors.ts`の`Access-Control-Allow-Methods`に`DELETE`を含め忘れており、特徴カードの追加(POST)は成功するのに削除(DELETE)だけブラウザのpreflightでブロックされる不具合が実機で発生した(GET/POST/PATCHのみ許可していたのが原因)。修正して該当7Function全てを再デプロイして解決。**教訓: 新しいHTTPメソッドを追加するAPIを実装する際は、CORS共有設定の許可メソッド一覧を更新し忘れていないか必ず確認すること。**
- **顧客管理 — 実装・デプロイ済み(2026-09-16)**: `admin-customers`(`GET /admin-customers`で電話番号/氏名検索、`GET/PATCH /admin-customers/:id`で詳細閲覧・更新)を実装。管理画面に「顧客管理」タブを追加し、検索結果を氏名・フリガナ・電話番号・メール・店舗メモ・無断キャンセル回数・要注意(ブロック)フラグを編集できるカードで表示。「予約履歴を見る」ボタンで直近の予約(最大20件)を遅延読み込みして表示する(検索結果一覧の時点ではN+1を避けるため取得しない)
  - 電話番号の編集は代理予約登録と同じ自動ハイフン整形(`formatPhoneNumber`の使い回し)。`customers.phone`のunique制約に違反した場合は`23505`をハンドリングして分かりやすいエラーメッセージを返す
  - 顧客の削除は提供しない。理由はstaff/menusと同様`reservations.customer_id`の外部キー制約に加え、顧客は予約経由でしか作られない設計のため「テストで手動作成してしまい削除したい」という需要自体が発生しにくい(手動追加フォームを用意していない)
  - E2Eテストも追加(ステップ14、2026-09-16にユーザーの実行でAllグリーン確認済み): 代理予約(ステップ10)で作った顧客を電話番号検索→メモ・要注意フラグを編集→保存→予約履歴を展開してその予約番号が表示されることを確認
- **Google口コミ連携 — 配線のみ実装済み(2026-09-14、プレースホルダー状態)**: LPヒーローの「★★★★★ 4.88(11件の口コミ)」はHotPepperの表示を手動コピーした静的なハードコード値だったが(自動取得の仕組みは元々何もなかった)、HotPepper解約も見据えてGoogle口コミへの切り替えができるよう先に配線した。新規Function `GET /google-rating` は`GOOGLE_PLACES_API_KEY`/`GOOGLE_PLACE_ID`のsecrets未設定の間は`configured:false`を返すだけで、LP側は現状の数値表示を維持する(fail-soft)。secretsを設定すれば追加のコード変更なしに実際のGoogle評価に切り替わる。**コスト注意**: `rating`/`userRatingCount`はGoogle Places API(New)で最も高い「Enterprise SKU」区分(無料枠は月1,000回)なので、`google_rating_cache`テーブルで24時間キャッシュし呼び出し頻度を抑える設計にしてある。Google Cloud側の準備(プロジェクト作成・請求先登録・APIキー発行・Place ID特定)はユーザー側で対応が必要。詳細は[api-design.md](./booking/design/api-design.md)の「GET /google-rating」参照
- **🚨 セキュリティ修正(2026-09-16)— 全テーブルでRow Level Security(RLS)が未設定だった**: Supabase Security Advisorの警告(`rls_disabled_in_public`)をきっかけに発覚。プロジェクト開始時からどのテーブルにもRLSが一度も有効化されておらず、LP・管理画面のクライアントJSに埋め込んでいるpublishable(anon)キーだけで、Edge Functionsを一切経由せずPostgREST自動API(`/rest/v1/<table>`)経由に顧客の氏名・電話番号・メールアドレス等を含む全テーブルを直接読み書き・削除できる状態だった。**実際にanon keyで`customers`テーブルの氏名・電話番号・メールアドレスが直接読み取れることをcurlで実証してから修正**。`0006_enable_row_level_security.sql`で9テーブル全て(`customers`/`staff`/`menus`/`business_days`/`staff_shifts`/`reservations`/`site_features`/`site_gallery_photos`/`google_rating_cache`)にRLSを有効化(ポリシーは1つも作らず、有効化するだけ=anon/authenticatedロールからは何も見えない状態にする)。Edge Functionsは全てservice_roleクライアント(RLSを無視するbypassrls権限を持つ)経由でDBにアクセスしているため、この変更による機能への影響はない(適用後に`/menus`・`/site-content`・`/staff`・`/availability`が正常動作することを確認済み)。**教訓: 「アプリ層でPostgREST直叩きを禁止する設計方針」はDB側の強制力を伴わないため、テーブル作成時は必ずRLSも同時に有効化する習慣が必要。今後新しいテーブルを追加する際は、マイグレーションに`enable row level security`を含めることを忘れないこと**
- **公開APIのレート制限 — 実装・デプロイ済み(2026-09-16)**: 下の「納品までに対応する」1.で洗い出した`GET /reservations/lookup`(電話番号+連番のreservation_numberでの総当たり)対策として、固定ウィンドウ方式のレート制限を実装した。
  - `0007_rate_limiting.sql`: `rate_limit_buckets(key, count, window_start)`テーブル(RLS有効・ポリシーなし)と、`rate_limit_hit(p_key, p_limit, p_window_seconds)` RPC(単一の`INSERT .. ON CONFLICT DO UPDATE .. RETURNING`で原子的にカウント。read-then-writeによる競合状態を避けている)
  - `_shared/rateLimit.ts`の`enforceRateLimit()`をルーティング(`reservations/index.ts`)側で各エンドポイントの処理本体に入る前に呼ぶ方式。キーは`バケット名:IPアドレス`(IPは`x-forwarded-for`の先頭値、Supabaseのエッジ基盤が付与するためクライアント側からは偽装不可)。RPC自体が失敗した場合はfail-open(ログのみ残して素通し。レート制限の不調で予約受付そのものを止めない方針、RESEND_API_KEY未設定時のフェイルセーフと同じ考え方)
  - 適用先と上限: `GET /reservations/lookup`(10回/5分、本命の対策)、`POST /reservations/:reservation_number/cancel`(10回/5分、同じ連番総当たりで他人の予約を無断キャンセルされないための対策)、`GET・POST /reservations/manage`系(20回・10回/5分、manage_tokenはUUIDで総当たり自体が非現実的だが多層防御として)、`POST /reservations`(10回/10分、スパム登録対策。Cloudflare Turnstileは別途ユーザー側でのアカウント開設が必要なため未着手のまま)
  - 実機で動作確認済み(直接RPC呼び出しで10回目まで許可・11回目以降ブロックを確認。Edge Function経由でも429が返ることを確認したが、**デプロイ直後は一部リクエストが旧バージョンに古いエッジノードでルーティングされ、ブロックされない結果が混ざることがあった**(既出の「新規Function初回デプロイ直後の伝播待ち」と同種の現象。数十秒待てば解消)
  - 型チェック・Lint・単体テスト(`_shared/rateLimit.test.ts`、IP抽出ロジックのみ純粋関数として切り出しテスト)すべてグリーン
  - **未対応のまま**: Cloudflare Turnstile(ボットによる自動投稿対策の残り半分)。ユーザー側でのCloudflareアカウント開設・サイトキー発行と、フロントエンド(`reserve.js`)へのウィジェット組み込みが必要なため別タスクとする
- **⚠️ 納品までに対応する(2026-09-16、ユーザー確定)— セキュリティ関連の残課題**: RLS対応(上記)は完了したが、そのレビュー中に洗い出した以下は納品前に対応する方針で合意済み
  1. **公開APIのレート制限・Cloudflare Turnstile**: `POST /reservations`のボット対策に加え、`GET /reservations/lookup`は`reservation_number`が`B000000001`のような連番のため、電話番号(攻撃者が知っている前提)と組み合わせた総当たりで他人の予約情報を引き当てられるリスクがある。**→レート制限は実装済み(上記)。Turnstile部分のみ残**
  2. **`ALLOWED_ORIGINS`のsecret設定**: 現状未設定で全オリジン許可(`*`)。本番ドメイン確定後に必ず絞る(ホスティング決定と連動するタスク)
  3. **Supabaseダッシュボードのアカウント2段階認証(2FA)の確認**: RLSを固めても、管理画面に入れるアカウント自体が乗っ取られては意味がない。ユーザー側で確認が必要な項目(AI側では確認・設定不可)
  4. **個人情報保護法(APPI)対応の意識**: 氏名・電話番号を扱う以上、事業規模に関わらず対象になる。今回のRLS対応のような技術的安全管理措置は継続して意識すること(法律の詳細は専門家確認が確実)
- **スタッフの休憩時間を空き枠計算から除外する — 実装・デプロイ済み(2026-09-16)**: バックログ項目を解消。`staff_shifts`に`break_start_time`/`break_end_time`(1日1回、任意)を追加し、`_shared/availability.ts`の`generateSlots()`で既存予約との重なり判定と同じ考え方(半開区間の`overlaps()`)で、施術時間が休憩に少しでもかかる枠を除外するようにした。
  - `0008_staff_shift_breaks.sql`: 2カラム追加+CHECK制約(片方だけの指定を禁止、開始<終了を強制)
  - `admin-staff-shifts`(shifts.ts): バリデーション追加、UI(`booking/admin/`のシフト編集モーダル)に休憩開始・終了(任意)の入力欄を追加。スケジュールタブ・シフトカレンダーの表示テキストにも休憩時間を併記
  - `_shared/availability.ts`のShiftInfoに`break_start_time`/`break_end_time`を追加(既存呼び出し元との互換性のため両方optional)。単体テスト5件追加(休憩に完全に含まれる枠/施術時間が少しかかる枠/隣接するだけの枠は除外されない/休憩未設定時は影響なし/スタッフごとに独立、の境界値を網羅)、`npm run check`/`lint`/`test`(65件)すべてグリーン
  - 型チェック・Lintは通過、マイグレーション適用・関連Function(`availability`/`reservations`/`admin-reservations`/`admin-staff-shifts`)の再デプロイ・実機での動作確認まで完了(休憩13:00-14:00・40分メニューで12:30/13:00/13:30の枠が正しく除外され、14:00以降は通常どおり復帰することを実際のAPIレスポンスで確認)
  - **⚠️ 実際に踏んだ教訓**: デプロイ直後、デプロイ済みソースをダウンロードしてローカルとバイト一致(`supabase functions download`)・`supabase functions list`のversion更新も確認できているにもかかわらず、しばらく(数分オーダー)は実際のレスポンスが再デプロイ前の古いコードのまま返ってくる現象が発生した。一時的にデバッグ用の分岐(受け取ったshift行をそのまま返す)を仕込んでも反応せず、コード起因のバグではないと判断する決め手になった。**教訓: デプロイ後の実機確認で新しいコードの形跡が全く見えない(デバッグログ・分岐追加すら反応しない)場合、コードを疑う前に「ソースは正しくデプロイされているか(`functions list`のversion/`functions download`との比較)」を先に確認し、時間を置いて再確認する選択肢を持つこと。今回は既出の「新規Function初回デプロイ直後の伝播待ち」よりも長い(数分)ケースだった**
  - **🚨 実際に踏んだ教訓(上記とは別の、より重い症状)**: `admin-staff-shifts`だけ、`deploy`コマンドが3回とも成功メッセージを返すのに`supabase functions list`の`version`/`updated_at`/`ezbr_sha256`が一切変化せず、実際には一度も再デプロイされていなかった(=数分待っても解消しない、上記の「伝播待ち」とは別種の障害)。E2Eテストが「休憩時間が保存されていない」という形で検出したが、原因はアプリのコードでもテストでもなく、このFunctionのデプロイ経路がプラットフォーム側で固着していたことだった。**対処法: `supabase functions delete <name>`で一度削除してから`deploy`し直すと、新しい`id`・新しい`ezbr_sha256`で再作成され解消した(DB側のデータには影響しない、Edge Functionのコードだけの話)**。**教訓・今後のデプロイ運用**: `deploy`コマンドの「成功」表示だけを信用せず、特に重要な修正をデプロイした直後は`npx supabase functions list`でその関数の`version`または`updated_at`が実際に変化したかを確認する習慣をつけること(今回のように何度デプロイし直しても変化しない場合は、コードを疑う前にこの「固着」を疑い、delete→deployで解消を試す)。原因はSupabase側のプラットフォーム挙動でありこちら側では完全には防げないが、検知を早めることはできる
  - `admin.e2e.mjs`のステップ13(シフト編集)に休憩開始・終了の入力・保存確認を追加し、さらに保存後`GET /availability`を直接叩いて休憩時間に重なる枠が実際に除外されていることまで検証するアサーションを追加。**2026-09-16、ユーザーの実行でAllグリーン確認済み**(この過程で「デプロイが成功表示でも実際には反映されない」不具合と「固定の相対日付によるテストデータ蓄積・定休日ヒット」の2つを発見・修正。詳細は上記および[[feedback_e2e_no_fixed_waits]]参照)
  - **🐛 E2Eテストで実際に踏んだ教訓(2026-09-16、休憩時間アサーション追加直後に発覚)**: 追加した「シフト編集→保存→再度開いて休憩時間が保存されていることを確認」のステップが`シフトの休憩時間が保存されていません: ""〜""`で失敗した。原因はアプリのバグではなくテスト側の既存の弱点で、`submitStaffShiftForm()`が`closeModal()`(同期)の後に`await loadStaffShifts()`(非同期、カレンダー再描画)を呼ぶ構造になっており、モーダルが閉じた時点ではカレンダーの再描画がまだ完了していないことがある。この直後に固定800ms待ってから同じセルを再クリックする書き方だったため、Edge Functionの応答が普段より遅いタイミングでは再描画前の古いデータでモーダルが再度開いてしまい、保存したはずの値が空欄に見えていた(これは実際のデータ欠落ではなく、テストが見るタイミングが早すぎただけ)。営業日の個別編集(`#bdNote`確認)も同じ構造で同じ弱点を抱えていたため、両方まとめて修正した。**修正方法**: 「セルを再クリック→モーダルを開く→期待する値になっているか確認→なっていなければ閉じてリトライ」をポーリングする`reopenUntil()`ヘルパーを新設し、固定`waitForTimeout(800)`を置き換えた。あわせて、一括生成直後に拾う「最初のセル」もこれまでは月初の1日目を機械的に拾っていた(休業日で`is_working`が立っていない可能性がある)ため、`.is-open`クラスを持つセル(実際に生成された営業日/シフト)を明示的に待ってから選ぶように変更した。**教訓: 「モーダルを閉じる」と「一覧の再読み込み」が別の非同期処理になっているUIでは、閉じたことだけを見て次の操作に進むと、再読み込み完了前の古い状態を掴んでしまう競合状態が起きうる。この種の「保存→閉じる→再度開いて確認」というテストパターンを書く/直す際は、固定waitではなく`waitForLocatorText`や今回の`reopenUntil`のように、期待する状態になるまでポーリングする方式を最初から使うこと**
  - **🐛 E2Eテストで実際に踏んだ教訓その2(2026-09-16、上記の`reopenUntil`化直後)**: 今度は`reopenUntil`が10秒でタイムアウトして失敗した。原因はテストのアサーション自体の誤り: Postgresの`time`型は`"13:00:00"`のように秒付きでJSON化され、`<input type="time">`の`.value`にその秒付き文字列を代入しても(ブラウザのtime input実装をSupabase接続なしのPlaywright単体で直接検証して確認済み)秒は切り捨てられずそのまま保持される。一方でテストの比較は`bs === '13:00'`という秒なしの厳密一致だったため、実際には正しく保存・表示されているのに永久に一致せずタイムアウトしていた(アプリのバグではなくテストのアサーションが実際のブラウザの値表現を考慮していなかった)。`admin.js`側の表示コード自身は同じ理由で元から`.slice(0, 5)`して比較・表示している(`renderStaffShiftsCalendar()`等)ため、テスト側もそれに合わせて`bs.slice(0, 5) === '13:00'`に修正した。**教訓: `<input type="time">`など、DBの型とHTML要素の値表現が微妙に異なりうる項目をE2Eで厳密一致比較する際は、アプリ本体の表示コードが実際にどう正規化しているか(今回なら`.slice(0,5)`)を先に確認し、それに合わせること**
  - **休憩対応のレビュー中に発見した既存の設計ギャップも解消(2026-09-16)**: リスケジュール画面(`admin.js`の`refreshEditSlots()`)は、変更対象の予約自身が「自分の予約とぶつかって空き枠から消える」のを防ぐため、担当・日付を変えていない場合に「今使っている枠」をクライアント側で手動で選択肢に補完していた。この補完は休憩の有無を考慮しないため、**予約成立後にその時間へ休憩を追加すると、リスケジュール画面では休憩中のはずの時間が選択肢に残り続ける**という穴があった(実害は低いが把握しておくべき既知のギャップとして一度報告)。調べたところ根本原因は、`computeAvailability()`に元々あった`excludeReservationId`(予約自身を空き判定から除外する仕組み、`admin-reservations/update.ts`のサーバー側再検証では使用済み)が、`GET /availability`の公開エンドポイントにもフロントエンドの呼び出しにも配線されておらず、クライアント側の手動補完という迂回策で凌いでいたことだった。`GET /availability`に`exclude_reservation_id`クエリパラメータ(UUID形式チェック込み)を追加してこの配線を直したことで、`refreshEditSlots()`側の手動補完コードは丸ごと不要になり削除した(休憩・営業時間の変更もサーバー側の計算にそのまま正しく反映されるようになった)。型チェック・Lint・単体テスト(65件)すべてグリーン、実機でも`exclude_reservation_id`の正常系(200)・不正形式(400 VALIDATION_ERROR)を確認済み。**教訓: 場当たり的なフロントエンドの補完コードを見つけたら、サーバー側に既に用意されていて配線されていないだけの仕組みがないか疑うこと。今回は自前の配列操作を削除して既存のサーバー機能を使うだけで、コードは減らしつつ不具合も解消できた**
- **未着手全般**: LINE通知連携、HotPepper併走期間の運用ルール確定
- **LP公開・本番ドメイン設定は意図的に保留中**: RESEND_API_KEYは設定済みで実送信も確認済みだが、`MANAGE_PAGE_BASE_URL`を本番ドメインに向けての公開デプロイはユーザーの明示的な判断で見送り中(2026-09-12「今はデプロイせず、ローカル確認のままでよい。もう少し固めてから試す」)。次に着手する際は、ホスティング先決定→独自ドメイン取得→`ALLOWED_ORIGINS`/`MANAGE_PAGE_BASE_URL`/`RESEND_FROM_ADDRESS`のsecret更新→manage.htmlのクエリ文字列欠落がないか実機確認、の順で進める
- **テストカバレッジの既知のギャップ**: メール本文・送信自体の自動テストなし(Resend実送信は手動確認のみ)。`manage.html`のE2EカバレッジはSUPABASE_SERVICE_ROLE_KEY設定時のみ実行される。バックエンドの単体テスト(上記「バックエンド単体テスト」節)は`_shared/`の3ファイルのみが対象で、各Functionのルーティング・リクエスト検証部分(`*/index.ts`)自体は依然E2Eテストのみでカバー
- **Supabase無料枠の容量感(2026-09-13時点で調査)**: DB 500MB / ファイルストレージ1GB / 月間帯域5GB / Edge Function月50万回呼び出し。1店舗・固定客500人規模のテキストデータ(LPコンテンツ管理機能の追加分も含む)ではDB容量は全く問題にならない見込み(数十〜数百KBオーダー)。写真はSupabase Storageではなくホスティング側の静的ファイルとして配信しているため1GB枠も消費しない。**⚠️注意点**: 無料プロジェクトは1週間アクセスがないと自動的に一時停止(auto-pause)される仕様がある。現在LP公開は保留中で開発が数日〜数週間空くことがあるため、次回作業時にプロジェクトが一時停止している可能性がある。再開自体はSupabaseダッシュボードから手続きすれば可能で致命的ではないが、「繋がらない」となった場合はまずこれを疑うこと

## 他店舗への展開方針(テンプレートとして複製する場合)

City Dogs向けに作ったこの予約システムを、将来的に別の店舗でも使い回したいという話が出た(2026-09-16)。検討の結果、**「1つのシステムを複数店舗で共有する本格的なマルチテナントSaaS」ではなく、「店舗ごとにこのリポジトリを複製し、個別にSupabaseプロジェクト・ホスティングを持たせるテンプレート方式(1店舗1リポジトリ)」を採用する**とユーザーが判断した(理由・見送った案は下の「検討したが見送ったもの」の「マルチテナント化」項目を参照)。

物理的にフォルダを「店舗固有」「共通」に分割するような重い抽象化はせず(過剰な抽象化はしないという方針)、代わりに以下の軽量な対応にとどめた(2026-09-16、GitHubへの初回プッシュ前に実施):

- 接続情報(`SUPABASE_URL`/`ANON_KEY`)を`lp/js/config.js`・`booking/admin/js/config.js`の2ファイルに集約(以前は`reserve.js`/`manage.js`/`site-content.js`/`admin.js`の4ファイルにそれぞれハードコードされていた)
- 店舗固有ファイル(`lp/js/config.js`・`booking/admin/js/config.js`・`booking/supabase/seed.sql`・`lp/index.html`・`lp/reserve.html`・`lp/manage.html`・`booking/admin/index.html`・`booking/supabase/functions/_shared/reservationEmail.ts`)の先頭(またはハードコード箇所の直前)に`🏪 店舗固有`というコメントを付与し、`grep -rn "🏪"`で一覧できるようにした。**予約確認メールの件名(`reservationEmail.ts`)に店舗名が直接ハードコードされていたのは、初回の洗い出しで見落としていた箇所**(2026-09-16、ユーザーからの再確認指摘で発覚)。あわせて`_shared/email.ts`の`DEFAULT_FROM`(`RESEND_FROM_ADDRESS`未設定時のフォールバック送信元)も店舗名を含まない汎用表示名に変更した。**教訓: 「店舗固有情報の洗い出し」はフロントエンド(HTML)だけでなく、メール本文・件名のようにバックエンドが生成する顧客向け出力も対象に含めること**
- `lp/`・`booking/admin/`それぞれ、CSS/JSを`css/`・`js/`サブフォルダに整理した(2026-09-16、GitHubへの初回プッシュ前に実施。ファイル数が増えてきてルート直下が見通しにくくなっていたため)。favicon類・HTML・`package.json`等の設定ファイルはルート直下のまま
- 新しい店舗を作る際の実作業チェックリストを [TEMPLATE.md](./TEMPLATE.md) にまとめた(Supabaseプロジェクト作成からデプロイ・secrets設定・ホスティング・本番前確認まで、上から順にこなせば完了する形式)。**新規店舗を作る際はこのファイルを読むこと**

`booking/reference/`(HotPepper参考資料)はルートの`.gitignore`で除外済みなので、複製時に気にする必要はない。

## 今後の実装予定(バックログ)

(現時点で残っている項目なし。直近の完了分は「現在地・未決事項」の該当エントリを参照)

### 検討したが見送ったもの

- **予約UIの日付選択で休業日を選択不可にする(自前カレンダーグリッド化)**: ネイティブ`<input type="date">`では特定の日だけ選択不可にできないため、実現するには自前カレンダーUI+営業日一覧を返す新規公開APIが必要になる規模の変更。「選んだ後に休業日と表示する」現状のフィードバックで十分と判断し、見送り(2026-09-11)。再検討する場合はこの制約を踏まえること
- **マルチテナント化(他店舗への横展開)**: tol/freee予約のような「複数店舗が1システムを共有するSaaS」化を将来検討したいという話は出たが、現状のスキーマ・インフラは完全にシングルテナント前提(店舗を区別する`shop_id`等のカラムなし、Supabaseプロジェクトも1店舗1個)。ユーザーの明示的な判断で、まずCity Dogs(1店舗)の完成度を上げることを優先し、マルチテナント化は着手しない(2026-09-13)。**2026-09-16、GitHubへの初回プッシュを前に改めて話が出た際も、本格マルチテナント化(1DB共有+`tenant_id`+RLS分離)ではなく「店舗ごとにリポジトリを複製して個別デプロイするテンプレート方式」を採用する、とユーザーが明確に判断した**(詳細・複製手順は上の「他店舗への展開手順」を参照)。将来的に本格マルチテナント化を検討する場合の方向性メモ: 共有スキーマ+`tenant_id`+Postgres RLSでのテナント分離、独自ドメインは店舗ごとの実費(有料プランのオプション)にしてサブドメイン/共通ドメイン配下を無料枠の基本形にする、という設計が有力候補
