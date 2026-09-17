// 🏪 店舗固有: LP側(reserve.js / manage.js / site-content.js)が共通で使うSupabase接続情報。
// 別の店舗向けにこのリポジトリを複製して使う場合、書き換えが必要なのはこのファイルだけ。
// 手順は最上位の TEMPLATE.md を参照。
// ANON_KEYはpublishable(anon)キーで、クライアントに埋め込む前提の公開鍵(秘匿情報ではない)。
window.CITY_DOGS_CONFIG = {
  SUPABASE_URL: 'https://cwojmmrnhvemupxubtus.supabase.co',
  ANON_KEY: 'sb_publishable_nYEHBjojuRPhIpjBPKG4NQ_nNfQVn7E',
  // Cloudflare Turnstileのサイトキー(公開情報、秘匿不要)。
  // city-dogs.khs-w098style.workers.dev のHostname Managementに登録済み(2026-09-16)。
  TURNSTILE_SITE_KEY: '0x4AAAAAAE4sxhHQSTp5lim6',
};
