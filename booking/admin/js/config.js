// 🏪 店舗固有: 予約管理画面(admin.js)が使うSupabase接続情報。lp/config.jsと同じ値だが、
// admin/はLPと別ホスティングになる可能性がある(CLAUDE.md参照)ため、独立したファイルとして持つ。
// 別の店舗向けにこのリポジトリを複製して使う場合、書き換えが必要なのはこのファイルだけ。
// 手順は最上位の TEMPLATE.md を参照。
// ANON_KEYはpublishable(anon)キーで、クライアントに埋め込む前提の公開鍵(秘匿情報ではない)。
window.CITY_DOGS_CONFIG = {
  SUPABASE_URL: 'https://cwojmmrnhvemupxubtus.supabase.co',
  ANON_KEY: 'sb_publishable_nYEHBjojuRPhIpjBPKG4NQ_nNfQVn7E',
  // Cloudflare Turnstileのサイトキー(公開情報、秘匿不要)。lp/js/config.jsと同じサイトを再利用。
  // このドメイン(city-dogs-admin-deploy.khs-w098style.workers.dev)をCloudflareのHostname
  // Managementに追加登録しないとウィジェットが表示されないので、本番反映時は要確認。
  TURNSTILE_SITE_KEY: '0x4AAAAAAE4sxhHQSTp5lim6',
  // 店舗によっては不要なタブがあるため(例: 顧客管理・売上予定実績を使わない店舗)、
  // 納品前にここでfalseにすればそのタブ自体を非表示にできる(オーナー自身は変更しない、
  // 開発者がこのファイルを直接編集して納品する運用。キー未指定時はtrue扱い)。
  ENABLED_TABS: {
    schedule: true,
    search: true,
    content: true,
    shifts: true,
    customers: true,
    revenue: true,
  },
  // 予約検索タブの1ページあたりの表示件数(未指定・不正な値は30。APIの上限は200)。
  SEARCH_PAGE_SIZE: 30,
};
