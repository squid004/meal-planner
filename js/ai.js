'use strict';

const AI = {
  _suggestions: [],

  init() {},

  // Load cached suggestions from DB and render — returns true if cache existed
  async loadCached(containerEl) {
    try {
      const cached = await DB.getAppState('suggestions');
      if (!cached || !cached.length) return false;
      this._suggestions = cached;
      this.renderSuggestions(cached, containerEl);
      return true;
    } catch {
      return false;
    }
  },

  // Called from Recipes view — generates fresh suggestions and saves to DB
  async loadSuggestions(existingRecipes, containerEl) {
    const key = localStorage.getItem('claude_api_key');
    if (!key) {
      containerEl.innerHTML = `
        <div class="suggestion-no-key">
          No Claude API key set. Go to <strong>Settings</strong> to add one.
        </div>`;
      return;
    }

    containerEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;padding:24px 0;">
        <div class="spinner"></div>
        <span style="color:var(--color-text-muted);">Generating ${capitalize(getCurrentSeason())} recipe ideas…</span>
      </div>`;

    const season = getCurrentSeason();
    const existing = (existingRecipes || []).map(r => r.name).join('\n');

    const prompt = `You are a meal planning assistant. The current season is ${season}.

${existing ? `The user already has these recipes saved — do not suggest them:\n${existing}\n` : ''}
Generate 10 dinner recipes that are seasonally appropriate for ${season}, nutritionally varied, and realistic weeknight meals (under 60 minutes).

Return ONLY a valid JSON array with exactly 10 objects. Each object must have these exact fields:
- "name": string
- "description": string (1-2 sentences)
- "season": one of "spring", "summer", "fall", "winter", "all-year"
- "diet_tags": array, only include applicable tags from ["vegetarian","vegan","gluten-free","dairy-free","quick"]
- "instructions": string (numbered steps, be specific and complete)
- "ingredients": array of objects each with: "amount" (string or null), "unit" (string or null), "name" (string), "store_section" (one of: produce, dairy, meat, seafood, pantry, frozen, bakery, beverages, other)

Return ONLY the JSON array, no markdown, no explanation.`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key':                               key,
          'anthropic-version':                       '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type':                            'application/json',
        },
        body: JSON.stringify({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 8192,
          messages:   [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        containerEl.innerHTML = `<p style="color:var(--color-danger);">Claude API error (${res.status}): ${err?.error?.message || res.statusText}</p>`;
        return;
      }

      const data = await res.json();
      const text = data.content?.[0]?.text || '[]';

      // Strip markdown code fences if Claude wraps the JSON
      const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const recipes = JSON.parse(sanitizeJSON(stripped));
      this._suggestions = recipes;
      await DB.setAppState('suggestions', recipes).catch(() => {}); // save quietly
      this.renderSuggestions(recipes, containerEl);
    } catch (err) {
      containerEl.innerHTML = `<p style="color:var(--color-danger);">Error: ${esc(err.message)}</p>`;
    }
  },

  renderSuggestions(recipes, containerEl) {
    containerEl.innerHTML = `
      <div class="suggestions-header">
        <span class="suggestions-label">Suggestions for ${capitalize(getCurrentSeason())}</span>
        <button class="btn-ghost btn-sm" id="hide-suggestions-btn">Hide</button>
      </div>
      <div class="suggestions-list">
        ${recipes.map((r, i) => `
          <div class="suggestion-card" data-index="${i}">
            <div class="suggestion-card-header">
              <span class="suggestion-name">${esc(r.name)}</span>
              <div style="display:flex;gap:4px;flex-wrap:wrap;">
                <span class="tag season-${r.season}">${capitalize(r.season)}</span>
                ${(r.diet_tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}
              </div>
            </div>
            <p class="suggestion-desc">${esc(r.description)}</p>
            <p class="suggestion-meta">${(r.ingredients || []).length} ingredients</p>
            <button class="btn-primary btn-sm add-suggestion-btn" data-index="${i}">+ Add to my recipes</button>
          </div>`).join('')}
      </div>`;

    containerEl.querySelectorAll('.add-suggestion-btn').forEach(btn => {
      btn.addEventListener('click', () => this.addSuggestion(parseInt(btn.dataset.index), btn));
    });
    containerEl.querySelector('#hide-suggestions-btn')?.addEventListener('click', () => {
      containerEl.classList.add('hidden');
    });
  },

  async addSuggestion(index, btn) {
    const recipe = this._suggestions[index];
    btn.disabled = true;
    btn.textContent = 'Adding…';

    try {
      await DB.saveRecipe(
        {
          name:         recipe.name,
          instructions: recipe.instructions || null,
          season_tags:  recipe.season ? [recipe.season] : [],
          diet_tags:    recipe.diet_tags || [],
          notes:        null,
          source_url:   null,
        },
        (recipe.ingredients || []).map(i => ({
          name:          i.name,
          amount:        i.amount,
          unit:          i.unit,
          store_section: i.store_section || 'other',
        }))
      );
      btn.textContent = '✓ Added';
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-ghost');
      showToast(`"${recipe.name}" added to your recipes`);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '+ Add to my recipes';
      showToast('Error: ' + err.message);
    }
  },

  // Parse a full pasted recipe using Claude — returns {name, instructions, ingredients[]}
  async parseRecipe(text) {
    const key = localStorage.getItem('claude_api_key');
    if (!key) return null;

    const prompt = `Extract the recipe from the following text and return a JSON object with exactly these fields:
- "name": string (recipe name)
- "instructions": string (full cooking instructions, preserve step numbering)
- "ingredients": array of objects each with: "amount" (string or null), "unit" (string or null), "name" (string), "store_section" (one of: produce, dairy, meat, seafood, pantry, frozen, bakery, beverages, other)

Return ONLY valid JSON, no markdown, no explanation.

Recipe text:
${text}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':                               key,
        'anthropic-version':                       '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type':                            'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`API error ${res.status}`);

    const data = await res.json();
    const raw  = data.content?.[0]?.text || '{}';
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    return JSON.parse(sanitizeJSON(clean));
  },
};

// Replace literal newlines/tabs inside JSON string values so JSON.parse doesn't choke
function sanitizeJSON(str) {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (escaped)          { result += ch; escaped = false; continue; }
    if (ch === '\\')      { result += ch; escaped = true;  continue; }
    if (ch === '"')       { inString = !inString; result += ch; continue; }
    if (inString) {
      if (ch === '\n')    { result += '\\n';  continue; }
      if (ch === '\r')    {                   continue; }
      if (ch === '\t')    { result += '\\t';  continue; }
    }
    result += ch;
  }
  return result;
}
