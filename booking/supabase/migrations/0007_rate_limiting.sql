-- 公開API(GET /reservations/lookup 等)のレート制限用。
--
-- 背景: reservation_number が B000000001 のような連番であるため、
-- phone(電話番号)と組み合わせた総当たりで他人の予約情報を引き当てたり、
-- 無断で他人の予約をキャンセルできてしまうリスクがある(CLAUDE.md「納品までに対応する」参照)。
-- レート制限で試行回数そのものを絞ることで、この種の総当たりを非現実的にする。
--
-- 固定ウィンドウ方式(fixed window)。IPアドレス+エンドポイント名をキーにして、
-- ウィンドウ内の試行回数をDBで原子的にカウントする。rate_limit_hit() は
-- 「INSERT .. ON CONFLICT DO UPDATE .. RETURNING」1文で完結させており、
-- 同時リクエストが来ても競合状態(read-then-write)にならない。
--
-- 件数が少ない(固定客500人規模)ため、古い行の自動削除は行わない。
-- 万一テーブルが肥大化した場合は SQL Editor から手動で削除すればよい規模。

create table rate_limit_buckets (
  key           text primary key,
  count         integer not null default 1,
  window_start  timestamptz not null default now()
);

alter table rate_limit_buckets enable row level security;

create or replace function rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into rate_limit_buckets (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
    set count = case
                  when rate_limit_buckets.window_start <= now() - (p_window_seconds || ' seconds')::interval
                    then 1
                  else rate_limit_buckets.count + 1
                end,
        window_start = case
                  when rate_limit_buckets.window_start <= now() - (p_window_seconds || ' seconds')::interval
                    then now()
                  else rate_limit_buckets.window_start
                end
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;
