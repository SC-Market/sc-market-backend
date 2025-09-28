-- Migration 10: Create order_response_times table for responsive badge tracking
-- This table tracks when orders are assigned and when they are responded to
-- Supports both individual users and contractor organizations

CREATE TABLE order_response_times (
    order_id UUID NOT NULL REFERENCES orders(order_id),
    assigned_user_id UUID REFERENCES accounts(user_id),
    assigned_contractor_id UUID REFERENCES contractors(contractor_id),
    assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMP,
    response_time_minutes INTEGER,
    is_responded BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Ensure either user_id or contractor_id is provided, but not both
    CONSTRAINT check_assignment CHECK (
        (assigned_user_id IS NOT NULL AND assigned_contractor_id IS NULL) OR
        (assigned_user_id IS NULL AND assigned_contractor_id IS NOT NULL)
    )
);

-- Add a unique constraint to prevent duplicate assignments
CREATE UNIQUE INDEX idx_order_response_times_unique_assignment 
ON order_response_times(order_id, assigned_user_id, assigned_contractor_id) 
WHERE assigned_user_id IS NOT NULL OR assigned_contractor_id IS NOT NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_order_response_times_user_id ON order_response_times(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_order_response_times_contractor_id ON order_response_times(assigned_contractor_id);
CREATE INDEX IF NOT EXISTS idx_order_response_times_assigned_at ON order_response_times(assigned_at);
CREATE INDEX IF NOT EXISTS idx_order_response_times_is_responded ON order_response_times(is_responded);

-- Add comments for documentation
COMMENT ON TABLE order_response_times IS 'Tracks order assignment and response times for responsive badge calculation';
COMMENT ON COLUMN order_response_times.order_id IS 'Reference to the order';
COMMENT ON COLUMN order_response_times.assigned_user_id IS 'User assigned to the order (null if contractor assigned)';
COMMENT ON COLUMN order_response_times.assigned_contractor_id IS 'Contractor assigned to the order (null if user assigned)';
COMMENT ON COLUMN order_response_times.assigned_at IS 'When the order was assigned';
COMMENT ON COLUMN order_response_times.responded_at IS 'When the order was responded to (status changed to in-progress)';
COMMENT ON COLUMN order_response_times.response_time_minutes IS 'Response time in minutes';
COMMENT ON COLUMN order_response_times.is_responded IS 'Whether the order has been responded to';
COMMENT ON COLUMN order_response_times.created_at IS 'When this record was created';