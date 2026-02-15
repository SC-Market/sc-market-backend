-- Migration 22: Add database functions for badge calculations
-- These functions calculate data needed for all badge types (volume, activity, speed, consistency, early adopter)

-- Function to get fulfilled orders count for user or contractor
CREATE OR REPLACE FUNCTION get_fulfilled_orders_count(UUID, UUID) RETURNS int AS
$$
BEGIN
    IF $1 IS NOT NULL THEN
        -- For individual users
        RETURN (SELECT COUNT(*) as t
                FROM orders
                WHERE assigned_id = $1
                  AND contractor_id IS NULL
                  AND status = 'fulfilled');
    ELSE
        -- For contractors
        RETURN (SELECT COUNT(*) as t
                FROM orders
                WHERE contractor_id = $2
                  AND status = 'fulfilled');
    END IF;
END;
$$
LANGUAGE plpgsql
    SET search_path TO public
STABLE;

COMMENT ON FUNCTION get_fulfilled_orders_count(UUID, UUID) IS 'Returns the total number of fulfilled orders for a user or contractor';

-- Function to get orders count in last 30 days for user or contractor
CREATE OR REPLACE FUNCTION get_orders_last_30_days(UUID, UUID) RETURNS int AS
$$
BEGIN
    IF $1 IS NOT NULL THEN
        -- For individual users
        RETURN (SELECT COUNT(*) as t
                FROM orders
                WHERE assigned_id = $1
                  AND contractor_id IS NULL
                  AND timestamp >= NOW() - INTERVAL '30 days');
    ELSE
        -- For contractors
        RETURN (SELECT COUNT(*) as t
                FROM orders
                WHERE contractor_id = $2
                  AND timestamp >= NOW() - INTERVAL '30 days');
    END IF;
END;
$$
LANGUAGE plpgsql
    SET search_path TO public
STABLE;

COMMENT ON FUNCTION get_orders_last_30_days(UUID, UUID) IS 'Returns the number of orders created in the last 30 days for a user or contractor';

-- Function to get orders count in last 90 days for user or contractor
CREATE OR REPLACE FUNCTION get_orders_last_90_days(UUID, UUID) RETURNS int AS
$$
BEGIN
    IF $1 IS NOT NULL THEN
        -- For individual users
        RETURN (SELECT COUNT(*) as t
                FROM orders
                WHERE assigned_id = $1
                  AND contractor_id IS NULL
                  AND timestamp >= NOW() - INTERVAL '90 days');
    ELSE
        -- For contractors
        RETURN (SELECT COUNT(*) as t
                FROM orders
                WHERE contractor_id = $2
                  AND timestamp >= NOW() - INTERVAL '90 days');
    END IF;
END;
$$
LANGUAGE plpgsql
    SET search_path TO public
STABLE;

COMMENT ON FUNCTION get_orders_last_90_days(UUID, UUID) IS 'Returns the number of orders created in the last 90 days for a user or contractor';

-- Function to get average completion time in hours for user or contractor
-- Calculates time from order creation (timestamp) to when status changed to 'fulfilled' (order_status_update)
CREATE OR REPLACE FUNCTION get_avg_completion_time_hours(UUID, UUID) RETURNS float AS
$$
BEGIN
    IF $1 IS NOT NULL THEN
        -- For individual users
        RETURN (SELECT CASE 
                    WHEN COUNT(*) = 0 THEN NULL
                    ELSE AVG(EXTRACT(EPOCH FROM (fulfillment_time.timestamp - orders.timestamp)) / 3600.0)
                END as avg_hours
                FROM orders
                INNER JOIN (
                    SELECT DISTINCT ON (order_id) order_id, timestamp
                    FROM order_status_update
                    WHERE new_status = 'fulfilled'
                    ORDER BY order_id, timestamp ASC
                ) fulfillment_time ON orders.order_id = fulfillment_time.order_id
                WHERE orders.assigned_id = $1
                  AND orders.contractor_id IS NULL
                  AND orders.status = 'fulfilled');
    ELSE
        -- For contractors
        RETURN (SELECT CASE 
                    WHEN COUNT(*) = 0 THEN NULL
                    ELSE AVG(EXTRACT(EPOCH FROM (fulfillment_time.timestamp - orders.timestamp)) / 3600.0)
                END as avg_hours
                FROM orders
                INNER JOIN (
                    SELECT DISTINCT ON (order_id) order_id, timestamp
                    FROM order_status_update
                    WHERE new_status = 'fulfilled'
                    ORDER BY order_id, timestamp ASC
                ) fulfillment_time ON orders.order_id = fulfillment_time.order_id
                WHERE orders.contractor_id = $2
                  AND orders.status = 'fulfilled');
    END IF;
END;
$$
LANGUAGE plpgsql
    SET search_path TO public
STABLE;

COMMENT ON FUNCTION get_avg_completion_time_hours(UUID, UUID) IS 'Returns the average completion time in hours from order creation to fulfillment for a user or contractor';

-- Function to get account age in months for a user
CREATE OR REPLACE FUNCTION get_account_age_months(UUID) RETURNS int AS
$$
BEGIN
    RETURN (SELECT (EXTRACT(YEAR FROM AGE(NOW(), created_at)) * 12 + 
                   EXTRACT(MONTH FROM AGE(NOW(), created_at)))::int as months
            FROM accounts
            WHERE user_id = $1);
END;
$$
LANGUAGE plpgsql
    SET search_path TO public
STABLE;

COMMENT ON FUNCTION get_account_age_months(UUID) IS 'Returns the age of a user account in months';

-- Function to get contractor age in months (based on oldest member)
CREATE OR REPLACE FUNCTION get_contractor_age_months(UUID) RETURNS int AS
$$
BEGIN
    RETURN (SELECT COALESCE(
                EXTRACT(YEAR FROM AGE(NOW(), MIN(accounts.created_at))) * 12 + 
                EXTRACT(MONTH FROM AGE(NOW(), MIN(accounts.created_at))), 
                0
            )::int as months
            FROM contractor_members
            INNER JOIN accounts ON contractor_members.user_id = accounts.user_id
            WHERE contractor_members.contractor_id = $1);
END;
$$
LANGUAGE plpgsql
    SET search_path TO public
STABLE;

COMMENT ON FUNCTION get_contractor_age_months(UUID) IS 'Returns the age of a contractor in months based on the oldest member account';
