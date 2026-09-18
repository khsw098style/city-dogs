-- 0010の書き込みポリシーは実機で「new row violates row-level security policy」となり
-- 稼働中スタッフでも常にアップロードが拒否される不具合があった(2026-09-18発見)。
-- 原因: ポリシー内のEXISTSサブクエリ(public.staffを参照)自体も、それを評価している
-- 現在のロール(authenticated)のRLSの対象になる。public.staffは0006でRLSを有効化した
-- 際にauthenticatedロール向けのポリシーを一切作らなかった(Edge Functionsがservice_role
-- 経由でのみアクセスする設計のため)ため、このサブクエリは常に0行を返し、is_active判定が
-- 常にfalseになっていた。
--
-- 対策: staffテーブルにSELECTポリシーを追加する(PostgREST経由で他のスタッフの情報が
-- 見られるようになってしまう)代わりに、SECURITY DEFINER関数でRLSをバイパスして
-- is_active判定だけを行う。関数の所有者はテーブル所有者(RLS適用対象外)になるため、
-- 呼び出し元のロールに関わらずstaffテーブルを読み取れる。
create or replace function public.is_active_staff(p_auth_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.staff
    where auth_user_id = p_auth_user_id and is_active
  );
$$;

revoke all on function public.is_active_staff(uuid) from public;
grant execute on function public.is_active_staff(uuid) to authenticated;

drop policy if exists "site-images staff insert" on storage.objects;
drop policy if exists "site-images staff update" on storage.objects;
drop policy if exists "site-images staff delete" on storage.objects;

create policy "site-images staff insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'site-images' and public.is_active_staff(auth.uid()));

create policy "site-images staff update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'site-images' and public.is_active_staff(auth.uid()));

create policy "site-images staff delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'site-images' and public.is_active_staff(auth.uid()));
