--
-- Review Revision Feature Migration
-- This migration adds support for requesting and handling review revisions
-- 
-- Features added:
-- - revision_requested: boolean flag indicating if a revision was requested
-- - revision_requested_at: timestamp when revision was requested
-- - last_modified_at: timestamp when review was last modified
-- - revision_message: optional message explaining why revision was requested
-- - New notification action type for revision requests
-- - Proper indexes for performance
--

BEGIN;

-- Add new columns to order_reviews table
ALTER TABLE public.order_reviews 
ADD COLUMN revision_requested boolean DEFAULT false NOT NULL,
ADD COLUMN revision_requested_at timestamp without time zone,
ADD COLUMN last_modified_at timestamp without time zone DEFAULT now() NOT NULL,
ADD COLUMN revision_message character varying(500);
-- Add constraint to ensure revision_requested_at is set when revision_requested is true
ALTER TABLE public.order_reviews 
ADD CONSTRAINT order_reviews_revision_requested_check 
CHECK (revision_requested = false OR revision_requested_at IS NOT NULL);

-- Add indexes for performance
CREATE INDEX idx_order_reviews_revision_requested ON public.order_reviews(revision_requested);
CREATE INDEX idx_order_reviews_revision_requested_at ON public.order_reviews(revision_requested_at);
CREATE INDEX idx_order_reviews_last_modified_at ON public.order_reviews(last_modified_at);

-- Add new notification action type
INSERT INTO public.notification_actions (action_type_id, action, entity) 
VALUES (22, 'order_review_revision_requested', 'order_reviews');

-- Update existing reviews to have last_modified_at set to their creation timestamp
UPDATE public.order_reviews 
SET last_modified_at = timestamp 
WHERE last_modified_at IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.order_reviews.revision_requested IS 'Indicates whether a revision has been requested for this review';
COMMENT ON COLUMN public.order_reviews.revision_requested_at IS 'Timestamp when the revision was requested';
COMMENT ON COLUMN public.order_reviews.last_modified_at IS 'Timestamp when the review was last modified';
COMMENT ON COLUMN public.order_reviews.revision_message IS 'Optional message explaining why the revision was requested (max 500 characters)';

COMMIT;