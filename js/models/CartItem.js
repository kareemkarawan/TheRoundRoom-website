/**
 * FILE: CartItem.js
 * PURPOSE: Lightweight model for cart items with quantity management and serialization.
 *
 * NOTES:
 * - Constructor accepts item object { id, name, price } and optional qty
 * - increment(amount)/decrement(amount) modify quantity (min 0)
 * - setQty(n) sets exact quantity
 * - itemTotal getter returns price * qty rounded to 2 decimals
 * - toPlainObject() returns serializable object for localStorage/network
 * - Static fromPlainObject(obj) creates instance from stored data
 * - renderHTML() generates .cart-item DOM string with escaped values
 * - Exported as ES module and CommonJS, attached to window.CartItem
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

  increment(amount = 1) {
    this.qty = Math.max(0, this.qty + Number(amount));
    return this;
  }

  decrement(amount = 1) {
    this.qty = Math.max(0, this.qty - Number(amount));
    return this;
  }

  setQty(n) {
    this.qty = Math.max(0, Number(n) || 0);
    return this;
  }

  get itemTotal() {
    return Math.round((this.price * this.qty) * 100) / 100;
  }

  toPlainObject() {
    return {
      id: this.id,
      name: this.name,
      price: this.price,
      qty: this.qty,
      itemTotal: Number(this.itemTotal.toFixed(2))
    };
  }

  static fromPlainObject(obj = {}) {
    return new CartItem(obj, obj.qty);
  }

  renderHTML() {
    return `<div class="cart-item" data-id="${escapeHtml(this.id)}">` +
           `<span>${escapeHtml(String(this.qty))}x ${escapeHtml(this.name)}</span>` +
           `<span>₹${Number(this.itemTotal).toFixed(2)}</span>` +
           `</div>`;
  }
}

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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CartItem;
}

try { window.CartItem = CartItem; } catch (e) {}
