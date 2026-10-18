"""Data-quality checks: the platform's rules, checked against whatever is in the database.

    python afm.py db check

Each check is a query that returns the rows breaking a rule; none returned means PASS. Works on synthetic data and,
later, on real data. Prints PASS/FAIL lines like the tests and returns 1 if any check fails.
"""
from __future__ import annotations

CHECKS: list[tuple[str, str]] = [
    ('The database has data to check (tenants, products, orders)', """
        SELECT 'empty' WHERE NOT EXISTS (SELECT 1 FROM tenants) OR NOT EXISTS (SELECT 1 FROM products)
                          OR NOT EXISTS (SELECT 1 FROM orders)"""),
    ('Order subtotal equals the sum of its lines', """
        SELECT o.id FROM orders o JOIN order_lines l ON l.order_id = o.id
        GROUP BY o.id, o.subtotal_paise HAVING sum(l.line_total_paise) <> o.subtotal_paise"""),
    ('Every order has at least one line', """
        SELECT o.id FROM orders o WHERE NOT EXISTS (SELECT 1 FROM order_lines l WHERE l.order_id = o.id)"""),
    ('GST included in an order is less than its subtotal', """
        SELECT id FROM orders WHERE tax_paise >= subtotal_paise AND subtotal_paise > 0"""),
    ('Line prices match the product price on the day of the order', """
        SELECT o.id, l.sku FROM orders o JOIN order_lines l ON l.order_id = o.id
        JOIN products p ON p.tenant_id = l.tenant_id AND p.sku = l.sku
        WHERE l.unit_price_paise <> coalesce(
            (SELECT h.new_paise FROM price_history h WHERE h.tenant_id = l.tenant_id AND h.sku = l.sku
             AND h.changed_at <= o.placed_at ORDER BY h.changed_at DESC LIMIT 1),
            (SELECT h.old_paise FROM price_history h WHERE h.tenant_id = l.tenant_id AND h.sku = l.sku
             ORDER BY h.changed_at LIMIT 1),
            p.price_paise)"""),
    ('Current price equals the last price change', """
        SELECT p.sku FROM products p JOIN LATERAL (SELECT new_paise FROM price_history h
            WHERE h.tenant_id = p.tenant_id AND h.sku = p.sku ORDER BY changed_at DESC LIMIT 1) last ON true
        WHERE last.new_paise <> p.price_paise"""),
    ('Stock on hand equals the sum of its movements', """
        SELECT s.location_id, s.sku FROM stock_levels s
        LEFT JOIN stock_movements m USING (tenant_id, location_id, sku)
        GROUP BY s.tenant_id, s.location_id, s.sku, s.on_hand HAVING coalesce(sum(m.qty_change), 0) <> s.on_hand"""),
    ('Reserved stock equals the open reservations', """
        SELECT s.location_id, s.sku FROM stock_levels s
        LEFT JOIN stock_reservations r ON r.tenant_id = s.tenant_id AND r.location_id = s.location_id
             AND r.sku = s.sku AND r.released_at IS NULL
        GROUP BY s.tenant_id, s.location_id, s.sku, s.reserved HAVING coalesce(sum(r.qty), 0) <> s.reserved"""),
    ('Open reservations belong to open orders', """
        SELECT r.order_id FROM stock_reservations r JOIN orders o ON o.id = r.order_id
        WHERE r.released_at IS NULL AND o.status NOT IN ('received', 'confirmed', 'packed', 'partially_unavailable')"""),
    ('Plan orders fall on the day before the plan delivery day', """
        SELECT o.id FROM orders o JOIN delivery_plans p ON p.id = o.plan_id
        WHERE (p.cadence = 'weekly' AND extract(isodow FROM (o.placed_at AT TIME ZONE 'Asia/Kolkata') + interval '1 day') <> p.delivery_day)
           OR (p.cadence = 'monthly' AND extract(day FROM (o.placed_at AT TIME ZONE 'Asia/Kolkata') + interval '1 day') <> p.delivery_day)"""),
    ('Plan orders are for the plan customer and store', """
        SELECT o.id FROM orders o JOIN delivery_plans p ON p.id = o.plan_id
        WHERE o.customer_id <> p.customer_id OR o.location_id <> p.location_id"""),
    ('Each order is paid in full by one payment', """
        SELECT o.id FROM orders o LEFT JOIN payments p ON p.order_id = o.id
        GROUP BY o.id, o.total_paise HAVING count(p.id) <> 1 OR sum(p.amount_paise) <> o.total_paise"""),
    ('Refunds never exceed the payment', """
        SELECT p.id FROM payments p JOIN refunds r ON r.payment_id = p.id AND r.status IN ('approved', 'paid')
        GROUP BY p.id, p.amount_paise HAVING sum(r.amount_paise) > p.amount_paise"""),
    ('Paid refunds mark the payment refunded', """
        SELECT r.id FROM refunds r JOIN payments p ON p.id = r.payment_id
        WHERE r.status = 'paid' AND p.status NOT IN ('refunded', 'partially_refunded')"""),
    ('Decided refunds have a first approval; open requests have none', """
        SELECT r.id FROM refunds r LEFT JOIN refund_approvals a ON a.refund_id = r.id AND a.step = 1
        WHERE (r.status = 'requested') <> (a.refund_id IS NULL)"""),
    ('First approver is the owner or a Payment approver within their limit', """
        SELECT r.id FROM refunds r JOIN refund_approvals a ON a.refund_id = r.id AND a.step = 1
        WHERE NOT EXISTS (SELECT 1 FROM staff_role_assignments x WHERE x.user_id = a.approver_id AND x.role = 'tenant_owner')
          AND NOT EXISTS (SELECT 1 FROM staff_role_assignments x JOIN staff_limits l ON l.user_id = x.user_id
                          AND l.limit_name = 'refund_paise'
                          WHERE x.user_id = a.approver_id AND x.role = 'payment_approver' AND l.value >= r.amount_paise)"""),
    ('Refunds above Rs 25,000 have a second, different approver', """
        SELECT r.id FROM refunds r JOIN refund_approvals a1 ON a1.refund_id = r.id AND a1.step = 1 AND a1.decision = 'approved'
        LEFT JOIN refund_approvals a2 ON a2.refund_id = r.id AND a2.step = 2
        WHERE r.amount_paise > 2500000 AND (a2.approver_id IS NULL OR a2.approver_id = a1.approver_id)"""),
    ('Refund requests come from Customer support', """
        SELECT r.id FROM refunds r WHERE NOT EXISTS (SELECT 1 FROM staff_role_assignments x
            WHERE x.user_id = r.requested_by AND x.role = 'customer_support')"""),
    ('Store roles have at least one store', """
        SELECT x.user_id FROM staff_role_assignments x WHERE x.role IN ('cashier', 'store_manager')
          AND NOT EXISTS (SELECT 1 FROM staff_store_access s WHERE s.user_id = x.user_id)"""),
    ('Conflicting roles are never held together (Procurement with Finance)', """
        SELECT a.user_id FROM staff_role_assignments a JOIN staff_role_assignments b ON a.user_id = b.user_id
        WHERE a.role = 'procurement' AND b.role = 'finance'"""),
    ('Temporary roles last at most 30 days', """
        SELECT user_id, role FROM staff_role_assignments WHERE valid_until > granted_at + interval '30 days'"""),
    ('Connector-channel orders come through that channel''s connection', """
        SELECT o.id FROM orders o JOIN channel_connections c ON c.id = o.connection_id WHERE c.channel <> o.channel"""),
    ('Listed products show a quantity no higher than available stock', """
        SELECT l.connection_id, l.sku FROM channel_listings l
        WHERE l.listing_status = 'listed' AND l.last_qty_sent > (
            SELECT coalesce(sum(a.available), 0) FROM channel_available_stock a WHERE a.tenant_id = l.tenant_id AND a.sku = l.sku)"""),
    ('Webhooks with a bad signature are never processed', """
        SELECT id FROM webhook_events WHERE NOT signature_valid AND result = 'processed'"""),
    ('Shipped and delivered orders have a shipment', """
        SELECT o.id FROM orders o WHERE o.channel <> 'pos' AND o.status IN ('shipped', 'delivered', 'returned')
          AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id)"""),
    ('Riders deliver only from their own store', """
        SELECT s.id FROM shipments s JOIN staff_users u ON u.id = s.rider_id
        WHERE s.rider_id IS NOT NULL AND u.tenant_id <> s.tenant_id"""),
]


def run_checks(conn) -> int:
    failed = 0
    with conn.cursor() as cur:
        for name, sql in CHECKS:
            cur.execute(f'SELECT count(*), (array_agg(row_to_json(t)))[1:3] FROM ({sql}) t')
            n, sample = cur.fetchone()
            print(f'{"PASS" if n == 0 else "FAIL"} {name} | {n} row(s) breaking it' + (f', e.g. {sample}' if n else ''))
            failed += n > 0
    print(f'\n{len(CHECKS) - failed}/{len(CHECKS)} checks passed')
    return 1 if failed else 0
