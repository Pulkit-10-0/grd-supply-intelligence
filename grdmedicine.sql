CREATE DATABASE grd;
USE grd;

ALTER TABLE products   ADD PRIMARY KEY (sku_id);
ALTER TABLE locations  ADD PRIMARY KEY (location_id);
ALTER TABLE daily_log  ADD PRIMARY KEY (date, location_id, sku_id);
ALTER TABLE orders     ADD PRIMARY KEY (order_id);
ALTER TABLE shipments  ADD PRIMARY KEY (shipment_id);

ALTER TABLE daily_log ADD FOREIGN KEY (sku_id) REFERENCES products(sku_id);
ALTER TABLE daily_log ADD FOREIGN KEY (location_id) REFERENCES locations(location_id);

SELECT location_id,
       ROUND(100 * SUM(fulfilled_qty) / SUM(requested_qty), 1) AS fill_rate_pct,
       SUM(requested_qty > fulfilled_qty) AS stockout_days
FROM daily_log
GROUP BY location_id;

SELECT location_id, sku_id, week, weekly_demand,
       ROUND(AVG(weekly_demand) OVER (
           PARTITION BY location_id, sku_id
           ORDER BY week
           ROWS BETWEEN 4 PRECEDING AND 1 PRECEDING), 1) AS prev4_avg
FROM (SELECT location_id, sku_id, YEARWEEK(date, 1) AS week,
             SUM(requested_qty) AS weekly_demand
      FROM daily_log
      GROUP BY location_id, sku_id, YEARWEEK(date, 1)) w
WHERE sku_id = 'N02BE' AND location_id = 'DIST_SIL'
ORDER BY week DESC
LIMIT 10;

SELECT destination, sku_id, COUNT(*) AS late_shipments,
       ROUND(AVG(DATEDIFF(actual_arrival, expected_arrival)), 1) AS avg_days_late
FROM shipments
WHERE actual_arrival > expected_arrival
GROUP BY destination, sku_id
ORDER BY avg_days_late DESC;