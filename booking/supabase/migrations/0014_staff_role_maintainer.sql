-- 保守用アカウント(納品後の不具合・データ調査用)向けのロールを追加する(2026-09-28)。
--
-- - 'maintainer' は店舗スタッフではない。指名リスト・空き枠・スケジュール列・シフト設定・
--   LP紹介・LPコンテンツ編集のスタッフ一覧・売上集計のいずれにも出さない(アプリ側で除外)。
-- - 管理APIは閲覧(GET)のみ許可し、書き込み(POST/PUT/PATCH/DELETE)はサーバー側で拒否する
--   (_shared/auth.ts の requireStaff で一括して強制)。
-- - ログインには staff.is_active = true が必要なため、保守用staffレコードも稼働中にしておく。
alter type staff_role add value if not exists 'maintainer';
