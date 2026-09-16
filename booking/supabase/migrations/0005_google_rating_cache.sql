-- Google口コミ連携用のキャッシュ(2026-09-14、プレースホルダー実装)。
-- Google Places API(New)のrating/userRatingCountフィールドは課金区分の中で最も高い
-- Enterprise SKU(無料枠も月1,000回と少ない)に属するため、LP表示のたびに毎回APIを叩かず、
-- この1行キャッシュを介して低頻度(google-rating関数側で既定24時間おき)にしか実際のAPIを呼ばない設計。
-- 1店舗のみのプロジェクトなので複数行を想定せず、id=1固定の単一行として扱う。
create table google_rating_cache (
  id            smallint primary key default 1 check (id = 1),
  rating        numeric(3,2),
  review_count  integer,
  fetched_at    timestamptz not null default now()
);

insert into google_rating_cache (id, fetched_at)
values (1, '1970-01-01T00:00:00Z')
on conflict (id) do nothing;
