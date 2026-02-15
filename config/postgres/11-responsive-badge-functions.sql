-- Migration 11: Add database functions for responsive badge data
-- These functions calculate total assignments and response rate for users and contractors

CREATE OR REPLACE FUNCTION get_total_assignments(UUID, UUID) RETURNS int AS
$$
BEGIN
    IF $1 IS NOT NULL THEN
        -- For individual users
        RETURN (SELECT COUNT(*) as t
                FROM order_response_times
                WHERE assigned_user_id = $1);
    ELSE
        -- For contractors
        RETURN (SELECT COUNT(*) as t
                FROM order_response_times
                WHERE assigned_contractor_id = $2);
    END IF;
END;
$$
LANGUAGE plpgsql
    SET search_path TO public
STABLE;

CREATE OR REPLACE FUNCTION get_response_rate(UUID, UUID) RETURNS float AS
$$
BEGIN
    IF $1 IS NOT NULL THEN
        -- For individual users
        RETURN (SELECT CASE 
                    WHEN COUNT(*) = 0 THEN 0.0
                    ELSE (COUNT(CASE WHEN response_time_minutes <= 1440 THEN 1 END)::float / COUNT(*)::float) * 100
                END as response_rate
                FROM order_response_times
                WHERE assigned_user_id = $1);
    ELSE
        -- For contractors
        RETURN (SELECT CASE 
                    WHEN COUNT(*) = 0 THEN 0.0
                    ELSE (COUNT(CASE WHEN response_time_minutes <= 1440 THEN 1 END)::float / COUNT(*)::float) * 100
                END as response_rate
                FROM order_response_times
                WHERE assigned_contractor_id = $2);
    END IF;
END;
$$
LANGUAGE plpgsql
    SET search_path TO public
STABLE;

-- Add comments for documentation
COMMENT ON FUNCTION get_total_assignments(UUID, UUID) IS 'Returns the total number of orders assigned to a user or contractor';
COMMENT ON FUNCTION get_response_rate(UUID, UUID) IS 'Returns the percentage of orders responded to within 24 hours (1440 minutes)';