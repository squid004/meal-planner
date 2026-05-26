'use strict';

const AI = {
  init() {
    // Nothing to wire at init time; modal is opened from Recipes view
  },

  open(existingRecipes) {
    const key = localStorage.getItem('claude_api_key');
    const resultEl  = document.getElementById('ai-result');
    const loadingEl = document.getElementById('ai-loading');
    const noKeyEl   = document.getElementById('ai-no-key');

    resultEl.textContent  = '';
    loadingEl.classList.add('hidden');
    noKeyEl.classList.add('hidden');

    openModal('modal-ai');

    if (!key) {
      noKeyEl.classList.remove('hidden');
      return;
    }

    this.fetchSuggestions(key, existingRecipes);
  },

  async fetchSuggestions(key, existingRecipes) {
    const loadingEl = document.getElementById('ai-loading');
    const resultEl  = document.getElementById('ai-result');

    loadingEl.classList.remove('hidden');

    const season = getCurrentSeason();
    const names  = (existingRecipes || []).map(r => r.name).join('\n');
    const prompt = `You are a helpful meal planning assistant. The current season is ${season}.

${names ? `The user already has these recipes saved (do not suggest them again):\n${names}\n` : ''}
Suggest 5 dinner recipes that are:
- Seasonally appropriate for ${season}
- Nutritionally varied (mix of proteins, vegetables, cuisines)
- Realistic weeknight dinners (45 minutes or less of active cooking)

For each suggestion, provide:
1. Recipe name
2. One-sentence description
3. Why it fits the season
4. A recommended source to find the full recipe (e.g. NYT Cooking, Serious Eats, Smitten Kitchen, Food52, etc.)

Format as a numbered list.`;

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
          max_tokens: 1024,
          messages:   [{ role: 'user', content: prompt }],
        }),
      });

      loadingEl.classList.add('hidden');

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        resultEl.textContent = `Error from Claude API (${res.status}): ${err?.error?.message || res.statusText}`;
        return;
      }

      const data = await res.json();
      const text = data.content?.[0]?.text || '(no response)';
      resultEl.textContent = text;
    } catch (err) {
      loadingEl.classList.add('hidden');
      resultEl.textContent = `Network error: ${err.message}`;
    }
  },
};
