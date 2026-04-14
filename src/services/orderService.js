/**
 * Order Service — Webshop API
 * Handles order creation, total calculation, and status updates.
 */

const db = require("../db");

/**
 * Calculate the total for an order based on its line items.
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

    total += product.rows[0].price * item.quantity;
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

    await db.query(
      "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)",
      [orderId, item.productId, item.quantity, product.rows[0].price]
    );

    // Decrease stock
    await db.query(
      "UPDATE products SET stock = stock - $1 WHERE id = $2",
      [item.quantity, item.productId]
    );
  }

  return { orderId, total };
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

module.exports = { calculateOrderTotal, createOrder, updateOrderStatus };
