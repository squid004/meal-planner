'use strict';

// ── Supabase config ────────────────────────────────────────────────────────────
// Replace these two values after creating your Supabase project.
// These are safe to commit — the anon key is designed for client-side use.
const DB = {
  SUPABASE_URL:  'https://ntkavxpmqvvaciakurcp.supabase.co',
  SUPABASE_ANON: 'sb_publishable_BzG0bezsNdYFmaJG4qWMlg_LCl1OAyg',
  _sb: null,

  init() {
    if (this.SUPABASE_URL.startsWith('PASTE')) {
      console.warn('Supabase not configured. Open js/db.js and add your project URL and anon key.');
      return;
    }
    this._sb = window.supabase.createClient(this.SUPABASE_URL, this.SUPABASE_ANON);
  },

  _check() {
    if (!this._sb) throw new Error('Supabase not initialized. Add your credentials to js/db.js.');
  },

  // ── Recipes ──────────────────────────────────────────────────────────────────

  async getRecipes() {
    this._check();
    const { data, error } = await this._sb
      .from('recipes')
      .select('*, ingredients(*)')
      .order('name');
    if (error) throw error;
    return data;
  },

  async getRecipe(id) {
    this._check();
    const { data, error } = await this._sb
      .from('recipes')
      .select('*, ingredients(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  // Save (insert or update) a recipe and its ingredients.
  // recipeData: {id?, name, source_url, season_tags, diet_tags, notes}
  // ingredients: [{name, amount, unit, store_section}]
  async saveRecipe(recipeData, ingredientRows) {
    this._check();
    let recipeId = recipeData.id;

    if (recipeId) {
      // Update existing
      const { error } = await this._sb
        .from('recipes')
        .update({
          name:         recipeData.name,
          source_url:   recipeData.source_url   || null,
          season_tags:  recipeData.season_tags  || [],
          diet_tags:    recipeData.diet_tags     || [],
          notes:        recipeData.notes         || null,
          instructions: recipeData.instructions  || null,
          servings:     recipeData.servings      || null,
        })
        .eq('id', recipeId);
      if (error) throw error;

      // Replace ingredients
      await this._sb.from('ingredients').delete().eq('recipe_id', recipeId);
    } else {
      // Insert new
      const { data, error } = await this._sb
        .from('recipes')
        .insert({
          name:         recipeData.name,
          source_url:   recipeData.source_url   || null,
          season_tags:  recipeData.season_tags  || [],
          diet_tags:    recipeData.diet_tags     || [],
          notes:        recipeData.notes         || null,
          instructions: recipeData.instructions  || null,
          servings:     recipeData.servings      || null,
        })
        .select()
        .single();
      if (error) throw error;
      recipeId = data.id;
    }

    // Insert ingredients
    if (ingredientRows && ingredientRows.length > 0) {
      const rows = ingredientRows
        .filter(r => r.name?.trim())
        .map(r => ({
          recipe_id:     recipeId,
          name:          r.name.trim(),
          amount:        parseFloat(r.amount) || null,
          unit:          r.unit?.trim()         || null,
          store_section: r.store_section         || 'other',
        }));
      if (rows.length > 0) {
        const { error } = await this._sb.from('ingredients').insert(rows);
        if (error) throw error;
      }
    }

    return recipeId;
  },

  async deleteRecipe(id) {
    this._check();
    // Ingredients cascade-delete via FK
    const { error } = await this._sb.from('recipes').delete().eq('id', id);
    if (error) throw error;
  },

  async rateRecipe(id, rating, difficulty, notes, makeAgain) {
    this._check();
    const { error } = await this._sb
      .from('recipes')
      .update({
        rating:       rating,
        difficulty:   difficulty || null,
        rating_notes: notes      || null,
        make_again:   !!makeAgain,
        rated_at:     new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;
  },

  // ── Shopping list ─────────────────────────────────────────────────────────────

  async getShoppingItems() {
    this._check();
    const { data, error } = await this._sb
      .from('shopping_items')
      .select('*')
      .order('store_section')
      .order('name');
    if (error) throw error;
    return data;
  },

  // Merge new ingredient-derived items into the shopping list.
  // Existing manual items and checked items are untouched.
  // Items from recipes are upserted by name (unique constraint).
  async addIngredientsToList(mergedItems) {
    this._check();
    for (const item of mergedItems) {
      const { data: existing } = await this._sb
        .from('shopping_items')
        .select('id, amount, recipe_ids, is_manual')
        .eq('name', item.name)
        .maybeSingle();

      if (existing && !existing.is_manual) {
        // Update amount and append recipe_ids
        const combined = combineAmounts(existing.amount, item.amount);
        const ids = [...new Set([...(existing.recipe_ids || []), ...(item.recipe_ids || [])])];
        await this._sb
          .from('shopping_items')
          .update({ amount: combined, recipe_ids: ids, store_section: item.store_section })
          .eq('id', existing.id);
      } else if (!existing) {
        await this._sb.from('shopping_items').insert({
          name:          item.name,
          amount:        item.amount || null,
          store_section: item.store_section || 'other',
          checked:       false,
          is_manual:     false,
          recipe_ids:    item.recipe_ids || [],
        });
      }
      // If existing is manual, leave it alone
    }
  },

  async addManualItem(name, section) {
    this._check();
    const { error } = await this._sb.from('shopping_items').insert({
      name:          name.trim(),
      amount:        null,
      store_section: section || 'other',
      checked:       false,
      is_manual:     true,
      recipe_ids:    [],
    });
    if (error) throw error;
  },

  async toggleItem(id, checked) {
    this._check();
    const { error } = await this._sb
      .from('shopping_items')
      .update({ checked })
      .eq('id', id);
    if (error) throw error;
  },

  async clearShoppingList() {
    this._check();
    const { error } = await this._sb.from('shopping_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
  },

  // ── App state (single overwritten row per key) ────────────────────────────────

  async getAppState(key) {
    this._check();
    const { data } = await this._sb
      .from('app_state')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    return data?.value ?? null;
  },

  async setAppState(key, value) {
    this._check();
    const { error } = await this._sb
      .from('app_state')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
  },

  async deleteShoppingItem(id) {
    this._check();
    const { error } = await this._sb.from('shopping_items').delete().eq('id', id);
    if (error) throw error;
  },
};

// Helper: combine two formatted amount strings
function combineAmounts(a, b) {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  if (a === b) return a;
  return `${a}, ${b}`;
}
