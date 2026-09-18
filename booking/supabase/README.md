# Supabaseセットアップ・デプロイ手順

このフォルダは Supabase CLI がそのまま読み込む構成になっている(`supabase/migrations/`, `supabase/functions/`)。

## 現在の状態(2026-09-11 時点で検証済み)

実際のSupabaseプロジェクトに対して、この手順を上から通しで実行し、**公開API(menus / availability / reservations)がエンドツーエンドで正常動作することを確認済み**。

- Organization: `khsw098style's Org`(Free) / Project: `city-dog-booking`(ref: `cwojmmrnhvemupxubtus`) / Region: Tokyo
- Deno 2.9.6、Supabase CLI 2.117.0(`booking/package.json`のdevDependency。Windowsはグローバルインストール廃止のためこの形にしている)
- Docker Desktopは**未導入のまま**。`supabase start` / `functions serve` は使わず、`db push` + `functions deploy --use-api`(Docker不要のAPI経由デプロイ)で実プロジェクトに対して検証する方針で通した
- `npm run check` / `npm run lint` はグリーン

### 動作確認で見つかった問題と対応

1. **`_shared/supabase.ts`等でnpm:指定子をdeno.jsonのimport mapに切り出していたが、`functions deploy --use-api`のアセットアップローダーが`deno.json`をアップロード対象に含めず、デプロイが400エラーで失敗した。** → インラインの`npm:@supabase/supabase-js@2`指定子に戻し、`deno.json`側で`no-import-prefix`lintルールを除外する形に変更(このリポジトリでは意図的にimport mapを使わない)。
2. **`POST /reservations/:id/cancel`が内部UUID(id)を要求する設計だったが、顧客側にはreservation_number(例: B000000001)しか一度も返していないため、実質キャンセル不能だった。** → `POST /reservations/:reservation_number/cancel`に変更。api-design.mdも合わせて修正済み。
3. **`reservations/cancel.ts`で`customers!inner(phone)`のような埋め込みクエリの結果に直接プロパティアクセスすると、生成済みDB型が無い環境ではsupabase-jsが配列型と誤推論し型チェックが通らない。** → 埋め込みをやめ、2段階のクエリ(reservation取得→customer取得)に分割。

いずれも「型チェック・Lintだけでは検出できず、実際にデプロイ・curlで叩いて初めて見つかった」問題。ローカル検証だけで済ませず実機テストまでやる価値があった。

## 0. 前提ツール

```bash
# booking/ ディレクトリで実行
npm install --save-dev supabase
npm install -g deno
```

```bash
npx supabase --version
deno --version
```

## 1. Supabaseプロジェクトの作成(ユーザー操作が必要)

1. https://supabase.com/dashboard でアカウント作成・ログイン
2. Organizationを作成(特定の案件名にせず、今後の他案件とも共用できる汎用的な名前を推奨。例: 自分のハンドルネーム)
3. Organization配下に「New Project」から無料プランでプロジェクトを1つ作成。**リージョンは必ず Northeast Asia (Tokyo) を選ぶ**(デフォルトは別リージョンになっていることがあるので要確認)
4. プロジェクト作成後、そのプロジェクトのURL(`https://<project-ref>.supabase.co`)のサブドメイン部分が **Project Ref**

## 2. ログイン・リンク

```bash
cd booking
npx supabase login
```

`login`はブラウザでの認証が必要。実行すると「Press Enter to open browser and login automatically.」と表示されるので、そのターミナル上でEnterキーを押す(文字入力ではない)。ブラウザで承認すると「You are now logged in.」と表示される。

```bash
npm run link -- --project-ref <Project Ref>
```

## 3. マイグレーションの適用

```bash
npm run db:push
```

`supabase/migrations/0001_init.sql`(テーブル・EXCLUDE制約・予約番号の自動採番など)がリモートDBに反映される。

## 4. テストデータの投入

```bash
npx supabase db push --include-seed
```

投入されるデータ: メニュー4件、スタッフ(當眞優希)、今日から60日分の営業日・シフト(毎週月曜・第4日曜定休、平日10-18時/土日9-18時、最終受付は閉店1時間前)。
**所要時間・営業時間などは仮のロジック/推定値。実データと突き合わせて要修正。**

