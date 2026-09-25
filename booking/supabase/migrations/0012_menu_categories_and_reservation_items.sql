-- メニューの区分(カット/カラー/パーマ/オプション)と、1予約に複数メニュー(カット+パーマ+顔剃り等)を
-- 選べるようにするための変更(2026-09-24)。
--
-- 選択ルール(_shared/menuSelection.tsが最終防御):
--   ・cut / color / perm の区分からそれぞれ最大1つ、かつこの3区分のうち最低1つは必須
--   ・option(顔剃り・眉毛整え・ノーズWAX等)は単独では予約できず、上記に追加する形で何個でも可
-- 料金・所要時間は選択したメニューの単純合算(セット割引なし)。

alter table menus
  add column category text not null default 'cut'
    check (category in ('cut', 'color', 'perm', 'option')),
  add column price_is_from boolean not null default false;   -- true=「〜」付き(下限価格。確定は来店時)

comment on column menus.category is 'cut/color/perm=単独で予約可能な主メニュー、option=主メニューへの追加専用';
comment on column menus.price_is_from is '価格が「〜」表記(下限価格)であること。合計に1つでも含まれれば合計も「〜」表示にする';

-- 予約に含まれるメニュー(主メニュー+オプション)。price/durationは予約時点のスナップショット。
-- reservations.menu_id は「主メニュー(cut > color > perm の順で最初の1つ)」として引き続き保持し、
-- reservations.price_at_booking は合計金額、time_range は合計所要時間を表す。
create table reservation_items (
  id                uuid primary key default gen_random_uuid(),
  reservation_id    uuid not null references reservations(id) on delete cascade,
  menu_id           uuid not null references menus(id),
  price_at_booking  integer not null,
  duration_minutes  integer not null,
  price_is_from     boolean not null default false,
  sort_order        integer not null default 0,
  unique (reservation_id, menu_id)
);

create index reservation_items_reservation_id_idx on reservation_items (reservation_id);

-- 0006と同じ方針: 全テーブルRLS有効化・ポリシーなし(service_role経由のEdge Functionsのみアクセス可)
alter table reservation_items enable row level security;

-- 既存の予約(移行前はすべて単一メニュー)を新形式に移行する。
-- 所要時間は、メニュー側の値ではなく予約時点のtime_rangeの長さを使う(メニュー編集の影響を受けないため)。
insert into reservation_items (reservation_id, menu_id, price_at_booking, duration_minutes, price_is_from, sort_order)
select r.id, r.menu_id, r.price_at_booking,
       (extract(epoch from (upper(r.time_range) - lower(r.time_range))) / 60)::integer,
       false, 0
from reservations r
on conflict (reservation_id, menu_id) do nothing;

-- 旧体系の固定セットメニュー(「メンズカット + 眉毛整え」等)を非公開にする。予約履歴から
-- 参照されているため削除はせず、新しいメニュー体系(seed.sql)へ置き換える。新規DBでは対象行なしで何もしない。
update menus set is_active = false
where name in (
  'メンズカット + 眉毛整え',
  'カット + シェービング',
  'カット + メッシュカラー + 眉毛整え',
  'カット + パーマ + 眉毛整え'
);
