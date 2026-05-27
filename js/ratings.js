'use strict';

const Ratings = {
  _currentRating: 0,

  _currentDifficulty: null,

  init() {
    this._wireStars();
    this._wireDifficulty();
    document.getElementById('save-rating-btn').addEventListener('click', () => this.save());
  },

  open(recipe) {
    document.getElementById('rating-recipe-id').value        = recipe.id;
    document.getElementById('rating-recipe-name').textContent = recipe.name;
    document.getElementById('rating-notes').value            = recipe.rating_notes || '';
    document.getElementById('make-again').checked            = !!recipe.make_again;
    this._setRating(recipe.rating || 0);
    this._setDifficulty(recipe.difficulty || null);
    openModal('modal-rating');
  },

  _wireStars() {
    const widget = document.getElementById('star-widget');
    widget.querySelectorAll('.star').forEach(btn => {
      btn.addEventListener('click',      () => this._setRating(parseInt(btn.dataset.value)));
      btn.addEventListener('mouseenter', () => this._highlightTo(parseInt(btn.dataset.value)));
      btn.addEventListener('mouseleave', () => this._highlightTo(this._currentRating));
    });
  },

  _wireDifficulty() {
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', () => this._setDifficulty(btn.dataset.value));
    });
  },

  _setDifficulty(val) {
    this._currentDifficulty = val;
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === val);
    });
  },

  _setRating(n) {
    this._currentRating = n;
    this._highlightTo(n);
  },

  _highlightTo(n) {
    document.querySelectorAll('#star-widget .star').forEach(btn => {
      const v = parseInt(btn.dataset.value);
      btn.classList.toggle('active', v <= n);
    });
  },

  async save() {
    const id       = document.getElementById('rating-recipe-id').value;
    const notes    = document.getElementById('rating-notes').value.trim();
    const again    = document.getElementById('make-again').checked;
    const rating   = this._currentRating;

    if (!rating) { showToast('Please select a star rating'); return; }

    const btn = document.getElementById('save-rating-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      await DB.rateRecipe(id, rating, this._currentDifficulty, notes, again);
      closeModal('modal-rating');
      showToast('Rating saved');
      // Refresh recipes view if visible
      if (currentView === 'recipes') await Recipes.onShow();
    } catch (err) {
      showToast('Error: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save rating';
    }
  },
};
