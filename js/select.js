'use strict';

const Select = {
  _all: [],
  _selected: new Set(),

  init() {
    registerView('select', { onShow: () => Select.onShow() });
  },

  async onShow() {
    this._all = await DB.getRecipes().catch(() => []);
    this._selected.clear();
    this.render();
  },

  render() {
    const el = document.getElementById('view-select');
    const season = getCurrentSeason();

    el.innerHTML = `
      <div class="page-header">
        <h1>Select Meals</h1>
      </div>
      <p style="font-size:0.88rem;color:var(--color-text-muted);margin-bottom:14px;">
        Check the recipes you plan to make, then add their ingredients to your shopping list.
      </p>
      <div class="filter-bar">
        <input type="text" id="select-search" placeholder="Search recipes…">
        <select id="select-season">
          <option value="">All seasons</option>
          <option value="${season}" selected>${capitalize(season)} (now)</option>
          ${SEASONS.filter(s => s !== season && s !== 'all-year').map(s =>
            `<option value="${s}">${capitalize(s)}</option>`
          ).join('')}
          <option value="all-year">All year</option>
        </select>
      </div>
      <div id="select-list"></div>
      <div class="selection-bar">
        <span class="selection-count" id="selection-count">0 selected</span>
        <button class="btn-primary" id="add-to-list-btn" disabled>Add to shopping list</button>
      </div>
    `;

    this.renderRows();

    el.querySelector('#select-search').addEventListener('input', () => this.renderRows());
    el.querySelector('#select-season').addEventListener('change', () => this.renderRows());
    el.querySelector('#add-to-list-btn').addEventListener('click', () => this.addToList());
  },

  renderRows() {
    const q      = document.getElementById('select-search')?.value.toLowerCase() || '';
    const season = document.getElementById('select-season')?.value || '';

    const filtered = this._all.filter(r => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (season && !r.season_tags?.includes(season)) return false;
      return true;
    });

    const list = document.getElementById('select-list');
    if (!list) return;

    if (filtered.length === 0) {
      list.innerHTML = `<div class="empty-state"><p>No recipes match your filters.</p></div>`;
      return;
    }

    list.innerHTML = filtered.map(r => {
      const checked  = this._selected.has(r.id) ? 'checked' : '';
      const tags     = (r.season_tags || []).map(s => capitalize(s)).join(', ');
      const ingCount = r.ingredients?.length || 0;
      return `
        <label class="select-recipe-row" data-id="${r.id}">
          <input type="checkbox" value="${r.id}" ${checked}>
          <div class="select-recipe-info">
            <div class="select-recipe-name">${esc(r.name)}</div>
            <div class="select-recipe-meta">
              ${tags ? tags + ' · ' : ''}${ingCount} ingredient${ingCount !== 1 ? 's' : ''}
              ${r.rating ? ' · ' + stars(r.rating) : ''}
            </div>
          </div>
        </label>`;
    }).join('');

    list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) {
          this._selected.add(cb.value);
        } else {
          this._selected.delete(cb.value);
        }
        this.updateCount();
      });
    });

    this.updateCount();
  },

  updateCount() {
    const n   = this._selected.size;
    const cnt = document.getElementById('selection-count');
    const btn = document.getElementById('add-to-list-btn');
    if (cnt) cnt.textContent = `${n} selected`;
    if (btn) btn.disabled = n === 0;
  },

  async addToList() {
    const btn = document.getElementById('add-to-list-btn');
    btn.disabled = true;
    btn.textContent = 'Adding…';

    try {
      const selected = this._all.filter(r => this._selected.has(r.id));
      let allIngredients = [];

      for (const r of selected) {
        const full = await DB.getRecipe(r.id);
        allIngredients = allIngredients.concat(
          (full.ingredients || []).map(i => ({ ...i, _recipeId: r.id }))
        );
      }

      if (allIngredients.length === 0) {
        showToast('None of the selected recipes have ingredients.');
        return;
      }

      const merged = mergeIngredients(allIngredients);
      // Attach recipe_ids to each merged item
      const mergedWithIds = merged.map(item => {
        const norm = normalizeName(item.name);
        const ids = allIngredients
          .filter(i => normalizeName(i.name) === norm)
          .map(i => i._recipeId);
        return { ...item, recipe_ids: [...new Set(ids)] };
      });

      await DB.addIngredientsToList(mergedWithIds);

      const n = this._selected.size;
      showToast(`Added ingredients from ${n} recipe${n !== 1 ? 's' : ''} to shopping list`);
      this._selected.clear();
      this.renderRows();
    } catch (err) {
      showToast('Error: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Add to shopping list';
    }
  },
};
