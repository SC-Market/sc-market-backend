-- Migration: Create email_notification_preferences table
-- Description: Stores user preferences for email notifications per notification type.
--              Users must explicitly choose which notification types to enable when
--              adding their email address. No default preferences are set.

BEGIN;

-- Create email_notification_preferences table
CREATE TABLE IF NOT EXISTS public.email_notification_preferences (
  preference_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.accounts(user_id) ON DELETE CASCADE,
  action_type_id INTEGER NOT NULL REFERENCES public.notification_actions(action_type_id) ON DELETE CASCADE,
  
  -- Preference settings
  enabled BOOLEAN NOT NULL, -- No default - user must explicitly choose
  frequency VARCHAR(20) DEFAULT 'immediate' NOT NULL, -- 'immediate', 'daily', 'weekly'
  digest_time TIME NULL, -- Time for daily/weekly digests (user's timezone)
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  
  -- Constraints
  CONSTRAINT unique_user_action_preference UNIQUE (user_id, action_type_id),
  CONSTRAINT check_frequency CHECK (frequency IN ('immediate', 'daily', 'weekly'))
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_preferences_user ON public.email_notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_email_preferences_enabled ON public.email_notification_preferences(user_id, enabled) 
  WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_email_preferences_action ON public.email_notification_preferences(action_type_id);

-- Add comments for documentation
COMMENT ON TABLE public.email_notification_preferences IS 'Stores user preferences for email notifications per notification type. Users must explicitly choose which types to enable - no defaults.';
COMMENT ON COLUMN public.email_notification_preferences.preference_id IS 'Primary key for preference record';
COMMENT ON COLUMN public.email_notification_preferences.user_id IS 'Foreign key to accounts table';
COMMENT ON COLUMN public.email_notification_preferences.action_type_id IS 'Foreign key to notification_actions table';
COMMENT ON COLUMN public.email_notification_preferences.enabled IS 'Whether email notifications are enabled for this notification type (no default - user must choose)';
COMMENT ON COLUMN public.email_notification_preferences.frequency IS 'Email frequency: immediate, daily digest, or weekly digest';
COMMENT ON COLUMN public.email_notification_preferences.digest_time IS 'Time of day for daily/weekly digest emails (user timezone)';

COMMIT;
