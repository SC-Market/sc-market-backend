-- Migration: Add chat participants for existing orders and offers
-- This script backfills the chat_participants table with users who should be
-- participants in order and offer chats based on the order/offer data.
--
-- This script is idempotent - safe to run multiple times.
-- It uses INSERT ... ON CONFLICT DO NOTHING to avoid duplicates.

BEGIN;

-- Add unique index if it doesn't exist (prevents duplicate participants and improves performance)
CREATE UNIQUE INDEX IF NOT EXISTS chat_participants_chat_id_user_id_key 
ON chat_participants(chat_id, user_id);

-- Add indexes if they don't exist (for performance)
CREATE INDEX IF NOT EXISTS idx_chat_participants_user_id 
ON chat_participants(user_id);

CREATE INDEX IF NOT EXISTS idx_chat_participants_chat_id 
ON chat_participants(chat_id);

-- Backfill participants for existing order chats
-- Add customer_id for all order chats
INSERT INTO chat_participants (chat_id, user_id)
SELECT DISTINCT c.chat_id, o.customer_id
FROM chats c
JOIN orders o ON c.order_id = o.order_id
WHERE o.customer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM chat_participants cp
    WHERE cp.chat_id = c.chat_id AND cp.user_id = o.customer_id
  )
ON CONFLICT (chat_id, user_id) DO NOTHING;

-- Add assigned_id for all order chats (where assigned_id exists)
INSERT INTO chat_participants (chat_id, user_id)
SELECT DISTINCT c.chat_id, o.assigned_id
FROM chats c
JOIN orders o ON c.order_id = o.order_id
WHERE o.assigned_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM chat_participants cp
    WHERE cp.chat_id = c.chat_id AND cp.user_id = o.assigned_id
  )
ON CONFLICT (chat_id, user_id) DO NOTHING;

-- Backfill participants for existing offer chats
-- Add customer_id for all offer chats
INSERT INTO chat_participants (chat_id, user_id)
SELECT DISTINCT c.chat_id, os.customer_id
FROM chats c
JOIN offer_sessions os ON c.session_id = os.id
WHERE os.customer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM chat_participants cp
    WHERE cp.chat_id = c.chat_id AND cp.user_id = os.customer_id
  )
ON CONFLICT (chat_id, user_id) DO NOTHING;

-- Add assigned_id for all offer chats (where assigned_id exists)
INSERT INTO chat_participants (chat_id, user_id)
SELECT DISTINCT c.chat_id, os.assigned_id
FROM chats c
JOIN offer_sessions os ON c.session_id = os.id
WHERE os.assigned_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM chat_participants cp
    WHERE cp.chat_id = c.chat_id AND cp.user_id = os.assigned_id
  )
ON CONFLICT (chat_id, user_id) DO NOTHING;

COMMIT;

-- Summary query to verify migration
-- Run this after the migration to see how many participants were added:
-- SELECT 
--   (SELECT COUNT(*) FROM chat_participants) as total_participants,
--   (SELECT COUNT(DISTINCT chat_id) FROM chats WHERE order_id IS NOT NULL) as order_chats,
--   (SELECT COUNT(DISTINCT chat_id) FROM chats WHERE session_id IS NOT NULL) as offer_chats;
