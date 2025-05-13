SELECT count(*)                            AS total_orders,
       (SELECT COALESCE(sum(orders.cost), 0::numeric) AS "coalesce"
        FROM orders
        WHERE orders.status = 'fulfilled') AS total_order_value
FROM orders t;

SELECT count(*)                                                  AS week_orders,
       (SELECT COALESCE(sum(orders.cost), 0::numeric) AS "coalesce"
        FROM orders
        WHERE orders.status = 'fulfilled'
          AND orders."timestamp" > (now() - '7 days'::interval)) AS week_order_value
FROM orders t
WHERE t."timestamp" > (now() - '7 days'::interval);