-- 【セキュリティ修正・緊急】全テーブルでRow Level Security(RLS)を有効化する。
--
-- 経緯: プロジェクト開始時からどのテーブルにもRLSが未設定のままだった。このプロジェクトは
-- 「テーブルへの直接アクセス(PostgREST自動API)は使わず、必ずEdge Functions層を経由させる」
-- 設計方針(CLAUDE.md参照)だが、それはアプリケーション側の"お作法"に過ぎず、DB側では
-- 何も強制していなかった。LP・管理画面のクライアントJSにはpublishable(anon)キーが
-- 埋め込まれており(想定通りの使い方)、RLSが無効なテーブルは「そのキーさえあれば
-- PostgREST経由で誰でも直接読み書き・削除できる」状態になる。
--
-- 実際に2026-09-16、anon keyで customers テーブルの氏名・電話番号・メールアドレスが
-- Edge Functionsを一切経由せず直接読み取れることを確認して発覚(Supabase Security Advisor
-- の "rls_disabled_in_public" 警告がきっかけ)。
--
-- 対応方針: ポリシーは一切作らず、RLSを有効化するだけにする。
-- Edge Functionsは全て service_role クライアント(_shared/supabase.ts の serviceClient())
-- 経由でDBにアクセスしており、service_roleはRLSを無視する(bypassrls)権限を持つため、
-- 既存の全機能はこの変更による影響を受けない。一方でanon/authenticatedロールは
-- ポリシーが1つも無いテーブルに対して「何も読み書きできない」状態になり、
-- PostgREST自動API経由の直接アクセス経路がこれで完全に塞がる。

alter table customers               enable row level security;
alter table staff                   enable row level security;
alter table menus                   enable row level security;
alter table business_days           enable row level security;
alter table staff_shifts            enable row level security;
alter table reservations            enable row level security;
alter table site_features           enable row level security;
alter table site_gallery_photos     enable row level security;
alter table google_rating_cache     enable row level security;
