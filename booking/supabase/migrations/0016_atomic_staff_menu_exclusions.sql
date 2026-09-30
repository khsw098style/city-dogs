-- スタッフ情報と対応不可メニューを1トランザクションで更新する。
-- service_roleからのEdge Function経由に限定する。
create or replace function public.update_staff_with_exclusions(
  p_staff_id uuid,
  p_patch jsonb,
  p_menu_ids uuid[] default null
)
returns public.staff
language plpgsql
security invoker
set search_path = public
as $$
declare
  result public.staff;
begin
  -- 同一スタッフへの並行更新を直列化する。行がなければ呼び出し側で404にする。
  perform 1 from public.staff where id = p_staff_id for update;
  if not found then return null; end if;

  if p_menu_ids is not null and cardinality(p_menu_ids) <> (
    select count(distinct menu_id) from unnest(p_menu_ids) as ids(menu_id)
  ) then
    raise exception 'duplicate menu id' using errcode = '22023';
  end if;

  update public.staff set
    name = case when p_patch ? 'name' then p_patch->>'name' else name end,
    role = case when p_patch ? 'role' then (p_patch->>'role')::public.staff_role else role end,
    is_active = case when p_patch ? 'is_active' then (p_patch->>'is_active')::boolean else is_active end,
    display_order = case when p_patch ? 'display_order' then (p_patch->>'display_order')::integer else display_order end,
    name_en = case when p_patch ? 'name_en' then p_patch->>'name_en' else name_en end,
    bio_role_label = case when p_patch ? 'bio_role_label' then p_patch->>'bio_role_label' else bio_role_label end,
    bio_comment = case when p_patch ? 'bio_comment' then p_patch->>'bio_comment' else bio_comment end,
    avatar_image_url = case when p_patch ? 'avatar_image_url' then p_patch->>'avatar_image_url' else avatar_image_url end,
    updated_at = now()
  where id = p_staff_id
  returning * into result;

  if p_menu_ids is not null then
    delete from public.staff_menu_exclusions where staff_id = p_staff_id;
    insert into public.staff_menu_exclusions (staff_id, menu_id)
      select p_staff_id, menu_id from unnest(p_menu_ids) as ids(menu_id);
  end if;
  return result;
end;
$$;

revoke all on function public.update_staff_with_exclusions(uuid, jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.update_staff_with_exclusions(uuid, jsonb, uuid[]) to service_role;
