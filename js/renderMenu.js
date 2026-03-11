/**
 * FILE: renderMenu.js
 * PURPOSE: Fetches menu items from API and renders them to the DOM with combo support.
 *
 * NOTES:
 * - Fetches from /.netlify/functions/menu and /.netlify/functions/combo-settings
 * - Stores menu items globally in window._rrMenuItems for combo dropdowns
 * - Dynamically imports MenuItem model, falls back to inline HTML if import fails
 * - Categories map to DOM containers: bagels→bagelMenu, schmears→schmearMenu, desserts→dessertMenu
 * - Restores cart quantities from localStorage on load
 * - Handles combo item separately with bagel/schmear selection dropdowns
 * - Uses delegated click handler for +/- quantity buttons
 * - Shows loading indicator with retry button on error
 */

window._rrMenuItems = [];

async function renderCombo(menuItems, comboSettings) {
  const comboSection = document.getElementById('comboSection');
  const comboContainer = document.getElementById('comboContainer');
  if (!comboSection || !comboContainer) return;

  try {
    if (!comboSettings || !comboSettings.isAvailable || comboSettings.price <= 0) {
      comboSection.style.display = 'none';
      return;
    }

    const availableBagels = menuItems.filter(item => 
      item.category?.toLowerCase() === 'bagels' && 
      item.isAvailable !== false &&
      comboSettings.availableBagels.includes(item.id)
    );
    const availableSchmears = menuItems.filter(item => 
      item.category?.toLowerCase() === 'schmears' && 
      item.isAvailable !== false &&
      comboSettings.availableSchmears.includes(item.id)
    );

    if (availableBagels.length === 0 || availableSchmears.length === 0) {
      comboSection.style.display = 'none';
      return;
    }

    // Store combo price globally for cart calculations
    window._rrComboPrice = comboSettings.price;

    comboContainer.innerHTML = `
      <div class="combo-item" data-id="combo_bagel_schmear" data-name="Bagel & Schmear Combo" data-price="${comboSettings.price}">
        <div class="combo-selectors">
          <div class="combo-selector-group">
            <label for="comboBagelSelect">Choose your bagel:</label>
            <select id="comboBagelSelect" class="combo-select" data-type="bagel">
              <option value="">Select a bagel</option>
              ${availableBagels.map(b => `<option value="${b.id}" data-name="${b.name}">${b.name}</option>`).join('')}
            </select>
          </div>
          <div class="combo-selector-group">
            <label for="comboSchmearSelect">Choose your schmear:</label>
            <select id="comboSchmearSelect" class="combo-select" data-type="schmear">
              <option value="">Select a schmear</option>
              ${availableSchmears.map(s => `<option value="${s.id}" data-name="${s.name}">${s.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="combo-info">
          <p class="combo-price">₹${Number(comboSettings.price).toFixed(2)}</p>
          <div class="combo-controls">
            <button class="qty-btn combo-minus" data-id="combo_bagel_schmear" disabled>−</button>
            <span class="qty combo-qty" data-id="combo_bagel_schmear">1</span>
            <button class="qty-btn combo-plus" data-id="combo_bagel_schmear" disabled>+</button>
          </div>
        </div>
        <button class="combo-confirm-btn" disabled>Add to Cart</button>
      </div>
    `;

    comboSection.style.display = 'block';

    const comboMinusBtn = comboContainer.querySelector('.combo-minus');
    const comboPlusBtn = comboContainer.querySelector('.combo-plus');
    const comboQtyEl = comboContainer.querySelector('.combo-qty');
    const confirmBtn = comboContainer.querySelector('.combo-confirm-btn');
    const bagelSelect = document.getElementById('comboBagelSelect');
    const schmearSelect = document.getElementById('comboSchmearSelect');

    function updateComboButtons() {
      const bagelSelected = bagelSelect && bagelSelect.value;
      const schmearSelected = schmearSelect && schmearSelect.value;
      const qty = parseInt(comboQtyEl.textContent) || 1;
      const bothSelected = bagelSelected && schmearSelected;
      
      comboPlusBtn.disabled = !bothSelected;
      comboMinusBtn.disabled = !bothSelected || qty <= 1;
      confirmBtn.disabled = !bothSelected;
    }

    function resetComboSelector() {
      bagelSelect.value = '';
      schmearSelect.value = '';
      comboQtyEl.textContent = '1';
      updateComboButtons();
    }

    bagelSelect.addEventListener('change', updateComboButtons);
    schmearSelect.addEventListener('change', updateComboButtons);

    comboPlusBtn.addEventListener('click', () => {
      if (comboPlusBtn.disabled) return;
      let qty = parseInt(comboQtyEl.textContent) || 1;
      qty++;
      comboQtyEl.textContent = qty;
      updateComboButtons();
    });

    comboMinusBtn.addEventListener('click', () => {
      let qty = parseInt(comboQtyEl.textContent) || 1;
      qty = Math.max(1, qty - 1);
      comboQtyEl.textContent = qty;
      updateComboButtons();
    });

    confirmBtn.addEventListener('click', () => {
      if (confirmBtn.disabled) return;
      
      const bagelId = bagelSelect.value;
      const schmearId = schmearSelect.value;
      const bagelName = bagelSelect.selectedOptions[0]?.dataset?.name || '';
      const schmearName = schmearSelect.selectedOptions[0]?.dataset?.name || '';
      const qty = parseInt(comboQtyEl.textContent) || 1;
      const price = parseFloat(comboContainer.querySelector('.combo-item').dataset.price);
      
      if (typeof addComboToCart === 'function') {
        addComboToCart(bagelId, bagelName, schmearId, schmearName, qty, price);
      }
      
      resetComboSelector();
    });

    updateComboButtons();

  } catch (err) {
    console.warn('Failed to load combo settings', err);
    comboSection.style.display = 'none';
  }
}

async function renderMenu() {
  const grid = document.querySelector('.menu-grid');
  const loader = document.getElementById('menuLoader');
  if (loader) {
    loader.classList.remove('error');
    loader.style.display = '';
    loader.textContent = 'Loading menu…';
  }
  if (!grid) return;

  let MenuItemClass = null;
  try {
    const mod = await import('./models/MenuItem.js');
    MenuItemClass = mod && (mod.default || mod.MenuItem);
  } catch (e) {
    console.warn('Dynamic import of MenuItem failed, falling back to inline renderer', e);
  }

  try {
    const controller = new AbortController();
    const timeoutMs = 8000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    
    const menuUrl = `/.netlify/functions/menu?ts=${Date.now()}`;
    const comboUrl = `/.netlify/functions/combo-settings?ts=${Date.now()}`;
    
    let menuRes, comboRes;
    try {
      [menuRes, comboRes] = await Promise.all([
        fetch(menuUrl, { signal: controller.signal, cache: 'no-store' }),
        fetch(comboUrl, { signal: controller.signal, cache: 'no-store' }).catch(() => null)
      ]);
    } finally {
      clearTimeout(timer);
    }
    
    if (!menuRes || !menuRes.ok) throw new Error('HTTP ' + (menuRes ? menuRes.status : 'NO_RESPONSE'));
    const items = await menuRes.json();
    
    let comboSettings = null;
    if (comboRes && comboRes.ok) {
      try {
        comboSettings = await comboRes.json();
      } catch (e) {
        comboSettings = null;
      }
    }

    window._rrMenuItems = items;

    grid.querySelectorAll('.menu-item').forEach(el => el.remove());

    const categoryMap = {
      'bagels': 'bagelMenu',
      'schmears': 'schmearMenu',
      'desserts': 'dessertMenu'
    };

    items
      .filter(data => data.isAvailable !== false)
      .forEach(data => {
      let html;
      if (MenuItemClass && MenuItemClass.fromData) {
        const mi = MenuItemClass.fromData(data);
        html = mi.renderHTML();
      } else {
        html = `<div class="menu-item" data-id="${data.id}" data-name="${data.name}" data-price="${data.price}">` +
          `${data.imageUrl ? `<img src="${data.imageUrl}" alt="${data.name}" loading="lazy">` : ''}` +
          `<div class="menu-item-info"><h3>${data.name}</h3><p class="price">₹${Number(data.price).toFixed(2)}</p>` +
          `<div class="item-controls"><button class="qty-btn minus" data-id="${data.id}">−</button>` +
          `<span class="qty" data-id="${data.id}">0</span>` +
          `<button class="qty-btn plus" data-id="${data.id}">+</button></div></div></div>`;
      }

      const cat = (data.category || '').trim().toLowerCase();
      const targetId = categoryMap[cat];
      if (targetId) {
        const target = document.getElementById(targetId);
        if (target) target.insertAdjacentHTML('beforeend', html);
        else grid.insertAdjacentHTML('beforeend', html);
      } else {
        grid.insertAdjacentHTML('beforeend', html);
      }
    });

    try {
      const raw = localStorage.getItem('rr_cart');
      if (raw) {
        const cart = JSON.parse(raw);
        (cart.items || []).forEach(it => {
          const qEl = document.querySelector(`.qty[data-id="${it.id}"]`);
          if (qEl) qEl.textContent = it.qty;
        });
      }
    } catch (e) {}

    if (!grid._rr_init) {
      grid.addEventListener('click', function (e) {
        const btn = e.target.closest('.qty-btn');
        if (!btn) return;
        if (btn.classList.contains('combo-plus') || btn.classList.contains('combo-minus')) return;
        const id = btn.dataset.id;
        const qtyEl = document.querySelector(`.qty[data-id="${id}"]`);
        let qty = parseInt(qtyEl.textContent) || 0;
        if (btn.classList.contains('plus')) qty++; else qty = Math.max(0, qty - 1);
        qtyEl.textContent = qty;
        if (typeof updateCart === 'function') updateCart();
      });
      grid._rr_init = true;
    }

    if (loader) loader.style.display = 'none';

    await renderCombo(items, comboSettings);

    if (typeof updateCart === 'function') updateCart();
  } catch (err) {
    console.error('Failed to load menu.json', err);
    if (loader) {
      loader.classList.add('error');
      const msg = (err && err.name === 'AbortError') ? 'Request timed out' : (err && err.message) || 'Failed to load';
      loader.innerHTML = `${msg}. <button id="menuRetry">Retry</button>`;
      const retryBtn = document.getElementById('menuRetry');
      if (retryBtn) retryBtn.addEventListener('click', () => renderMenu());
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderMenu);
} else {
  renderMenu();
}