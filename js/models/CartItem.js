/**
 * CartItem — lightweight model for items inside the cart.
 * Works nicely with MenuItem (you can pass MenuItem.toCartObject() data or a plain object).
 * Exported as ES module and attached to window.CartItem for legacy scripts.
 */

class CartItem {
  /**
   * @param {Object} item - plain object with { id, name, price } or a MenuItem
   * @param {number} qty
   */
  constructor(item = {}, qty = 1) {
    this.id = String(item.id ?? itemId(item) ?? '');
    this.name = item.name || '';
    this.price = Number(item.price || 0);
    this.qty = Number(qty) || Number(item.qty) || 0;
  }

  // Increase quantity
  increment(amount = 1) {
    this.qty = Math.max(0, this.qty + Number(amount));
    return this;
  }

  // Decrease quantity
  decrement(amount = 1) {
    this.qty = Math.max(0, this.qty - Number(amount));
    return this;
  }

  // Set exact quantity
  setQty(n) {
    this.qty = Math.max(0, Number(n) || 0);
    return this;
  }

  // Read-only computed total (rounded to 2 decimals)
  get itemTotal() {
    return Math.round((this.price * this.qty) * 100) / 100;
  }

  // Produce a plain serializable object for storage (localStorage / network)
  toPlainObject() {
    return {
      id: this.id,
      name: this.name,
      price: this.price,
      qty: this.qty,
      itemTotal: Number(this.itemTotal.toFixed(2))
    };
  }

  // Useful for creating instance from stored data
  static fromPlainObject(obj = {}) {
    return new CartItem(obj, obj.qty);
  }

  // Render HTML snippet for the cart list (matches .cart-item used in pages)
  renderHTML() {
    return `<div class="cart-item" data-id="${escapeHtml(this.id)}">` +
           `<span>${escapeHtml(String(this.qty))}x ${escapeHtml(this.name)}</span>` +
           `<span>₹${Number(this.itemTotal).toFixed(2)}</span>` +
           `</div>`;
  }
}

// helpers
function itemId(item) {
  try { return item && (item.id || itemIdFromData(item)); } catch (e) { return undefined; }
}
function itemIdFromData(o) {
  return o && (o.dataset && o.dataset.id) ? o.dataset.id : undefined;
}
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// CommonJS fallback
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CartItem;
}

// Attach to window and export as ES module
try { window.CartItem = CartItem; } catch (e) { /* ignore in non-browser env */ }

export default CartItem;
