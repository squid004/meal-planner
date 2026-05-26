'use strict';

const Shopping = {
  _items: [],

  init() {
    registerView('shopping', { onShow: () => Shopping.onShow() });
  },

  async onShow() {
    this._items = await DB.getShoppingItems().catch(() => []);
    this.render();
  },

  render() {
    const el = document.getElementById('view-shopping');

    if (this._items.length === 0) {
      el.innerHTML = `
        <div class="page-header">
          <h1>Shopping List</h1>
        </div>
        <div class="shopping-empty">
          <p>Your shopping list is empty.</p>
          <p>Go to <strong>Select Meals</strong> to pick recipes, or add items manually below.</p>
        </div>
        ${this.addItemFormHTML()}
        <div style="margin-top:24px;">
          <button class="btn-danger btn-sm" id="reset-list-btn">Start new list</button>
        </div>`;
    } else {
      const bySection = this.groupBySection(this._items);
      el.innerHTML = `
        <div class="page-header">
          <h1>Shopping List</h1>
          <button class="btn-ghost btn-sm" id="reset-list-btn" style="color:var(--color-danger)">New list</button>
        </div>
        ${this.addItemFormHTML()}
        <hr class="divider">
        ${Object.entries(bySection).map(([section, items]) => `
          <div class="shopping-section">
            <div class="shopping-section-title">${sectionLabel(section)}</div>
            ${items.map(item => this.itemHTML(item)).join('')}
          </div>`).join('')}
      `;
    }

    this.wireEvents(el);
  },

  groupBySection(items) {
    const order = SECTIONS;
    const grouped = {};
    for (const item of items) {
      const s = item.store_section || 'other';
      if (!grouped[s]) grouped[s] = [];
      grouped[s].push(item);
    }
    // Return in canonical section order
    const result = {};
    for (const s of order) {
      if (grouped[s]) result[s] = grouped[s];
    }
    return result;
  },

  itemHTML(item) {
    const checked = item.checked ? 'checked' : '';
    const cls     = item.checked ? 'shopping-item checked' : 'shopping-item';
    const amount  = item.amount ? `<span class="item-amount">${esc(item.amount)}</span>` : '';
    return `
      <div class="${cls}" data-id="${item.id}">
        <input type="checkbox" ${checked} aria-label="${esc(item.name)}">
        <span class="item-name">${esc(item.name)}</span>
        ${amount}
        <button class="btn-ghost btn-sm delete-item" title="Remove" style="padding:4px 6px;color:var(--color-text-muted);">×</button>
      </div>`;
  },

  addItemFormHTML() {
    const sectionOpts = SECTIONS.map(s =>
      `<option value="${s}">${sectionLabel(s)}</option>`
    ).join('');
    return `
      <div class="add-item-row">
        <input type="text" id="manual-item-name" placeholder="Add item…" autocomplete="off">
        <select id="manual-item-section">${sectionOpts}</select>
        <button class="btn-primary btn-sm" id="manual-add-btn">Add</button>
      </div>`;
  },

  wireEvents(el) {
    // Checkbox toggles
    el.querySelectorAll('.shopping-item input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', async () => {
        const row = cb.closest('.shopping-item');
        const id  = row.dataset.id;
        row.classList.toggle('checked', cb.checked);
        await DB.toggleItem(id, cb.checked).catch(err => showToast('Sync error: ' + err.message));
        // Update local state
        const item = this._items.find(i => i.id === id);
        if (item) item.checked = cb.checked;
      });
    });

    // Delete item buttons
    el.querySelectorAll('.delete-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('.shopping-item');
        const id  = row.dataset.id;
        await DB.deleteShoppingItem(id).catch(err => showToast('Error: ' + err.message));
        this._items = this._items.filter(i => i.id !== id);
        this.render();
      });
    });

    // Manual add
    const nameInput = el.querySelector('#manual-item-name');
    const addBtn    = el.querySelector('#manual-add-btn');

    const doAdd = async () => {
      const name = nameInput?.value.trim();
      if (!name) return;
      const section = el.querySelector('#manual-item-section')?.value || 'other';
      addBtn.disabled = true;
      try {
        await DB.addManualItem(name, section);
        nameInput.value = '';
        this._items = await DB.getShoppingItems();
        this.render();
      } catch (err) {
        showToast('Error: ' + err.message);
      } finally {
        if (addBtn) addBtn.disabled = false;
      }
    };

    addBtn?.addEventListener('click', doAdd);
    nameInput?.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });

    // Reset
    el.querySelector('#reset-list-btn')?.addEventListener('click', () => this.confirmReset());
  },

  async confirmReset() {
    if (!confirm('Clear the entire shopping list and start fresh? This cannot be undone.')) return;
    await DB.clearShoppingList().catch(err => showToast('Error: ' + err.message));
    this._items = [];
    this.render();
    showToast('Shopping list cleared');
  },
};
