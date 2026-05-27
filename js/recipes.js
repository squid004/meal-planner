'use strict';

const Recipes = {
  _all: [],
  _filtered: [],
  _showingSuggestions: false,

  init() {
    registerView('recipes', { onShow: () => Recipes.onShow() });
  },

  async onShow() {
    this._all = await DB.getRecipes().catch(() => []);
    this._showingSuggestions = false;
    this.renderList();
  },

  // ── List view ─────────────────────────────────────────────────────────────────

  renderList() {
    const el = document.getElementById('view-recipes');
    const season = getCurrentSeason();

    el.innerHTML = `
      <div class="page-header">
        <h1>Recipes</h1>
        <button class="btn-secondary btn-sm" id="suggest-btn">✦ Suggest</button>
      </div>

      <!-- Inline AI suggestions container -->
      <div id="suggestions-container" class="${this._showingSuggestions ? '' : 'hidden'}"></div>

      <div class="filter-bar">
        <input type="text" id="recipe-search" placeholder="Search recipes…">
        <select id="season-filter">
          <option value="">All seasons</option>
          <option value="${season}" selected>${capitalize(season)} (now)</option>
          ${SEASONS.filter(s => s !== season && s !== 'all-year').map(s =>
            `<option value="${s}">${capitalize(s)}</option>`
          ).join('')}
          <option value="all-year">All year</option>
        </select>
        <select id="diet-filter">
          <option value="">All diets</option>
          <option value="vegetarian">Vegetarian</option>
          <option value="vegan">Vegan</option>
          <option value="gluten-free">Gluten-free</option>
          <option value="dairy-free">Dairy-free</option>
          <option value="quick">Quick</option>
        </select>
      </div>
      <div class="recipe-list" id="recipe-list"></div>
      <button class="fab" id="add-recipe-btn" title="Add recipe">+</button>
    `;

    this.applyFilter();

    el.querySelector('#recipe-search').addEventListener('input',  () => this.applyFilter());
    el.querySelector('#season-filter').addEventListener('change', () => this.applyFilter());
    el.querySelector('#diet-filter').addEventListener('change',   () => this.applyFilter());
    el.querySelector('#add-recipe-btn').addEventListener('click', () => this.openAdd());

    el.querySelector('#suggest-btn').addEventListener('click', () => {
      const container = document.getElementById('suggestions-container');
      if (this._showingSuggestions) {
        container.classList.add('hidden');
        this._showingSuggestions = false;
      } else {
        container.classList.remove('hidden');
        this._showingSuggestions = true;
        AI.loadSuggestions(this._all, container);
      }
    });

    // Re-trigger suggestions if they were showing
    if (this._showingSuggestions) {
      const container = document.getElementById('suggestions-container');
      AI.loadSuggestions(this._all, container);
    }
  },

  applyFilter() {
    const q      = document.getElementById('recipe-search')?.value.toLowerCase() || '';
    const season = document.getElementById('season-filter')?.value || '';
    const diet   = document.getElementById('diet-filter')?.value || '';

    this._filtered = this._all.filter(r => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (season && !r.season_tags?.includes(season)) return false;
      if (diet   && !r.diet_tags?.includes(diet))     return false;
      return true;
    });
    this.renderCards();
  },

  renderCards() {
    const list = document.getElementById('recipe-list');
    if (!list) return;

    if (this._filtered.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🍽</div>
          <p>${this._all.length === 0
            ? 'No recipes yet. Hit + to add your first one, or click ✦ Suggest!'
            : 'No recipes match your filters.'}</p>
        </div>`;
      return;
    }

    list.innerHTML = this._filtered.map(r => this.cardHTML(r)).join('');
    list.querySelectorAll('.recipe-card').forEach(card => {
      card.addEventListener('click', () => this.showDetail(card.dataset.id));
    });
  },

  cardHTML(r) {
    const seasonTags = (r.season_tags || []).map(s =>
      `<span class="tag season-${s}">${capitalize(s)}</span>`
    ).join('');
    const dietTags = (r.diet_tags || []).map(d =>
      `<span class="tag">${capitalize(d)}</span>`
    ).join('');
    const ratingStr = r.rating ? `<span class="recipe-card-stars">${stars(r.rating)}</span>` : '';
    const urlStr = r.source_url
      ? `<div class="recipe-card-url">🔗 ${new URL(r.source_url).hostname}</div>` : '';

    return `
      <div class="recipe-card" data-id="${r.id}">
        <div class="recipe-card-header">
          <span class="recipe-card-name">${esc(r.name)}</span>
          ${ratingStr}
        </div>
        <div class="recipe-card-tags">${seasonTags}${dietTags}</div>
        ${urlStr}
      </div>`;
  },

  // ── Detail view ───────────────────────────────────────────────────────────────

  async showDetail(id) {
    const r  = await DB.getRecipe(id);
    const el = document.getElementById('view-recipes');

    const seasonTags = (r.season_tags || []).map(s =>
      `<span class="tag season-${s}">${capitalize(s)}</span>`
    ).join('');
    const dietTags = (r.diet_tags || []).map(d =>
      `<span class="tag">${capitalize(d)}</span>`
    ).join('');

    const ingsHTML = r.ingredients?.length
      ? `<table class="ingredient-table">
          <thead><tr><th>Amount</th><th>Unit</th><th>Ingredient</th><th>Section</th></tr></thead>
          <tbody>${r.ingredients.map(i => `
            <tr>
              <td>${i.amount ?? ''}</td>
              <td>${esc(i.unit || '')}</td>
              <td>${esc(i.name)}</td>
              <td>${sectionLabel(i.store_section)}</td>
            </tr>`).join('')}
          </tbody>
        </table>`
      : '<p style="color:var(--color-text-muted);font-size:0.9rem;">No ingredients added.</p>';

    const instructionsHTML = r.instructions
      ? `<h2 style="font-size:1rem;margin:20px 0 6px;">Instructions</h2>
         <div class="recipe-instructions">${esc(r.instructions).replace(/\n/g, '<br>')}</div>`
      : '';

    const ratingHTML = r.rating
      ? `<div style="margin-top:16px;">
          <strong>Your rating:</strong> ${stars(r.rating)}
          ${r.make_again ? '&nbsp;✓ Would make again' : ''}
          ${r.rating_notes ? `<p style="font-size:0.9rem;color:var(--color-text-muted);margin-top:4px;">${esc(r.rating_notes)}</p>` : ''}
        </div>`
      : '';

    el.innerHTML = `
      <div class="recipe-detail">
        <button class="back-btn" id="back-btn">← All recipes</button>
        <div class="page-header">
          <h1>${esc(r.name)}</h1>
        </div>
        <div class="recipe-card-tags" style="margin-bottom:12px;">${seasonTags}${dietTags}</div>
        ${r.source_url ? `<p style="margin-bottom:12px;"><a href="${r.source_url}" target="_blank" rel="noopener">View original recipe ↗</a></p>` : ''}
        ${r.notes ? `<p style="margin-bottom:16px;font-size:0.9rem;color:var(--color-text-muted);">${esc(r.notes)}</p>` : ''}

        <div class="detail-actions">
          <button class="btn-primary" id="detail-add-list-btn">+ Add to shopping list</button>
          <button class="btn-secondary" id="detail-rate-btn">Rate this</button>
          <button class="btn-secondary" id="detail-edit-btn">Edit</button>
          <button class="btn-ghost" id="detail-delete-btn" style="color:var(--color-danger)">Delete</button>
        </div>

        <h2 style="font-size:1rem;margin:20px 0 4px;">Ingredients</h2>
        ${ingsHTML}
        ${instructionsHTML}
        ${ratingHTML}
      </div>`;

    el.querySelector('#back-btn').addEventListener('click',          () => this.renderList());
    el.querySelector('#detail-edit-btn').addEventListener('click',   () => this.openEdit(r));
    el.querySelector('#detail-rate-btn').addEventListener('click',   () => Ratings.open(r));
    el.querySelector('#detail-delete-btn').addEventListener('click', () => this.deleteRecipe(r.id, r.name));
    el.querySelector('#detail-add-list-btn').addEventListener('click', () => this.addSingleToList(r));
  },

  async addSingleToList(r) {
    if (!r.ingredients?.length) { showToast('No ingredients on this recipe to add.'); return; }
    const merged = mergeIngredients(r.ingredients);
    await DB.addIngredientsToList(merged.map(i => ({ ...i, recipe_ids: [r.id] })));
    showToast(`Added "${r.name}" to shopping list`);
  },

  async deleteRecipe(id, name) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await DB.deleteRecipe(id);
    showToast('Recipe deleted');
    this._all = this._all.filter(r => r.id !== id);
    this.renderList();
  },

  // ── Add / Edit modal ──────────────────────────────────────────────────────────

  openAdd() {
    this.resetForm();
    document.getElementById('modal-recipe-title').textContent = 'Add Recipe';
    openModal('modal-recipe');
    document.querySelectorAll('#modal-recipe .modal-tab')[0].click();
  },

  openEdit(r) {
    this.resetForm();
    document.getElementById('modal-recipe-title').textContent = 'Edit Recipe';
    this.populateForm(r);
    openModal('modal-recipe');
    document.querySelectorAll('#modal-recipe .modal-tab')[0].click();
  },

  resetForm() {
    document.getElementById('recipe-id').value           = '';
    document.getElementById('recipe-name').value         = '';
    document.getElementById('recipe-url').value          = '';
    document.getElementById('recipe-instructions').value = '';
    document.getElementById('recipe-notes').value        = '';
    document.querySelectorAll('[name="season"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('[name="diet"]').forEach(cb   => cb.checked = false);
    document.getElementById('ingredient-rows').innerHTML  = '';
    this._addIngredientRowHeader();

    document.getElementById('paste-input').value = '';
    document.getElementById('parse-result').classList.add('hidden');
    document.getElementById('parse-loading').classList.add('hidden');
    document.getElementById('parsed-rows').innerHTML = '';

    const form = document.getElementById('recipe-form');
    form.onsubmit = null;
    form.addEventListener('submit', e => { e.preventDefault(); this.saveForm(); }, { once: true });

    document.getElementById('add-ingredient-btn').onclick = () => this._addIngredientRow();
    document.getElementById('parse-ai-btn').onclick       = () => this._parsePasteWithAI();
    document.getElementById('parse-btn').onclick          = () => this._parsePasteBasic();
    document.getElementById('apply-parsed-btn').onclick   = () => this._applyParsed();
  },

  populateForm(r) {
    document.getElementById('recipe-id').value           = r.id;
    document.getElementById('recipe-name').value         = r.name;
    document.getElementById('recipe-url').value          = r.source_url || '';
    document.getElementById('recipe-instructions').value = r.instructions || '';
    document.getElementById('recipe-notes').value        = r.notes || '';

    (r.season_tags || []).forEach(v => {
      const cb = document.querySelector(`[name="season"][value="${v}"]`);
      if (cb) cb.checked = true;
    });
    (r.diet_tags || []).forEach(v => {
      const cb = document.querySelector(`[name="diet"][value="${v}"]`);
      if (cb) cb.checked = true;
    });

    this._addIngredientRowHeader();
    (r.ingredients || []).forEach(i => this._addIngredientRow(i));
  },

  _addIngredientRowHeader() {
    const container = document.getElementById('ingredient-rows');
    if (!container.querySelector('.ingredient-row-header')) {
      container.insertAdjacentHTML('afterbegin', `
        <div class="ingredient-row-header">
          <span>Amount</span><span>Unit</span><span>Ingredient</span><span>Section</span><span></span>
        </div>`);
    }
  },

  _addIngredientRow(data = {}) {
    const container  = document.getElementById('ingredient-rows');
    const sectionOpts = SECTIONS.map(s =>
      `<option value="${s}" ${data.store_section === s ? 'selected' : ''}>${sectionLabel(s)}</option>`
    ).join('');
    const row = document.createElement('div');
    row.className = 'ingredient-row';
    row.innerHTML = `
      <input type="number" placeholder="2" min="0" step="any" value="${data.amount ?? ''}">
      <input type="text"   placeholder="cups" value="${esc(data.unit || '')}">
      <input type="text"   placeholder="flour" required value="${esc(data.name || '')}">
      <select>${sectionOpts}</select>
      <button type="button" class="remove-ing" title="Remove">×</button>
    `;
    row.querySelector('.remove-ing').addEventListener('click', () => row.remove());
    container.appendChild(row);
  },

  _collectIngredientRows() {
    return Array.from(document.querySelectorAll('#ingredient-rows .ingredient-row')).map(row => {
      const inputs = row.querySelectorAll('input');
      const select = row.querySelector('select');
      return {
        amount:        inputs[0].value,
        unit:          inputs[1].value,
        name:          inputs[2].value,
        store_section: select.value,
      };
    }).filter(r => r.name.trim());
  },

  // AI-powered paste parsing
  async _parsePasteWithAI() {
    const text = document.getElementById('paste-input').value.trim();
    if (!text) return;

    const key = localStorage.getItem('claude_api_key');
    if (!key) {
      showToast('No Claude API key — using basic parse instead');
      this._parsePasteBasic();
      return;
    }

    const loadingEl = document.getElementById('parse-loading');
    const resultEl  = document.getElementById('parse-result');
    const btn       = document.getElementById('parse-ai-btn');

    loadingEl.classList.remove('hidden');
    resultEl.classList.add('hidden');
    btn.disabled = true;

    try {
      const parsed = await AI.parseRecipe(text);

      // Auto-populate name and instructions if the form fields are empty
      if (parsed.name && !document.getElementById('recipe-name').value) {
        document.getElementById('recipe-name').value = parsed.name;
      }
      if (parsed.instructions && !document.getElementById('recipe-instructions').value) {
        document.getElementById('recipe-instructions').value = parsed.instructions;
      }

      // Show ingredients for section review
      this._showParsedIngredients(parsed.ingredients || []);
    } catch (err) {
      showToast('Parse error: ' + err.message);
    } finally {
      loadingEl.classList.add('hidden');
      btn.disabled = false;
    }
  },

  // Fallback: basic regex parsing (no AI key needed)
  _parsePasteBasic() {
    const text = document.getElementById('paste-input').value;
    if (!text.trim()) return;
    const parsed = parsePastedIngredients(text);
    this._showParsedIngredients(parsed);
  },

  _showParsedIngredients(ingredients) {
    const container  = document.getElementById('parsed-rows');
    const sectionOpts = SECTIONS.map(s => `<option value="${s}">${sectionLabel(s)}</option>`).join('');

    container.innerHTML = ingredients.map((p, i) => `
      <div class="parsed-row" data-index="${i}">
        <span>${esc(p.raw || [p.amount, p.unit, p.name].filter(Boolean).join(' '))}</span>
        <select data-index="${i}">${sectionOpts}</select>
      </div>`).join('');

    // Pre-select sections if Claude already set them
    ingredients.forEach((p, i) => {
      const sel = container.querySelector(`select[data-index="${i}"]`);
      if (sel && p.store_section && p.store_section !== 'other') sel.value = p.store_section;
    });

    container.dataset.parsed = JSON.stringify(ingredients);
    document.getElementById('parse-result').classList.remove('hidden');
  },

  _applyParsed() {
    const container = document.getElementById('parsed-rows');
    const parsed    = JSON.parse(container.dataset.parsed || '[]');
    parsed.forEach((p, i) => {
      const sel = container.querySelector(`select[data-index="${i}"]`);
      p.store_section = sel?.value || 'other';
    });
    document.getElementById('ingredient-rows').innerHTML = '';
    this._addIngredientRowHeader();
    parsed.forEach(p => this._addIngredientRow(p));
    document.querySelectorAll('#modal-recipe .modal-tab')[0].click();
    document.getElementById('parse-result').classList.add('hidden');
  },

  async saveForm() {
    const recipeData = {
      id:           document.getElementById('recipe-id').value || null,
      name:         document.getElementById('recipe-name').value.trim(),
      source_url:   document.getElementById('recipe-url').value.trim() || null,
      instructions: document.getElementById('recipe-instructions').value.trim() || null,
      notes:        document.getElementById('recipe-notes').value.trim() || null,
      season_tags:  Array.from(document.querySelectorAll('[name="season"]:checked')).map(c => c.value),
      diet_tags:    Array.from(document.querySelectorAll('[name="diet"]:checked')).map(c => c.value),
    };
    const ingredients = this._collectIngredientRows();

    const btn = document.querySelector('#recipe-form [type="submit"]');
    btn.disabled    = true;
    btn.textContent = 'Saving…';

    try {
      await DB.saveRecipe(recipeData, ingredients);
      closeModal('modal-recipe');
      showToast('Recipe saved');
      await this.onShow();
    } catch (err) {
      showToast('Error saving: ' + err.message);
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Save recipe';
    }
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
