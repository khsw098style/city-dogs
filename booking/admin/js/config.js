// 🏪 店舗固有: 予約管理画面(admin.js)が使うSupabase接続情報。lp/config.jsと同じ値だが、
// admin/はLPと別ホスティングになる可能性がある(CLAUDE.md参照)ため、独立したファイルとして持つ。
// 別の店舗向けにこのリポジトリを複製して使う場合、書き換えが必要なのはこのファイルだけ。
// 手順は最上位の TEMPLATE.md を参照。
// ANON_KEYはpublishable(anon)キーで、クライアントに埋め込む前提の公開鍵(秘匿情報ではない)。
window.CITY_DOGS_CONFIG = {
  SUPABASE_URL: 'https://cwojmmrnhvemupxubtus.supabase.co',
  ANON_KEY: 'sb_publishable_nYEHBjojuRPhIpjBPKG4NQ_nNfQVn7E',
};
