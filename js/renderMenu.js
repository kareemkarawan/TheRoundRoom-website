// Attempt to dynamically import MenuItem if modules are supported, but don't fail if import is blocked

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
    // Use a relative path and a timeout to avoid hanging fetches (file:// and network issues)
    const controller = new AbortController();
    const timeoutMs = 8000; // 8s
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch('data/menu.json', { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res || !res.ok) throw new Error('HTTP ' + (res ? res.status : 'NO_RESPONSE'));
    const items = await res.json();

    // Remove existing dynamic menu-item nodes, leave section headers intact
    grid.querySelectorAll('.menu-item').forEach(el => el.remove());

    // map categories -> container ids (lowercased keys)
    const categoryMap = {
      'bagels': 'bagelMenu',
      'schmears': 'schmearMenu',
      'desserts': 'dessertMenu'
    };

    items.forEach(data => {
      let html;
      if (MenuItemClass && MenuItemClass.fromData) {
        const mi = MenuItemClass.fromData(data);
        html = mi.renderHTML();
      } else {
        // fallback minimal HTML if MenuItem isn't available
        html = `<div class="menu-item" data-id="${data.id}" data-name="${data.name}" data-price="${data.price}">` +
          `${data.image ? `<img src="${data.image}" alt="${data.name}">` : ''}` +
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