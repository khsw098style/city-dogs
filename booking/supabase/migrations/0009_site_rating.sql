-- Google Places API連携を撤回(2026-09-17)。ratingやreviewsは自社DBへのキャッシュ・保存が
-- Google Maps Platformの利用規約上NG(「request it live, display it, do not warehouse it」)と
-- 判明したため、Google口コミ連携そのものを取りやめた。
drop table if exists google_rating_cache;

-- 代わりに、LPヒーローの評価バッジ(★スコア・口コミ件数)を管理画面から手動更新できるようにする。
-- HotPepper等の実際の掲載ページを見ながら、スタッフが不定期に数字だけを書き換える運用を想定。
-- 1店舗のみのプロジェクトなので複数行を想定せず、id=1固定の単一行として扱う(旧テーブルと同じ方式)。
create table site_rating (
  id            smallint primary key default 1 check (id = 1),
  rating        numeric(3,2) not null default 4.88 check (rating >= 0 and rating <= 5),
  review_count  integer not null default 11 check (review_count >= 0),
  updated_at    timestamptz not null default now()
);

alter table site_rating enable row level security;

insert into site_rating (id, rating, review_count)
values (1, 4.88, 11)
on conflict (id) do nothing;
