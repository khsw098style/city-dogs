-- ============================================================
-- City Dogs 予約管理システム — データベーススキーマ (MVP)
-- 対象: PostgreSQL 14+ (Supabase想定)
-- 参照: ../../design/data-model.md に設計意図をまとめている
-- ============================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists btree_gist; -- 予約の時間帯重複チェック(EXCLUDE制約)に必要

-- ============================================================
-- 顧客
-- ============================================================
create table customers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  name_kana       text,
  phone           text not null unique,
  email           text,
  line_user_id    text unique,        -- LINE公式アカウント連携用(リマインド送信)
  notes           text,               -- 店舗側メモ(アレルギー・要望など)
  no_show_count   integer not null default 0,
  is_blocked      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column customers.no_show_count is '無断キャンセル回数。予約確定時の注意喚起や受付制限の判断材料。';

-- ============================================================
-- スタッフ
-- ============================================================
create type staff_role as enum ('owner', 'stylist', 'assistant');

create table staff (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  role            staff_role not null default 'stylist',
  is_active       boolean not null default true,
  display_order   integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================
-- メニュー
-- ============================================================
create table menus (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  price             integer not null,          -- 税込・円
  duration_minutes  integer not null,
  description       text,
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ============================================================
-- 営業日設定
-- SALON BOARDの「毎月の受付設定」に相当。月初にまとめて設定し、
-- 個別の祝日・臨時休業もこのテーブルの1行で表現する。
-- ============================================================
create table business_days (
  date                  date primary key,
  is_open               boolean not null default true,
  open_time             time,
  close_time            time,
  last_reception_time   time,
  note                  text,               -- 「第4日曜定休」「臨時休業」など

  check (
    (is_open = false) or (open_time is not null and close_time is not null)
  )
);

-- ============================================================
-- スタッフの日別シフト
-- ============================================================
create table staff_shifts (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references staff(id) on delete cascade,
  date          date not null,
  is_working    boolean not null default true,
  start_time    time,
  end_time      time,
  note          text,               -- 半休・外出など

  unique (staff_id, date)
);

-- ============================================================
-- 予約ステータス・経路
-- ============================================================
create type reservation_status as enum (
  'tentative',             -- 仮予約(確定待ち)
  'confirmed',             -- 確定
  'in_service',            -- 施術中
  'awaiting_checkout',     -- 来店処理待ち・会計待ち
  'completed',             -- 会計済み
  'declined',              -- お断り
  'cancelled_by_customer', -- お客様キャンセル
  'cancelled_by_salon',    -- サロンキャンセル
  'no_show',               -- 無断キャンセル
  'auto_cancelled'         -- 自動キャンセル(受付期限切れ等)
);

create type reservation_source as enum (
  'phone', 'web', 'hotpepper', 'walk_in'
);

-- ============================================================
-- 予約
-- ============================================================

-- 予約番号はAPI層で組み立てず、DBのシーケンスで採番する(採番の競合をDBに任せる)
create sequence reservation_number_seq;

create table reservations (
  id                  uuid primary key default gen_random_uuid(),
  reservation_number  text not null unique
    default ('B' || lpad(nextval('reservation_number_seq')::text, 9, '0')), -- 例: B000000123
  customer_id         uuid not null references customers(id),
  staff_id            uuid references staff(id),  -- nullは「フリー(指名なし)」
  menu_id             uuid not null references menus(id),

  time_range          tstzrange not null,        -- 開始〜終了。半開区間 '[)' で保存する
  status              reservation_status not null default 'tentative',
  source              reservation_source not null default 'phone',

  price_at_booking    integer not null,          -- 予約時点のメニュー価格のスナップショット
  notes               text,
  cancel_reason       text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- 同一スタッフの時間帯重複を防ぐ。「埋まっている」とみなすステータスのみ対象。
  exclude using gist (
    staff_id with =,
    time_range with &&
  ) where (
    staff_id is not null
    and status in ('tentative', 'confirmed', 'in_service', 'awaiting_checkout')
  )
);

create index idx_reservations_customer on reservations (customer_id);
create index idx_reservations_staff_time on reservations using gist (staff_id, time_range);
create index idx_reservations_status on reservations (status);
create index idx_reservations_source on reservations (source);

-- ============================================================
-- Phase 2(必要になったら追加): ステータス変更履歴
-- ============================================================
-- create table reservation_status_logs (
--   id              uuid primary key default gen_random_uuid(),
--   reservation_id  uuid not null references reservations(id) on delete cascade,
--   from_status     reservation_status,
--   to_status       reservation_status not null,
--   changed_by      uuid references staff(id),
--   changed_at      timestamptz not null default now(),
--   note            text
-- );

-- ============================================================
-- Phase 2(必要になったら追加): リマインド送信ログ
-- ============================================================
-- create type reminder_channel as enum ('line', 'sms', 'email');
--
-- create table reminder_logs (
--   id              uuid primary key default gen_random_uuid(),
--   reservation_id  uuid not null references reservations(id) on delete cascade,
--   channel         reminder_channel not null,
--   sent_at         timestamptz not null default now(),
--   status          text not null default 'sent'
-- );
