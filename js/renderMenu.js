// Attempt to dynamically import MenuItem if modules are supported, but don't fail if import is blocked

// Global store for menu items (needed for combo dropdowns)
window._rrMenuItems = [];

async function renderCombo(menuItems) {
  const comboSection = document.getElementById('comboSection');
  const comboContainer = document.getElementById('comboContainer');
  if (!comboSection || !comboContainer) return;

  try {
    const res = await fetch('/.netlify/functions/combo-settings');
    if (!res.ok) throw new Error('Failed to fetch combo settings');
    const comboSettings = await res.json();

    if (!comboSettings.isAvailable || comboSettings.price <= 0) {
      comboSection.style.display = 'none';
      return;
    }

    // Filter available bagels and schmears from menu
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

    // Render combo selector
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
            <span class="qty combo-qty" data-id="combo_bagel_schmear">0</span>
            <button class="qty-btn combo-plus" data-id="combo_bagel_schmear">+</button>
          </div>
        </div>
      </div>
    `;

    comboSection.style.display = 'block';

    // Restore combo from cart if saved
    try {
      const raw = localStorage.getItem('rr_cart');
      if (raw) {
        const cart = JSON.parse(raw);
        const comboItem = (cart.items || []).find(it => it.id === 'combo_bagel_schmear');
        if (comboItem && comboItem.qty > 0) {
          const qtyEl = comboContainer.querySelector('.combo-qty');
          if (qtyEl) qtyEl.textContent = comboItem.qty;
          // Restore selections if present
          if (comboItem.bagelId) {
            const bagelSelect = document.getElementById('comboBagelSelect');
            if (bagelSelect) bagelSelect.value = comboItem.bagelId;
          }
          if (comboItem.schmearId) {
            const schmearSelect = document.getElementById('comboSchmearSelect');
            if (schmearSelect) schmearSelect.value = comboItem.schmearId;
          }
        }
      }
    } catch (e) {
      // ignore
    }

    // Attach combo button handlers
    const comboMinusBtn = comboContainer.querySelector('.combo-minus');
    const comboPlusBtn = comboContainer.querySelector('.combo-plus');
    const comboQtyEl = comboContainer.querySelector('.combo-qty');
    const bagelSelect = document.getElementById('comboBagelSelect');
    const schmearSelect = document.getElementById('comboSchmearSelect');

    function updateComboButtons() {
      const bagelSelected = bagelSelect && bagelSelect.value;
      const schmearSelected = schmearSelect && schmearSelect.value;
      const qty = parseInt(comboQtyEl.textContent) || 0;
      
      // Enable plus only if both selections are made
      comboPlusBtn.disabled = !bagelSelected || !schmearSelected;
      // Enable minus only if qty > 0
      comboMinusBtn.disabled = qty === 0;
    }

    bagelSelect.addEventListener('change', () => {
      updateComboButtons();
      if (typeof updateCart === 'function') updateCart();
    });
    schmearSelect.addEventListener('change', () => {
      updateComboButtons();
      if (typeof updateCart === 'function') updateCart();
    });

    comboPlusBtn.addEventListener('click', () => {
      if (comboPlusBtn.disabled) return;
      let qty = parseInt(comboQtyEl.textContent) || 0;
      qty++;
      comboQtyEl.textContent = qty;
      updateComboButtons();
      if (typeof updateCart === 'function') updateCart();
    });

    comboMinusBtn.addEventListener('click', () => {
      let qty = parseInt(comboQtyEl.textContent) || 0;
      qty = Math.max(0, qty - 1);
      comboQtyEl.textContent = qty;
      updateComboButtons();
      if (typeof updateCart === 'function') updateCart();
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

  // Try dynamic import, but continue if it fails (e.g., file:// restrictions)
  let MenuItemClass = null;
  try {
    const mod = await import('./models/MenuItem.js');
    MenuItemClass = mod && (mod.default || mod.MenuItem);
  } catch (e) {
    // dynamic import failed — we'll fall back to rendering bare HTML
    console.warn('Dynamic import of MenuItem failed, falling back to inline renderer', e);
  }

  try {
    // Fetch from MongoDB API instead of JSON file
    const controller = new AbortController();
    const timeoutMs = 8000; // 8s
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    const forceRefresh = (() => {
      try { return localStorage.getItem('rr_menu_force_refresh') === '1'; } catch (e) { return false; }
    })();
    const menuUrl = forceRefresh ? `/.netlify/functions/menu?ts=${Date.now()}` : '/.netlify/functions/menu';
    try {
      res = await fetch(menuUrl, { signal: controller.signal, cache: forceRefresh ? 'no-store' : 'default' });
    } finally {
      clearTimeout(timer);
    }
    if (forceRefresh) {
      try { localStorage.removeItem('rr_menu_force_refresh'); } catch (e) { /* ignore */ }
    }
    if (!res || !res.ok) throw new Error('HTTP ' + (res ? res.status : 'NO_RESPONSE'));
    const items = await res.json();

    // Store items globally for combo dropdown access
    window._rrMenuItems = items;

    // Remove existing dynamic menu-item nodes, leave section headers intact
    grid.querySelectorAll('.menu-item').forEach(el => el.remove());

    // map categories -> container ids (lowercased keys)
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
        // fallback minimal HTML if MenuItem isn't available
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
        // unknown category -> append to main grid as fallback
        grid.insertAdjacentHTML('beforeend', html);
      }
    });

    // Restore quantities from saved cart (if any)
    try {
      const raw = localStorage.getItem('rr_cart');
      if (raw) {
        const cart = JSON.parse(raw);
        (cart.items || []).forEach(it => {
          const qEl = document.querySelector(`.qty[data-id="${it.id}"]`);
          if (qEl) qEl.textContent = it.qty;
        });
      }
    } catch (e) {
      // ignore
    }

    // attach delegated handler once
    if (!grid._rr_init) {
      grid.addEventListener('click', function (e) {
        const btn = e.target.closest('.qty-btn');
        if (!btn) return;
        // Skip combo buttons - they have their own handlers
        if (btn.classList.contains('combo-plus') || btn.classList.contains('combo-minus')) return;
        const id = btn.dataset.id;
        const qtyEl = document.querySelector(`.qty[data-id="${id}"]`);
        let qty = parseInt(qtyEl.textContent) || 0;
        if (btn.classList.contains('plus')) qty++; else qty = Math.max(0, qty - 1);
        qtyEl.textContent = qty;
        // call global updateCart defined in script.js
        if (typeof updateCart === 'function') updateCart();
      });
      grid._rr_init = true;
    }

    // hide loader
    if (loader) loader.style.display = 'none';

    // Render combo section
    await renderCombo(items);

    // initial update
    if (typeof updateCart === 'function') updateCart();
  } catch (err) {
    console.error('Failed to load menu.json', err);
    if (loader) {
      loader.classList.add('error');
      // show a clearer error message including error type
      const msg = (err && err.name === 'AbortError') ? 'Request timed out' : (err && err.message) || 'Failed to load';
      loader.innerHTML = `${msg}. <button id="menuRetry">Retry</button>`;
      const retryBtn = document.getElementById('menuRetry');
      if (retryBtn) retryBtn.addEventListener('click', () => renderMenu());
    }
  }
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderMenu);
} else {
  renderMenu();
}