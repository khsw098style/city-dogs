-- ============================================================
-- City Dogs 予約管理システム — 動作確認用シードデータ
-- 🏪 店舗固有: 新しい店舗向けに複製する場合、このファイルの中身(メニュー・
-- スタッフ名・営業時間)を新店舗の実データに書き換えること。手順は
-- 最上位の TEMPLATE.md を参照。
-- ============================================================
-- `supabase db reset`(ローカル)では自動実行される。
-- リモート(本番/ステージング)へ入れる場合は `supabase db push --include-seed`
-- または `psql "$DB_URL" -f supabase/seed.sql` を明示的に実行すること。
--
-- 所要時間(duration_minutes)はHotPepper掲載ページに記載が無かったため、
-- 一般的なバーバー相場から仮置きした推定値。店舗オーナー確認後に要修正。
-- 料金は「カット+パーマ+眉毛整え」が ¥9,500〜10,000 の幅表示だったため、
-- スキーマ上は単一価格のみのため下限の9,500円を採用している。
-- ============================================================

-- ---- スタッフ ------------------------------------------------
-- 名前を自然キー代わりにした再実行安全なinsert(重複防止)。
-- 🏪 店舗固有: 実在のスタッフの実名を避け、汎用的な「スタイリスト」を仮の名前にしている
-- (2026-09-16、公開URLに実名が出ることを避けるためユーザー判断で変更)。
-- 新しい店舗向けに複製する場合はここに実際のスタッフ名を入れる。
insert into staff (name, role, is_active, display_order)
select 'スタイリスト', 'stylist', true, 1
where not exists (select 1 from staff where name = 'スタイリスト');

-- アシスタントは今のところ顧客が指名予約できる対象ではないため、
-- staff_shiftsは登録しない(= computeAvailabilityの対象から自然に外れる)。
insert into staff (role, is_active, display_order, name)
select 'assistant', true, 2, 'アシスタントスタッフ'
where not exists (select 1 from staff where name = 'アシスタントスタッフ');

-- ---- メニュー --------------------------------------------------
insert into menus (name, price, duration_minutes, is_active, sort_order)
select 'メンズカット + 眉毛整え', 4300, 40, true, 1
where not exists (select 1 from menus where name = 'メンズカット + 眉毛整え');

insert into menus (name, price, duration_minutes, is_active, sort_order)
select 'カット + シェービング', 4600, 50, true, 2
where not exists (select 1 from menus where name = 'カット + シェービング');

insert into menus (name, price, duration_minutes, is_active, sort_order)
select 'カット + メッシュカラー + 眉毛整え', 8500, 90, true, 3
where not exists (select 1 from menus where name = 'カット + メッシュカラー + 眉毛整え');

insert into menus (name, price, duration_minutes, is_active, sort_order)
select 'カット + パーマ + 眉毛整え', 9500, 100, true, 4
where not exists (select 1 from menus where name = 'カット + パーマ + 眉毛整え');

-- ---- 営業日(今日から60日分を自動生成) --------------------------
-- 定休日: 毎週月曜日、第4日曜日。営業時間: 平日10:00-18:00 / 土日9:00-18:00、最終受付は共通で閉店1時間前。
with days as (
  select
    d::date as date,
    extract(dow from d)::int as dow, -- 0=日曜 ... 6=土曜
    ((extract(day from d)::int - 1) / 7 + 1) as week_of_month
  from generate_series(current_date, current_date + interval '59 days', interval '1 day') as d
),
flagged as (
  select
    date,
    dow,
    (dow = 1) as is_monday,
    (dow = 0 and week_of_month = 4) as is_fourth_sunday
  from days
)
insert into business_days (date, is_open, open_time, close_time, last_reception_time, note)
select
  date,
  not (is_monday or is_fourth_sunday),
  case when not (is_monday or is_fourth_sunday)
       then (case when dow between 1 and 5 then time '10:00' else time '09:00' end)
  end,
  case when not (is_monday or is_fourth_sunday) then time '18:00' end,
  case when not (is_monday or is_fourth_sunday) then time '17:00' end,
  case
    when is_monday then '定休日(月曜)'
    when is_fourth_sunday then '定休日(第4日曜)'
  end
from flagged
on conflict (date) do nothing;

-- ---- スタッフシフト(スタイリストは営業日フルタイム稼働という仮定) --------------
insert into staff_shifts (staff_id, date, is_working, start_time, end_time)
select s.id, bd.date, true, bd.open_time, bd.close_time
from business_days bd
join staff s on s.name = 'スタイリスト'
where bd.is_open
  and not exists (
    select 1 from staff_shifts ss where ss.staff_id = s.id and ss.date = bd.date
  );

-- ---- スタッフのLP紹介文(現行LPのハードコード内容をそのまま初期値にする) --------
update staff set
  bio_role_label = 'スタイリスト / 理容歴4年',
  bio_comment = '「フェードでピシッと!!!!」<br>お客様一人ひとりの骨格や毛質に合わせたフェードスタイルをご提案します。'
where name = 'スタイリスト' and bio_comment is null;

update staff set
  bio_role_label = 'アシスタント',
  bio_comment = 'スタイリストとともに、シャンプーやシェービングなどをサポート。丁寧な接客を心がけています。'
where name = 'アシスタントスタッフ' and bio_comment is null;

-- ---- LP「CONCEPT」の特徴カード(現行LPのハードコード内容をそのまま初期値にする) ----
insert into site_features (sort_order, title, description)
select 1, '再現性の高いフェード', '刈り上げのグラデーションにこだわり、伸びても綺麗な状態が続くカット技術。ビジネスシーンにも似合う爽やかな仕上がりに整えます。'
where not exists (select 1 from site_features where title = '再現性の高いフェード');

insert into site_features (sort_order, title, description)
select 2, '眉メンテナンス付き', '全メニューに眉毛整えが付帯。カットだけでは整わない、顔全体の印象までまとめて整えます。'
where not exists (select 1 from site_features where title = '眉メンテナンス付き');

insert into site_features (sort_order, title, description)
select 3, 'シェービング対応', 'カット+シェービングのメニューもご用意。清潔感のある肌当たりで、身だしなみの仕上げまでお任せください。'
where not exists (select 1 from site_features where title = 'シェービング対応');

-- ---- LP「SHOP & STYLE」の写真(現行LPのハードコード内容をそのまま初期値にする) ----
insert into site_gallery_photos (kind, image_url, caption, sort_order)
select 'interior', 'images/interior-chair.jpg', 'グリーンのウォールが目印の、落ち着いたセット面。', 1
where not exists (select 1 from site_gallery_photos where image_url = 'images/interior-chair.jpg');

insert into site_gallery_photos (kind, image_url, caption, sort_order)
select 'style', 'images/style-fade-highlight.jpg', 'フェード × ハイライト', 1
where not exists (select 1 from site_gallery_photos where image_url = 'images/style-fade-highlight.jpg');

insert into site_gallery_photos (kind, image_url, caption, sort_order)
select 'style', 'images/style-perm-fade.jpg', 'フェード × パーマ', 2
where not exists (select 1 from site_gallery_photos where image_url = 'images/style-perm-fade.jpg');

insert into site_gallery_photos (kind, image_url, caption, sort_order)
select 'style', 'images/style-slickback-beard.jpg', 'オールバック × ひげ', 3
where not exists (select 1 from site_gallery_photos where image_url = 'images/style-slickback-beard.jpg');
