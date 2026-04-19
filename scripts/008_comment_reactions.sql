-- Migration 008: comment_reactions tablosu
-- Yorumlara emoji reaksiyon desteği ekler.
-- Supabase SQL Editor'da bir kez çalıştırın.

CREATE TABLE IF NOT EXISTS comment_reactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID        NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  emoji      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Her kullanıcı bir yoruma aynı emojiyi yalnızca bir kez ekleyebilir
  CONSTRAINT comment_reactions_unique UNIQUE (comment_id, user_id, emoji)
);

-- Hız için indeksler
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_id ON comment_reactions (comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_user_id    ON comment_reactions (user_id);

-- RLS: workspace üyesi olan herkes okuyabilir ve kendi reaksiyonunu yönetebilir
-- NOT: Bu uygulama Supabase Auth kullanmaz (özel RPC tabanlı login).
-- auth.uid() her zaman NULL döndüreceğinden INSERT/DELETE politikaları
-- WITH CHECK(true) / USING(true) olarak tanımlanmıştır.
ALTER TABLE comment_reactions ENABLE ROW LEVEL SECURITY;

-- Idempotent: önce mevcut politikaları kaldır, sonra yeniden oluştur
DROP POLICY IF EXISTS "comment_reactions_select" ON comment_reactions;
DROP POLICY IF EXISTS "comment_reactions_insert" ON comment_reactions;
DROP POLICY IF EXISTS "comment_reactions_delete" ON comment_reactions;

CREATE POLICY "comment_reactions_select" ON comment_reactions
  FOR SELECT USING (true);

-- Supabase Auth kullanılmadığı için user_id kontrolü uygulama katmanında yapılır
CREATE POLICY "comment_reactions_insert" ON comment_reactions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "comment_reactions_delete" ON comment_reactions
  FOR DELETE USING (true);