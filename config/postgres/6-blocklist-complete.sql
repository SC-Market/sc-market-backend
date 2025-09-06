-- Complete blocklist implementation migration
-- This migration creates the blocklist table with proper foreign key constraints,
-- adds the manage_blocklist permission, and sets up the correct schema

-- =============================================================================
-- 1. CREATE BLOCKLIST TABLE
-- =============================================================================

CREATE TABLE public.blocklist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    blocker_id uuid NOT NULL, -- DEPRECATED: Use blocker_user_id or blocker_contractor_id
    blocker_user_id uuid, -- User doing the blocking (when blocker_type = 'user')
    blocker_contractor_id uuid, -- Organization doing the blocking (when blocker_type = 'contractor')
    blocked_id uuid NOT NULL, -- User being blocked
    blocker_type character varying(20) NOT NULL CHECK (blocker_type IN ('user', 'contractor')), -- Type of blocker
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    reason character varying(500) DEFAULT ''::character varying, -- Optional reason for blocking
    CONSTRAINT blocklist_pkey PRIMARY KEY (id)
);

-- =============================================================================
-- 2. ADD PERMISSION SYSTEM
-- =============================================================================

-- Add the manage_blocklist permission to contractor_roles table
-- ALTER TABLE public.contractor_roles
-- ADD COLUMN manage_blocklist boolean DEFAULT false NOT NULL;

-- =============================================================================
-- 3. SET UP CONSTRAINTS AND INDEXES
-- =============================================================================

-- Add check constraint to ensure only one blocker type is set
ALTER TABLE public.blocklist 
ADD CONSTRAINT blocklist_blocker_check 
CHECK (
  (blocker_type = 'user' AND blocker_user_id IS NOT NULL AND blocker_contractor_id IS NULL) OR
  (blocker_type = 'contractor' AND blocker_contractor_id IS NOT NULL AND blocker_user_id IS NULL)
);

-- Add foreign key constraints
ALTER TABLE public.blocklist
    ADD CONSTRAINT blocklist_blocker_user_fkey 
    FOREIGN KEY (blocker_user_id) REFERENCES public.accounts(user_id) 
    ON DELETE CASCADE;

ALTER TABLE public.blocklist
    ADD CONSTRAINT blocklist_blocker_contractor_fkey 
    FOREIGN KEY (blocker_contractor_id) REFERENCES public.contractors(contractor_id) 
    ON DELETE CASCADE;

ALTER TABLE public.blocklist
    ADD CONSTRAINT blocklist_blocked_user_fkey 
    FOREIGN KEY (blocked_id) REFERENCES public.accounts(user_id) 
    ON DELETE CASCADE;

-- Add unique constraints for each blocker type
ALTER TABLE public.blocklist 
ADD CONSTRAINT blocklist_unique_user_block 
UNIQUE (blocker_user_id, blocked_id);

ALTER TABLE public.blocklist 
ADD CONSTRAINT blocklist_unique_contractor_block 
UNIQUE (blocker_contractor_id, blocked_id);

-- Add indexes for performance
CREATE INDEX idx_blocklist_blocker_id ON public.blocklist(blocker_id);
CREATE INDEX idx_blocklist_blocked_id ON public.blocklist(blocked_id);
CREATE INDEX idx_blocklist_blocker_type ON public.blocklist(blocker_type);
CREATE INDEX idx_blocklist_created_at ON public.blocklist(created_at);
CREATE INDEX idx_blocklist_blocker_user_id ON public.blocklist(blocker_user_id);
CREATE INDEX idx_blocklist_blocker_contractor_id ON public.blocklist(blocker_contractor_id);

-- =============================================================================
-- 4. BACKFILL PERMISSIONS
-- =============================================================================

-- Backfill the manage_blocklist permission for existing Owner roles (position 0)
UPDATE public.contractor_roles 
SET manage_blocklist = true 
WHERE position = 0;

-- Backfill the manage_blocklist permission for existing Admin roles (position 1)
UPDATE public.contractor_roles
SET manage_blocklist = true
WHERE position = 1 AND name = 'Admin';

-- =============================================================================
-- 5. ADD DOCUMENTATION
-- =============================================================================

-- Table comments
COMMENT ON TABLE public.blocklist IS 'Stores blocking relationships between users and organizations';
COMMENT ON COLUMN public.blocklist.blocker_id IS 'DEPRECATED: Use blocker_user_id or blocker_contractor_id instead';
COMMENT ON COLUMN public.blocklist.blocker_user_id IS 'ID of the user doing the blocking (when blocker_type = user)';
COMMENT ON COLUMN public.blocklist.blocker_contractor_id IS 'ID of the organization doing the blocking (when blocker_type = contractor)';
COMMENT ON COLUMN public.blocklist.blocked_id IS 'ID of the user being blocked';
COMMENT ON COLUMN public.blocklist.blocker_type IS 'Type of blocker: user or contractor (organization)';
COMMENT ON COLUMN public.blocklist.reason IS 'Optional reason for blocking the user';

-- Permission column comment
COMMENT ON COLUMN public.contractor_roles.manage_blocklist IS 'Permission to manage organization blocklist - block and unblock users';

-- =============================================================================
-- 6. MIGRATION NOTES
-- =============================================================================

-- Note: The old blocker_id column is kept for backward compatibility
-- It should be removed in a future migration after updating all application code
-- to use the new blocker_user_id and blocker_contractor_id columns
