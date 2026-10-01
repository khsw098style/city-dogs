-- メニュー区分に「期間限定メニュー」を追加(2026-10-01)。
--
-- 「期間限定の特別メニュー(割引価格等)」を、既存メニューの説明文に押し込むのではなく
-- 専用の区分として扱えるようにする。予約画面の選択ルール上はcut/colorと同じ「主メニュー・
-- 単独1つまで」区分として扱う(_shared/menuSelection.ts側で定義)。行が無ければLP・予約画面
-- どちらにもこの区分自体が表示されない(既存の「空なら見出しごと出さない」仕組みがそのまま効く)。
alter table menus drop constraint menus_category_check;
alter table menus add constraint menus_category_check
  check (category in ('cut', 'color', 'perm', 'option', 'limited'));

comment on column menus.category is 'cut/color/perm/limited=単独で予約可能な主メニュー、option=主メニューへの追加専用。limited=期間限定メニュー(2026-10-01追加)';
