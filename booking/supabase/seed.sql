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
-- 所要時間(duration_minutes)はHotPepper掲載ページに記載が無かったため、一般的なバーバー相場から
-- 仮置きした推定値。店舗オーナー確認後に要修正(メニュー部分のコメント参照)。
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
-- 新体系(2026-09-24〜): 区分(cut/color/perm/option)ごとの単品メニュー。予約時に複数選択でき、
-- 料金・所要時間は選択したメニューの単純合算(セット割引なし)。price_is_from=trueは「〜」付き(下限価格)。
-- 選択ルール: cut/color/permから各最大1つ+最低1つ必須、optionは追加専用(migrations/0012参照)。
-- 出典: booking/reference/BARBER_City_Dogs_メニュー価格一覧.xlsx(HotPepper掲載内容)。
-- duration_minutes は店舗の回答(2026-09-25)に基づく: カット系(子供含む)・カラー・パーマ・ツイストは各60分、
-- オプションは「10〜15分」の回答のため余裕を見て上限の15分。フェード メンテナンスカットも60分(追加回答2026-09-25)。
-- 本番の値は管理画面「メニュー・料金」で変更できる(seedは既存メニューを上書きしない)。
insert into menus (name, category, price, price_is_from, duration_minutes, description, is_active, sort_order)
select v.name, v.category, v.price, v.price_is_from, v.duration_minutes, v.description, true, v.sort_order
from (values
  ('カット', 'cut', 4000, false, 60, 'カット+シャンプー+ショートヘッドマッサージ+ヘアセット', 10),
  ('フェード メンテナンスカット', 'cut', 3000, false, 60, 'カットした日から14日以内', 20),
  ('高校生カット', 'cut', 2700, false, 60, null, 30),
  ('中学生以下カット', 'cut', 2200, true, 60, null, 40),
  ('カラー', 'color', 4500, true, 60, '白髪染め、おしゃれ染め、メッシュ。ブリーチの場合は要連絡。', 50),
  ('パーマ', 'perm', 5500, true, 60, null, 60),
  ('ツイスト', 'perm', 6000, true, 60, 'ツイストパーマ', 70),
  ('顔剃り', 'option', 800, false, 15, null, 110),
  ('眉毛整え', 'option', 500, false, 15, '眉毛をカットし、カミソリで整えます。', 120),
  ('ノーズWAX', 'option', 500, false, 15, '鼻毛を専用のワックスにて処理します。', 130)
) as v(name, category, price, price_is_from, duration_minutes, description, sort_order)
where not exists (select 1 from menus m where m.name = v.name);

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
-- ⚠️ 管理画面で編集(タイトル変更・差し替え・削除)された後の本番DBに再実行しても重複しないよう、
--    「タイトルや画像URLが一致する行が無ければ追加」ではなく「テーブル(区分)が空のときだけ追加」にしている。
--    (以前はURL/タイトル一致で判定しており、管理画面でStorage画像に差し替え済みの本番に流すと
--     静的パスの写真が別行として再追加され、SHOP & STYLEの写真が重複表示された: CHANGELOG.md参照)
insert into site_features (sort_order, title, description)
select v.sort_order, v.title, v.description
from (values
  (1, '再現性の高いフェード', '刈り上げのグラデーションにこだわり、伸びても綺麗な状態が続くカット技術。ビジネスシーンにも似合う爽やかな仕上がりに整えます。'),
  (2, '眉メンテナンス対応', 'オプションの眉毛整えを、カットなどのメニューにプラスできます。カットだけでは整わない、顔全体の印象までまとめて整えます。'),
  (3, 'シェービング対応', 'オプションの顔剃りを、カットなどのメニューにプラスできます。清潔感のある肌当たりで、身だしなみの仕上げまでお任せください。')
) as v(sort_order, title, description)
where not exists (select 1 from site_features);

-- ---- LP「SHOP & STYLE」の写真(現行LPのハードコード内容をそのまま初期値にする) ----
insert into site_gallery_photos (kind, image_url, caption, sort_order)
select v.kind, v.image_url, v.caption, v.sort_order
from (values
  ('interior', 'images/interior-chair.jpg', 'グリーンのウォールが目印の、落ち着いたセット面。', 1)
) as v(kind, image_url, caption, sort_order)
where not exists (select 1 from site_gallery_photos where kind = 'interior');

insert into site_gallery_photos (kind, image_url, caption, sort_order)
select v.kind, v.image_url, v.caption, v.sort_order
from (values
  ('style', 'images/style-fade-highlight.jpg', 'フェード × ハイライト', 1),
  ('style', 'images/style-perm-fade.jpg', 'フェード × パーマ', 2),
  ('style', 'images/style-slickback-beard.jpg', 'オールバック × ひげ', 3)
) as v(kind, image_url, caption, sort_order)
where not exists (select 1 from site_gallery_photos where kind = 'style');
