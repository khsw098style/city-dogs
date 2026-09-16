# 新規店舗への展開チェックリスト

このリポジトリ(city-dogs)を新しい店舗向けに複製して使う場合の手順。上から順に実施すれば、抜け漏れなく1店舗分のセットアップが完了するようにまとめてある。

背景・設計判断(なぜテンプレート方式にしたか、本格マルチテナントSaaSにはしなかったか)は [CLAUDE.md](./CLAUDE.md) の「他店舗への展開手順」節を参照。このファイルは実作業用のチェックリストに特化する。

店舗固有のファイルには `🏪 店舗固有` というコメントを付けてある。まずそれらを`grep -rn "🏪"`で検索して一覧を洗い出すのもおすすめ。

## 0. 前提

- [ ] このリポジトリを新しいGitHubリポジトリとして複製する(1店舗1リポジトリの方針。詳細はCLAUDE.md参照)
- [ ] `booking/`・`booking/admin/`・`lp/`それぞれで `npm install`(初回のみ、E2Eテストを実行する場合は各`npx playwright install chromium`も)

## 1. Supabaseプロジェクトの作成

- [ ] https://supabase.com/dashboard で新規プロジェクトを作成(**Region: Northeast Asia (Tokyo)** を必ず選ぶ)
- [ ] `booking/`で `npx supabase login` → `npm run link -- --project-ref <新Project Ref>`
- [ ] `npm run db:push` で migrations(`0001`〜`0008`、全テーブル・RLS・制約含む。店舗非依存の汎用スキーマなのでそのまま使える)を適用
- [ ] `npx supabase projects api-keys --project-ref <新Project Ref>` で新プロジェクトの `publishable` キー(`sb_publishable_...`)を控える

## 2. 店舗固有ファイルの書き換え(`🏪 店舗固有` コメント参照)

- [ ] `lp/js/config.js` の `SUPABASE_URL` / `ANON_KEY` を新プロジェクトの値に書き換え
- [ ] `booking/admin/js/config.js` の `SUPABASE_URL` / `ANON_KEY` を新プロジェクトの値に書き換え
- [ ] `booking/supabase/seed.sql` を新店舗のメニュー・スタッフ名・営業時間(定休日パターン含む)に書き換える
- [ ] 書き換えた seed.sql を投入: `npx supabase db push --include-seed`(反映されない場合は `npx supabase db query --linked -f supabase/seed.sql` で直接実行。過去に前者だけでは反映されないことがあった)
- [ ] `lp/index.html`・`lp/reserve.html`・`lp/manage.html` の `<title>`・meta description・店舗名・電話番号・Instagramリンク・地図の座標(Googleマップ埋め込みURL)・footerを新店舗の情報に書き換え(3ファイルとも同じ店舗名がそれぞれ埋め込まれている)
- [ ] `booking/admin/index.html` の `<title>`・ログイン画面/ヘッダーの店舗名を書き換え
- [ ] `lp/images/` の写真・ロゴ(`shop_logo.png`)・favicon一式(`favicon-16.png`/`favicon-32.png`/`apple-touch-icon.png`)を新店舗のものに差し替え、同じファイルを `booking/admin/` 側にもコピー
- [ ] 掲載する写真について、店舗オーナーから使用許諾を得ているか確認
- [ ] **`booking/supabase/functions/_shared/reservationEmail.ts`** の予約確認メール件名(`【City Dogs】ご予約確認`)を新店舗名に書き換える(**顧客に実際に届くメールの文面に直接影響するため見落とし厳禁**)
- [ ] (確認のみ)`booking/supabase/functions/_shared/email.ts` の `DEFAULT_FROM` は店舗名を含まない汎用フォールバックにしてあるため書き換え不要。ただし下記5.で`RESEND_FROM_ADDRESS`を必ず設定すること(未設定のままだとこのフォールバックのまま送信される)

## 3. Edge Functionsのデプロイ

