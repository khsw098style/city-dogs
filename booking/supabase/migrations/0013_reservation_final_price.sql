-- 予約に「実際の会計金額」を追加する(2026-09-25)。
--
-- 「〜」付きメニュー(menus.price_is_from = true。カラー・パーマ・ツイスト等)は、予約時点では
-- 下限価格(reservations.price_at_booking)しか分からず、確定金額は会計時に決まる。値引き・クーポンで
-- 変わることもある。このため、会計完了時に管理画面から入力した実際の金額をここに保存する。
--
-- - NULL = 未入力。売上の集計は price_at_booking にフォールバックする(既存の予約は全てNULLのまま=挙動不変)。
-- - 値の設定は status = 'completed' の予約のみ(アプリ側 _shared/checkout.ts で強制)。
-- - 「〜」付きメニューを含む予約を completed にする時は入力必須(同上)。
alter table reservations
  add column final_price integer check (final_price >= 0);

comment on column reservations.final_price is
  '実際の会計金額(円)。completedの予約のみ設定。NULLならprice_at_bookingを実績として扱う。';
