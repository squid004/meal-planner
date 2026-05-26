'use strict';

// ── View registry ──────────────────────────────────────────────────────────────
// Each module registers itself here with an onShow() callback
const views = {};

function registerView(name, callbacks) {
  views[name] = callbacks;
}

// ── Navigation ─────────────────────────────────────────────────────────────────
let currentView = 'recipes';

function showView(name) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));

  const viewEl = document.getElementById(`view-${name}`);
  const tabEl  = document.querySelector(`.nav-tab[data-view="${name}"]`);
  if (!viewEl) return;

  viewEl.classList.add('active');
  if (tabEl) tabEl.classList.add('active');
  currentView = name;

  if (views[name]?.onShow) views[name].onShow();
}

// ── Modal helpers ──────────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// ── Modal tab switching ────────────────────────────────────────────────────────
function initModalTabs() {
  document.querySelectorAll('.modal-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-box');
      modal.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
      modal.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      modal.querySelector(`#tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

// ── Init ───────────────────────────────────────────────────────────────────────
async function init() {
  // Wire nav
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  // Wire modal close buttons (data-close attribute)
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  // Close modal when clicking overlay
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', () => {
      const modal = overlay.closest('.modal');
      if (modal) closeModal(modal.id);
    });
  });

  initModalTabs();

  // Init each module
  await DB.init();
  Recipes.init();
  Select.init();
  Shopping.init();
  Ratings.init();
  AI.init();
  Settings.init();

  showView('recipes');
}

// ── Settings view (lightweight, lives in app.js) ───────────────────────────────
const Settings = {
  init() {
    registerView('settings', { onShow: () => Settings.render() });
  },

  render() {
    const el = document.getElementById('view-settings');
    const keySet = !!localStorage.getItem('claude_api_key');
    const supaUrl  = DB.SUPABASE_URL || '(not configured)';

    el.innerHTML = `
      <div class="page-header"><h1>Settings</h1></div>

      <div class="settings-section">
        <h2>Claude AI (recipe suggestions)</h2>
        <div class="field">
          <label for="api-key-input">Anthropic API key</label>
          <input type="password" id="api-key-input"
            placeholder="sk-ant-..."
            value="${localStorage.getItem('claude_api_key') || ''}"
            autocomplete="off">
        </div>
        <div class="settings-row">
          <span class="key-indicator ${keySet ? 'set' : ''}">${keySet ? 'Key saved' : 'Not set'}</span>
          <button class="btn-primary btn-sm" id="save-key-btn">Save key</button>
        </div>
        <p style="font-size:0.78rem;color:var(--color-text-muted);margin-top:8px;">
          Your key is stored only in this browser. You'll need to enter it once per device.
          Get a key at <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a>.
        </p>
      </div>

      <div class="settings-section">
        <h2>Database</h2>
        <p style="font-size:0.85rem;color:var(--color-text-muted);">
          Connected to Supabase. Your data syncs automatically between devices.
        </p>
        <p style="font-size:0.78rem;color:var(--color-text-muted);margin-top:6px;word-break:break-all;">
          Project URL: ${supaUrl}
        </p>
      </div>

      <div class="settings-section">
        <h2>Shopping list</h2>
        <p style="font-size:0.85rem;color:var(--color-text-muted);margin-bottom:12px;">
          Clears your entire shopping list so you can start fresh. This cannot be undone.
        </p>
        <button class="btn-danger" id="settings-reset-btn">Start new list</button>
      </div>
    `;

    el.querySelector('#save-key-btn').addEventListener('click', () => {
      const val = el.querySelector('#api-key-input').value.trim();
      if (val) {
        localStorage.setItem('claude_api_key', val);
        showToast('API key saved');
        Settings.render();
      } else {
        localStorage.removeItem('claude_api_key');
        showToast('API key removed');
        Settings.render();
      }
    });

    el.querySelector('#settings-reset-btn').addEventListener('click', () => {
      Settings.confirmReset();
    });
  },

  async confirmReset() {
    if (!confirm('Clear the entire shopping list and start fresh?')) return;
    await DB.clearShoppingList();
    showToast('Shopping list cleared');
  },
};

document.addEventListener('DOMContentLoaded', init);
