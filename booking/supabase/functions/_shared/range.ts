// PostgRESTが返すtstzrangeのテキスト表現をパースする共通ヘルパー。
// 例: '["2026-09-20 10:00:00+09","2026-09-20 10:40:00+09")'
export function parseTstzRange(raw: string): { start: Date; end: Date } {
  const match = raw.match(/^[\[(]"?([^",]+)"?,"?([^",)\]]+)"?[)\]]$/);
  if (!match) throw new Error(`予約時間帯の解析に失敗しました: ${raw}`);
  return { start: new Date(match[1]), end: new Date(match[2]) };
}
