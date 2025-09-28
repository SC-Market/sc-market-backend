--
-- Notification Performance Optimization Indices
-- Adds indices to improve notification query performance
--

-- 1. Timestamp ordering index for notification_object (High Priority)
-- Improves ORDER BY timestamp DESC performance in pagination queries
CREATE INDEX IF NOT EXISTS idx_notification_object_timestamp 
ON public.notification_object (timestamp DESC);

-- 2. Notification change lookup index (Medium Priority)  
-- Improves JOIN performance when fetching notification changes
CREATE INDEX IF NOT EXISTS idx_notification_change_object_id 
ON public.notification_change (notification_object_id);

-- 3. Composite index for user notifications with read status (Medium Priority)
-- Optimizes queries filtering by user, read status, and notification object
CREATE INDEX IF NOT EXISTS idx_notification_user_read_object 
ON public.notification (notifier_id, read, notification_object_id);

-- 4. Action type lookup optimization (Low Priority)
-- Improves action name lookups in notification_actions
CREATE INDEX IF NOT EXISTS idx_notification_actions_action 
ON public.notification_actions (action);

-- Add comments for documentation
COMMENT ON INDEX idx_notification_object_timestamp IS 'Optimizes ORDER BY timestamp DESC queries in notification pagination';
COMMENT ON INDEX idx_notification_change_object_id IS 'Improves JOIN performance for notification change lookups';
COMMENT ON INDEX idx_notification_user_read_object IS 'Optimizes user notification queries with read status filtering';
COMMENT ON INDEX idx_notification_actions_action IS 'Improves action name lookups in notification queries';