BEGIN;
CREATE OR REPLACE FUNCTION public.get_offer_status(
    uuid, -- session_id
    uuid,-- customer_id
    character varying -- session status
) RETURNS varchar(30)
    LANGUAGE plpgsql
    STABLE
AS
$_$
BEGIN
    IF $3 = 'active' THEN
        RETURN (SELECT (
                           CASE WHEN actor_id = $2 THEN 'to-customer' ELSE 'to-seller' END
                           )
                FROM order_offers
                WHERE session_id = $1
                ORDER BY timestamp DESC
                LIMIT 1);
    ELSE
        RETURN (SELECT status
                FROM order_offers
                WHERE session_id = $1
                ORDER BY timestamp DESC
                LIMIT 1);
    END IF;
END;
$_$;

SELECT get_offer_status(id, customer_id, status) as offer_status, COUNT(*)
FROM offer_sessions GROUP BY offer_status;

SELECT get_offer_status(id, customer_id, status) FROM offer_sessions WHERE id = '69635094-a136-42f6-bb8f-bccab4645b16';

COMMIT;