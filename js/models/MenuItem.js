/**
 * MenuItem — lightweight model + renderer for menu items
 * Provides helpers to create instances from DOM elements or plain data,
 * render HTML, and produce a minimal cart object.
 *
 * Designed to be usable as an ES module (export default) and attach to
 * window.MenuItem for legacy usage.
 */

class MenuItem {
  /**
   * @param {Object} opts
   * @param {string|number} opts.id
   * @param {string} opts.name
   * @param {number} opts.price
  * @param {string} [opts.image]
  * @param {string} [opts.imageUrl]
   * @param {string} [opts.description]
   * @param {number} [opts.stock]
   */
  constructor({ id, name, price, image = '', imageUrl = '', description = '', stock = Infinity } = {}) {
    this.id = String(id);
    this.name = name || '';
    this.price = Number(price) || 0;
    this.image = imageUrl || image;
    this.description = description;
    this.stock = typeof stock === 'number' ? stock : Infinity;
  }

  // Returns a plain object suitable for storing in a cart or serializing
  toCartObject(qty = 1) {
    return {
      id: this.id,
      name: this.name,
      price: this.price,
      qty: Number(qty),
      itemTotal: Number((this.price * qty).toFixed(2))
    };
  }

  // Render a menu-item DOM element (string) used by our page markup
  renderHTML() {
    return `
      <div class="menu-item" data-id="${this.id}" data-name="${this.name}" data-price="${this.price}">
        ${this.image ? `<img src="${this.image}" alt="${this.name}">` : ''}
        <div class="menu-item-info">
          <h3>${this.name}</h3>
          <p class="price">₹${this.price.toFixed(2)}</p>
          <div class="item-controls">
            <button class="qty-btn minus" data-id="${this.id}">−</button>
            <span class="qty" data-id="${this.id}">0</span>
            <button class="qty-btn plus" data-id="${this.id}">+</button>
          </div>
        </div>
      </div>
    `.trim();
  }

  // Create instance from a DOM element (.menu-item)
  static fromElement(el) {
    if (!el) return null;
    const id = el.dataset.id;
    const name = el.dataset.name || el.querySelector('h3')?.textContent || '';
    const price = parseFloat(el.dataset.price || el.querySelector('.price')?.textContent?.replace(/[₹,\s]/g, '') || 0);
    const img = el.querySelector('img')?.getAttribute('src') || '';
    const desc = el.dataset.description || '';
    return new MenuItem({ id, name, price, image: img, description: desc });
  }

  // Create an instance from a plain data object
  static fromData(obj) {
    return new MenuItem(obj);
  }

  // Find all .menu-item elements and return instances
  static allFromDOM(root = document) {
    return Array.from(root.querySelectorAll('.menu-item')).map(el => MenuItem.fromElement(el));
  }
}

export default MenuItem;
