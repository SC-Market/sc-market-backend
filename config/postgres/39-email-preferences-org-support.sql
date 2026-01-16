-- Migration: Add organization support to email_notification_preferences
-- Description: Adds contractor_id column to allow users to configure email notification
--              preferences separately for their individual account and for each organization
--              they are members of. When contractor_id is NULL, preference applies to
--              individual/personal notifications. When contractor_id is set, preference
--              applies to notifications for that specific organization.

BEGIN;

-- Add contractor_id column (nullable - NULL means individual preferences)
ALTER TABLE public.email_notification_preferences
  ADD COLUMN IF NOT EXISTS contractor_id UUID REFERENCES public.contractors(contractor_id) ON DELETE CASCADE;

-- Drop existing unique constraint
ALTER TABLE public.email_notification_preferences
  DROP CONSTRAINT IF EXISTS unique_user_action_preference;

-- Add new unique constraint including contractor_id
ALTER TABLE public.email_notification_preferences
  DROP CONSTRAINT IF EXISTS unique_email_user_action_contractor_preference;

ALTER TABLE public.email_notification_preferences
  ADD CONSTRAINT unique_email_user_action_contractor_preference 
    UNIQUE (user_id, action_type_id, contractor_id);

-- Set all existing preferences to NULL (individual scope)
UPDATE public.email_notification_preferences
  SET contractor_id = NULL
  WHERE contractor_id IS NULL; -- Only update if not already set (idempotent)

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_preferences_contractor 
  ON public.email_notification_preferences(contractor_id);

CREATE INDEX IF NOT EXISTS idx_email_preferences_user_contractor 
  ON public.email_notification_preferences(user_id, contractor_id);

-- Add comments for documentation
COMMENT ON COLUMN public.email_notification_preferences.contractor_id IS 'Organization/contractor ID this preference applies to. NULL means individual/personal preferences.';

COMMIT;
