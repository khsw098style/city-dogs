-- ============================================================
-- 管理画面ログイン用: staff と Supabase Auth ユーザーの紐付け
-- ============================================================

alter table staff
  add column auth_user_id uuid unique references auth.users(id);

comment on column staff.auth_user_id is 'Supabase Authのユーザーid。管理画面ログイン時、このidからstaffを特定する(_shared/auth.tsのrequireStaff参照)。';
