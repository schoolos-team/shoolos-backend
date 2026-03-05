-- ================================================================
-- SchoolOS – Communication Tables
-- Paste and run in Supabase SQL Editor
-- ================================================================

-- notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title    TEXT        NOT NULL,
  body     TEXT        NOT NULL,
  type     TEXT        NOT NULL CHECK (
             type IN ('fee_reminder','announcement','message','general')
           ),
  is_read  BOOLEAN     NOT NULL DEFAULT false,
  sent_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);