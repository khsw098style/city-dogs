-- LPコンテンツ(ギャラリー写真・スタッフアバター)の画像アップロード用Storageバケット。
-- 0004_site_content.sqlの時点では「パスを手入力する」運用を意図的な設計としていたが、
-- 実際には画像の実配置(git commit+再デプロイ)を開発者に依頼する必要があり、他のLP
-- コンテンツ編集(特徴カード・メニュー・スタッフ紹介文)と違ってオーナー自身で完結
-- できていなかった。ユーザー判断により2026-09-18に実装。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-images',
  'site-images',
  true, -- LPが認証なしで画像を表示するため公開バケットにする
  5242880, -- 5MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- 読み取りは公開(LP・管理画面どちらも認証なしで表示できる必要がある)。
create policy "site-images public read"
  on storage.objects for select
  using (bucket_id = 'site-images');

-- 書き込み(追加・更新・削除)は稼働中スタッフのみ。requireStaff()(_shared/auth.ts)と
-- 同じ判定(staff.is_active)をStorage側のRLSでも行うことで、退職・無効化されたスタッフの
-- Supabase Authセッションが有効なままでもアップロードできてしまう抜け道を防ぐ
-- (Storageのポリシーは`to authenticated`だけではJWTの有効性しか見ず、アプリ側の
-- is_active判定を引き継がないため)。
create policy "site-images staff insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'site-images'
    and exists (select 1 from public.staff where staff.auth_user_id = auth.uid() and staff.is_active)
  );

create policy "site-images staff update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'site-images'
    and exists (select 1 from public.staff where staff.auth_user_id = auth.uid() and staff.is_active)
  );

create policy "site-images staff delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'site-images'
    and exists (select 1 from public.staff where staff.auth_user_id = auth.uid() and staff.is_active)
  );
