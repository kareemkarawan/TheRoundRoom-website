(function () {
  const STORAGE_KEY = 'rr_admin_token';

  function getStoredToken() {
    return localStorage.getItem(STORAGE_KEY) || '';
  }

  function setStoredToken(token) {
    if (token) localStorage.setItem(STORAGE_KEY, token);
  }

  function clearStoredToken() {
    localStorage.removeItem(STORAGE_KEY);
  }

  async function verifyAdminToken(token) {
    try {
      const response = await fetch('/.netlify/functions/settings?admin=1', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token }
      });
      return response.ok;
    } catch (e) {
      console.error('[admin-gate] Token verification failed:', e);
      return false;
    }
  }

  function ensureGate() {
    let gate = document.getElementById('adminGate');
    if (gate) return gate;

    gate = document.createElement('div');
    gate.id = 'adminGate';
    gate.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.85); color:#fff; z-index:5000; display:flex; align-items:center; justify-content:center;';
    gate.innerHTML = `
      <div style="max-width:360px; width:90%; background:#111; padding:1.5rem; border-radius:8px; text-align:center;">
        <h3 style="margin-top:0;">Admin Access</h3>
        <p class="muted" style="color:#ccc;">Enter admin token to continue.</p>
        <input type="password" id="adminTokenInput" placeholder="Admin token" style="width:100%; padding:0.6rem; margin:0.75rem 0;">
        <button id="adminTokenBtn" class="btn" style="width:100%;">Unlock</button>
        <p id="adminGateError" style="color:#ffb3b3; margin-top:0.75rem; display:none;">Invalid token.</p>
      </div>
    `;

    document.body.appendChild(gate);
    return gate;
  }

  function showGate() {
    const gate = ensureGate();
    gate.style.display = 'flex';
  }

  function hideGate() {
    const gate = ensureGate();
    gate.style.display = 'none';
  }

  async function requireAdminAccess(onUnlock) {
    const token = getStoredToken();
    if (token && await verifyAdminToken(token)) {
      hideGate();
      if (typeof onUnlock === 'function') onUnlock();
      return;
    }

    showGate();
    const input = document.getElementById('adminTokenInput');
    const error = document.getElementById('adminGateError');
    const btn = document.getElementById('adminTokenBtn');

    const attemptUnlock = async () => {
      const value = input.value.trim();
      if (!value) return;
      const ok = await verifyAdminToken(value);
      if (ok) {
        setStoredToken(value);
        hideGate();
        console.debug('[admin-gate] Admin unlocked');
        if (typeof onUnlock === 'function') onUnlock();
        return;
      }
      error.style.display = 'block';
    };

    btn.onclick = attemptUnlock;
    input.onkeypress = (e) => { if (e.key === 'Enter') attemptUnlock(); };
  }

  function getToken() {
    return getStoredToken();
  }

  function lock() {
    clearStoredToken();
    showGate();
  }

  window.AdminGate = { requireAdminAccess, getToken, lock };
})();
