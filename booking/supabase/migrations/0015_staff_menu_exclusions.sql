-- スタッフ×メニューの対応可否(2026-09-30)。
--
-- 「大城さんはパーマ不可」のような、特定スタッフが特定メニューに対応できないケースに対応する。
-- 除外リスト方式を採用: 行が無ければ「そのスタッフは全メニューに対応可能」というのが既定の挙動。
-- 明示的な対応リスト方式(対応できるメニューを1件ずつ登録する)にしなかった理由は、小規模店舗
-- (スタイリスト2〜3名程度)では「基本は誰でも対応できる」が前提で、例外のほうが少ないため。
-- 対応リスト方式だと、新しいメニューを追加するたびに全スタッフへの紐付け作業が要る。
-- この方式なら、既存スタッフ・既存メニューへの影響は一切なし(除外行が無いので今と同じ挙動)。
create table staff_menu_exclusions (
  staff_id  uuid not null references staff(id) on delete cascade,
  menu_id   uuid not null references menus(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_id, menu_id)
);

create index staff_menu_exclusions_menu_id_idx on staff_menu_exclusions (menu_id);

-- 0006と同じ方針: 全テーブルRLS有効化・ポリシーなし(service_role経由のEdge Functionsのみアクセス可)。
alter table staff_menu_exclusions enable row level security;