## 5. 環境変数(Secrets)の設定

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` は自動注入されるため手動設定は不要。LP側のオリジンからのアクセスを許可するため以下だけ設定する:

```bash
npx supabase secrets set ALLOWED_ORIGINS="https://<LPの本番ドメイン>,http://localhost:3000"
```

未設定だと開発優先で `*`(全オリジン許可)になる。**本番公開前に必ず設定すること**(LPドメインが未確定のため現時点では未設定のまま)。

予約確認・変更・キャンセルメール(Resend経由)を実際に送るには、以下も設定する:

```bash
npx supabase secrets set RESEND_API_KEY="<Resendダッシュボードで発行したAPIキー>"
npx supabase secrets set MANAGE_PAGE_BASE_URL="https://<LPの本番ドメイン>/manage.html"
```

どちらも**現時点で未設定**。`RESEND_API_KEY`が無い間はメール送信をスキップするだけで予約自体は失敗しない(fail-soft)。`MANAGE_PAGE_BASE_URL`が無い間は、メール本文のリンクが機能しないプレースホルダーURLになる(実際に送信テストする前に設定すること)。独自ドメインを検証したら `RESEND_FROM_ADDRESS`(例: `City Dogs <no-reply@your-domain.jp>`)も設定して、Resendのテスト用共有ドメイン(`onboarding@resend.dev`)から切り替える。

## 6. デプロイ(Docker不要 / APIベース)

```bash
npm run functions:deploy
# 中身: supabase functions deploy --use-api
```

個別デプロイ:

```bash
npx supabase functions deploy menus --use-api
npx supabase functions deploy availability --use-api
npx supabase functions deploy reservations --use-api
npx supabase functions deploy admin-reservations --use-api
```

`_shared/` 配下を変更した場合は、それを import している全Functionを再デプロイすること(例: `availability.ts`を変更したら `availability` と `reservations` の両方)。

## 7. 動作確認

`<anon key>`は `npx supabase projects api-keys --project-ref <ref>` の `publishable` キー(`sb_publishable_...`)を使う。

```bash
# メニュー一覧
curl "https://<project-ref>.supabase.co/functions/v1/menus" \
  -H "Authorization: Bearer <anon key>"

# 空き枠照会
curl "https://<project-ref>.supabase.co/functions/v1/availability?date=2026-09-20&menu_id=<menu_id>" \
  -H "Authorization: Bearer <anon key>"

# 予約作成
curl -X POST "https://<project-ref>.supabase.co/functions/v1/reservations" \
  -H "Authorization: Bearer <anon key>" \
  -H "Content-Type: application/json" \
  -d '{
    "customer": { "name": "テスト太郎", "phone": "090-1234-5678" },
    "menu_id": "<menu_id>",
    "start_at": "2026-09-20T10:00:00+09:00"
  }'

# 同じ枠にもう一度POSTすると 409 SLOT_UNAVAILABLE になる(二重予約防止)

# 管理API(要ログイン)。<staff access token>はSupabase Auth経由でログインして取得する
# (booking/admin/index.htmlからログインするか、supabase.auth.signInWithPassword()を使う)
curl "https://<project-ref>.supabase.co/functions/v1/admin-reservations/schedule?date=2026-09-20" \
  -H "Authorization: Bearer <staff access token>"

# 予約の確認・キャンセル(顧客向け、manage_token方式)。tokenは予約確認メールに記載
curl "https://<project-ref>.supabase.co/functions/v1/reservations/manage?token=<manage_token>" \
  -H "Authorization: Bearer <anon key>"
```

## 8. 管理画面ログイン用アカウントの作成

管理API・管理画面(`booking/admin/`)を使うには、Supabase Authにスタッフのログイン用アカウントを作り、`staff.auth_user_id` に紐付ける必要がある。

```bash
# ダッシュボード(Authentication > Users > Add user)から作成するのが簡単。
# メール確認は「Auto Confirm User」を有効にして作成する(確認メール不要にする)。
```

作成後、SQL Editorで紐付ける(`<auth_user_id>`は作成したユーザーのUUID、Authentication > Usersの一覧からコピーできる):

```sql
update staff set auth_user_id = '<auth_user_id>' where name = '當眞 優希';
```

## 実装済み/未実装

- 実装済み・実機検証済み: `menus`、`staff`、`availability`、`reservations`(作成・`manage_token`による照会/キャンセル)。公開API(認証なし)
- 実装済み・実機検証済み: `admin-reservations`(スケジュール表示・検索)。管理API(要ログイン)。ステータス変更・電話予約代理登録・シフト設定等は未実装([../design/api-design.md](../design/api-design.md)の実装状況列を参照)
- 実装済み・コードレベルでは完了、**実送信は未検証**: 予約確認メール(Resend経由、`_shared/email.ts`)。`RESEND_API_KEY`のsecret未設定のため
- 未実装: 公開APIの不正利用対策(Cloudflare Turnstile連携、レート制限)。本番公開前に必須
- 未設定: `ALLOWED_ORIGINS`・`RESEND_API_KEY`・`MANAGE_PAGE_BASE_URL`(いずれもLPドメイン/Resend登録確定後に設定)
- 未作成: 実際のオーナー用ログインアカウント(上記手順はテンプレート。誰のメールアドレスを使うか要確認)

## 型安全性について

現状 `createClient()` はDBスキーマ型を渡していないため、クエリ結果は事実上 `any` になっている。テーブル数が増えてきたら

```bash
npx supabase gen types typescript --project-id <ref> > supabase/functions/_shared/database.types.ts
```

で型を生成し、`createClient<Database>(...)` に差し替えることを推奨する。
