--
-- Push Notifications Feature Migration
-- This migration adds support for Web Push Protocol push notifications
-- 
-- Features added:
-- - push_subscriptions: Store user push subscription data (endpoint, keys)
-- - push_notification_preferences: Store user preferences per notification type
-- - Proper indexes for performance
-- - Foreign key constraints for data integrity
--

BEGIN;

-- =============================================================================
-- 1. CREATE PUSH_SUBSCRIPTIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.accounts(user_id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, endpoint)
);

-- Add indexes for performance
CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);
CREATE INDEX idx_push_subscriptions_endpoint ON public.push_subscriptions(endpoint);

-- Add comments for documentation
COMMENT ON TABLE public.push_subscriptions IS 'Stores Web Push Protocol subscription data for users';
COMMENT ON COLUMN public.push_subscriptions.subscription_id IS 'Unique identifier for the subscription';
COMMENT ON COLUMN public.push_subscriptions.user_id IS 'User who owns this subscription';
COMMENT ON COLUMN public.push_subscriptions.endpoint IS 'Push service endpoint URL (unique per user)';
COMMENT ON COLUMN public.push_subscriptions.p256dh IS 'P-256 ECDH public key (base64 encoded)';
COMMENT ON COLUMN public.push_subscriptions.auth IS 'Authentication secret (base64 encoded)';
COMMENT ON COLUMN public.push_subscriptions.user_agent IS 'User agent string when subscription was created';
COMMENT ON COLUMN public.push_subscriptions.created_at IS 'Timestamp when subscription was created';
COMMENT ON COLUMN public.push_subscriptions.updated_at IS 'Timestamp when subscription was last updated';

-- =============================================================================
-- 2. CREATE PUSH_NOTIFICATION_PREFERENCES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.push_notification_preferences (
  preference_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.accounts(user_id) ON DELETE CASCADE,
  action_type_id INTEGER NOT NULL REFERENCES public.notification_actions(action_type_id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, action_type_id)
);

-- Add indexes for performance
CREATE INDEX idx_push_preferences_user_id ON public.push_notification_preferences(user_id);
CREATE INDEX idx_push_preferences_action_type_id ON public.push_notification_preferences(action_type_id);
CREATE INDEX idx_push_preferences_user_enabled ON public.push_notification_preferences(user_id, enabled) WHERE enabled = true;

-- Add comments for documentation
COMMENT ON TABLE public.push_notification_preferences IS 'Stores user preferences for push notifications per notification type';
COMMENT ON COLUMN public.push_notification_preferences.preference_id IS 'Unique identifier for the preference';
COMMENT ON COLUMN public.push_notification_preferences.user_id IS 'User who owns this preference';
COMMENT ON COLUMN public.push_notification_preferences.action_type_id IS 'Notification action type this preference applies to';
COMMENT ON COLUMN public.push_notification_preferences.enabled IS 'Whether push notifications are enabled for this action type (default: true)';
COMMENT ON COLUMN public.push_notification_preferences.created_at IS 'Timestamp when preference was created';
COMMENT ON COLUMN public.push_notification_preferences.updated_at IS 'Timestamp when preference was last updated';

-- =============================================================================
-- 3. CREATE TRIGGER FOR UPDATED_AT TIMESTAMP
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for push_subscriptions
CREATE TRIGGER update_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for push_notification_preferences
CREATE TRIGGER update_push_preferences_updated_at
  BEFORE UPDATE ON public.push_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMIT;
