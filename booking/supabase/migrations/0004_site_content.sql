-- ============================================================
-- City Dogs 予約管理システム — LPコンテンツ管理用スキーマ追加
-- 参照: ../../design/data-model.md の「site_features」「site_gallery_photos」
--       「staff(スタッフ)」の追加カラムに関する記述
-- ============================================================

-- ============================================================
-- staff: LP「STAFF」セクション表示用のカラムを追加
-- role(権限区分)とbio_role_label(表示用の肩書き)を混同しないよう別カラムにしている
-- ============================================================
alter table staff add column name_en          text;
alter table staff add column bio_role_label   text;
alter table staff add column bio_comment      text;
alter table staff add column avatar_image_url text; -- null時はLP側で既存のプレースホルダーアイコンを表示

-- ============================================================
-- site_features: LP「CONCEPT」セクションの特徴カード(01〜03)
-- ============================================================
create table site_features (
  id           uuid primary key default gen_random_uuid(),
  sort_order   integer not null default 0,
  title        text not null,
  description  text not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_site_features_sort on site_features (sort_order) where is_active;

-- ============================================================
-- site_gallery_photos: LP「SHOP & STYLE」セクションの写真
-- image_urlは当面プレーンなtext(既存の静的ファイルへの相対パス)。
-- Supabase Storage連携によるアップロード機能は意図的に未実装(data-model.md「8.」参照)。
-- ============================================================
create type gallery_photo_kind as enum ('interior', 'style');

create table site_gallery_photos (
  id           uuid primary key default gen_random_uuid(),
  kind         gallery_photo_kind not null,
  image_url    text not null,
  caption      text,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_site_gallery_photos_kind_sort on site_gallery_photos (kind, sort_order) where is_active;
