-- Migration: Add organization support to push_notification_preferences
-- Description: Adds contractor_id column to allow users to configure push notification
--              preferences separately for their individual account and for each organization
--              they are members of. When contractor_id is NULL, preference applies to
--              individual/personal notifications. When contractor_id is set, preference
--              applies to notifications for that specific organization.

BEGIN;

-- Add contractor_id column (nullable - NULL means individual preferences)
ALTER TABLE public.push_notification_preferences
  ADD COLUMN IF NOT EXISTS contractor_id UUID REFERENCES public.contractors(contractor_id) ON DELETE CASCADE;

-- Drop existing unique constraint (checking for the actual constraint name)
DO $$
BEGIN
  -- Try to drop the constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'push_notification_preferences_user_id_action_type_id_key'
  ) THEN
    ALTER TABLE public.push_notification_preferences
      DROP CONSTRAINT push_notification_preferences_user_id_action_type_id_key;
  END IF;
  
  -- Also try the generic unique constraint name
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_user_action_preference'
    AND conrelid = 'public.push_notification_preferences'::regclass
  ) THEN
    ALTER TABLE public.push_notification_preferences
      DROP CONSTRAINT unique_user_action_preference;
  END IF;
END $$;

-- Add new unique constraint including contractor_id
ALTER TABLE public.push_notification_preferences
  DROP CONSTRAINT IF EXISTS unique_push_user_action_contractor_preference;

ALTER TABLE public.push_notification_preferences
  ADD CONSTRAINT unique_push_user_action_contractor_preference 
    UNIQUE (user_id, action_type_id, contractor_id);

-- Set all existing preferences to NULL (individual scope)
UPDATE public.push_notification_preferences
  SET contractor_id = NULL
  WHERE contractor_id IS NULL; -- Only update if not already set (idempotent)

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_push_preferences_contractor 
  ON public.push_notification_preferences(contractor_id);

CREATE INDEX IF NOT EXISTS idx_push_preferences_user_contractor 
  ON public.push_notification_preferences(user_id, contractor_id);

-- Add comments for documentation
COMMENT ON COLUMN public.push_notification_preferences.contractor_id IS 'Organization/contractor ID this preference applies to. NULL means individual/personal preferences.';

COMMIT;
