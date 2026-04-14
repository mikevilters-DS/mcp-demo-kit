/**
 * Order Service — Webshop API
 * Handles order creation, total calculation, and status updates.
 *
 * CHANGELOG:
 *   2026-04-10  Added bulk discount calculation (SHOP-142)
 */

const db = require("../db");

/**
 * Calculate the total for an order based on its line items.
 * Now includes bulk discount: 5+ items of the same product = 10% off that line.
 *
 * @param {Array} items - Array of { productId, quantity }
 * @returns {number} The calculated order total
 */
async function calculateOrderTotal(items) {
  let total = 0;

  for (const item of items) {
    const product = await db.query(
      "SELECT price FROM products WHERE id = $1",
      [item.productId]
    );

    if (!product.rows.length) {
      throw new Error(`Product ${item.productId} not found`);
    }

    let lineTotal = product.rows[0].price * item.quantity;

    // ──────────────────────────────────────────────────────
    // BUG 1: Discount applied when quantity >= 2, but the
    //        ticket (SHOP-142) said threshold should be 5.
    //        Developer typed "2" instead of "5" while testing
    //        locally and forgot to change it back.
    // ──────────────────────────────────────────────────────
    if (item.quantity >= 2) {
      lineTotal = lineTotal * 0.9; // 10% off
    }

    total += lineTotal;
  }

  return Math.round(total * 100) / 100;
}

/**
 * Create a new order.
 */
async function createOrder(userId, items) {
  const total = await calculateOrderTotal(items);

  const order = await db.query(
    "INSERT INTO orders (user_id, order_total, status) VALUES ($1, $2, 'pending') RETURNING id",
    [userId, total]
  );

  const orderId = order.rows[0].id;

  for (const item of items) {
    const product = await db.query(
      "SELECT price FROM products WHERE id = $1",
      [item.productId]
    );

    // ──────────────────────────────────────────────────────
    // BUG 2: unit_price is stored at full price, but the
    //        order_total was calculated WITH the discount.
    //        So order_total != SUM(quantity * unit_price).
    //        The order_items table and the orders table now
    //        disagree on how much the customer should pay.
    // ──────────────────────────────────────────────────────
    await db.query(
      "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)",
      [orderId, item.productId, item.quantity, product.rows[0].price]
    );

    // ──────────────────────────────────────────────────────
    // BUG 3: No stock check before decrementing.
    //        If stock is 0 or less, this happily goes negative.
    //        Should have checked: "WHERE id = $2 AND stock >= $1"
    //        and thrown an error if no rows updated.
    // ──────────────────────────────────────────────────────
    await db.query(
      "UPDATE products SET stock = stock - $1 WHERE id = $2",
      [item.quantity, item.productId]
    );
  }

  return { orderId, total };
}

/**
 * Apply bulk discount retroactively to existing orders.
 *
 * ──────────────────────────────────────────────────────
 * BUG 4: This function was run once as a migration to
 *        "fix" old orders, but it recalculated totals
 *        using the buggy threshold (qty >= 2 instead of 5).
 *        It updated orders.order_total but NOT order_items,
 *        so now the mismatch is baked into the database.
 *        This is how orders #2 and #4 got corrupted.
 * ──────────────────────────────────────────────────────
 */
async function applyBulkDiscountRetroactively() {
  const orders = await db.query(`
    SELECT o.id, oi.product_id, oi.quantity, oi.unit_price
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.status != 'delivered'
  `);

  const orderTotals = {};

  for (const row of orders.rows) {
    let lineTotal = row.unit_price * row.quantity;

    if (row.quantity >= 2) {
      lineTotal = lineTotal * 0.9;
    }

    if (!orderTotals[row.id]) {
      orderTotals[row.id] = 0;
    }
    orderTotals[row.id] += lineTotal;
  }

  for (const [orderId, newTotal] of Object.entries(orderTotals)) {
    const rounded = Math.round(newTotal * 100) / 100;
    await db.query("UPDATE orders SET order_total = $1 WHERE id = $2", [
      rounded,
      orderId,
    ]);
  }

  console.log(`Updated ${Object.keys(orderTotals).length} orders`);
}

/**
 * Update order status.
 */
async function updateOrderStatus(orderId, status) {
  const validStatuses = ["pending", "processing", "shipped", "delivered"];

  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  await db.query("UPDATE orders SET status = $1 WHERE id = $2", [
    status,
    orderId,
  ]);
}

module.exports = {
  calculateOrderTotal,
  createOrder,
  updateOrderStatus,
  applyBulkDiscountRetroactively,
};
