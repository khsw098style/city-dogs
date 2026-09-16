-- スタッフの休憩時間を空き枠計算から除外できるようにする(バックログ項目、CLAUDE.md参照)。
--
-- data-model.mdでは「staff_shiftsへの休憩カラム追加」「休憩を複数登録できる別テーブル」の
-- 2案を検討していた。固定客500人規模・スタッフ数名の理容室で、1日に複数回休憩を挟む
-- 運用は考えにくいため、シンプルな前者(1日1回の休憩)を採用する。

alter table staff_shifts
  add column break_start_time time,
  add column break_end_time   time;

alter table staff_shifts
  add constraint staff_shifts_break_check check (
    (break_start_time is null and break_end_time is null)
    or (break_start_time is not null and break_end_time is not null and break_start_time < break_end_time)
  );