- [ ] `booking/`で `npm run functions:deploy`(全12 Functionsを一括デプロイ。個別デプロイする場合は `npx supabase functions deploy <name> --use-api`)
- [ ] デプロイ後、`npx supabase functions list` でそれぞれの `version`/`updated_at` が今回のデプロイ時刻に更新されているか確認する(**まれにCLIが成功表示でも実際には反映されないことがある**。数分待っても`updated_at`が変わらない場合は `functions delete <name>` → `deploy` し直すと解消する。詳細はCLAUDE.md参照)

## 4. スタッフ・管理画面ログイン

- [ ] Supabaseダッシュボード(Authentication > Users > Add user)でオーナー/スタッフのログインアカウントを作成(「Auto Confirm User」を有効にする)
- [ ] 管理画面(`booking/admin/`)の「LPコンテンツ」タブ、またはSQL Editorから新店舗のスタッフ行を作成
- [ ] 作成したAuthアカウントの`auth_user_id`を該当staff行に紐付け: `update staff set auth_user_id = '<auth_user_id>' where name = '<スタッフ名>';`

## 5. Secrets(`npx supabase secrets set ...`)

- [ ] `ALLOWED_ORIGINS="https://<新店舗の本番ドメイン>"`(未設定だと全オリジン許可`*`のままなので公開前に必須)
- [ ] `RESEND_API_KEY="<Resendダッシュボードで発行したAPIキー>"`
- [ ] `MANAGE_PAGE_BASE_URL="https://<新店舗の本番ドメイン>/manage.html"`
- [ ] `RESEND_FROM_ADDRESS="<新店舗名> <no-reply@新店舗ドメイン>"`(独自ドメインをResend側で検証済みであること)
- [ ] (任意)Google口コミ連携を使う場合: `GOOGLE_PLACES_API_KEY` / `GOOGLE_PLACE_ID`(Google Cloud側でのプロジェクト作成・請求先登録・APIキー発行・Place ID特定が別途必要)

## 6. ホスティング・ドメイン

- [ ] `lp/`用のホスティング(Cloudflare Pages等)プロジェクトを作成しデプロイ
- [ ] `booking/admin/`用のホスティングプロジェクトを作成しデプロイ(`lp/`と同一ホストにまとめるか分けるかは要検討)
- [ ] 独自ドメインを取得し、上記ホスティングにアタッチ
- [ ] `manage.html?token=...` のようなクエリ文字列付きURLが、そのホスティング先の「クリーンURL」的な機能でリダイレクト時に欠落しないか実機で確認する(過去に`serve`パッケージのclean URLsで実際に踏んだ不具合。ホスティング先ごとに挙動が異なりうる)

## 7. 本番公開前の最終確認

- [ ] 実際にWeb予約フローを一通り試す(予約作成→確認メール受信→`manage.html`での照会・キャンセル)
- [ ] 管理画面にログインし、電話予約の代理登録・ステータス変更・リスケジュール・営業日/シフト設定・顧客管理が一通り動くか確認
- [ ] 営業時間・メニュー・料金など、seed.sqlに入れた仮データが実際の店舗情報と一致しているか最終確認
- [ ] 電話番号・LINEリンクがプレースホルダーのままになっていないか確認
- [ ] Supabaseダッシュボードのアカウントに2段階認証(2FA)が設定されているか確認
- [ ] (任意)`lp/tests/`・`booking/admin/tests/`配下のE2Eテストの`SUPABASE_URL`/`ANON_KEY`・テスト対象スタッフ名などの定数を新環境向けに更新し、`npm run test:e2e`を実行して一通りグリーンになることを確認

---

**このチェックリストの更新について**: City Dogs本体に新しい設定項目(secrets・Edge Function・手動セットアップ手順)が増えたときは、このファイルも合わせて更新すること。特にCloudflare Turnstile(ボット対策)は2026-09-16時点でまだ未実装のため、実装され次第このチェックリストにも追加する必要がある。
