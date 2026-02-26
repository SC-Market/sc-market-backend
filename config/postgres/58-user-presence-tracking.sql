-- Add presence tracking columns
ALTER TABLE accounts 
  ADD COLUMN last_seen TIMESTAMP DEFAULT NOW() NOT NULL,
  ADD COLUMN in_game BOOLEAN DEFAULT false NOT NULL;

-- Indexes for efficient queries
CREATE INDEX idx_accounts_last_seen ON accounts(last_seen);
CREATE INDEX idx_accounts_in_game ON accounts(in_game) WHERE in_game = true;

-- Update existing accounts with their most recent activity date
UPDATE accounts 
SET last_seen = COALESCE(
  (SELECT MAX(date)::timestamp 
   FROM activity_history 
   WHERE activity_history.user_id = accounts.user_id),
  NOW()
);
