-- Add presence tracking columns
ALTER TABLE users 
  ADD COLUMN last_seen TIMESTAMP DEFAULT NOW() NOT NULL,
  ADD COLUMN in_game BOOLEAN DEFAULT false NOT NULL;

-- Indexes for efficient queries
CREATE INDEX idx_users_last_seen ON users(last_seen);
CREATE INDEX idx_users_in_game ON users(in_game) WHERE in_game = true;

-- Update existing users with their most recent activity date
UPDATE users 
SET last_seen = COALESCE(
  (SELECT MAX(date)::timestamp 
   FROM activity_history 
   WHERE activity_history.user_id = users.user_id),
  NOW()
);
