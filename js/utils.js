'use strict';

const SECTIONS = ['produce','dairy','meat','seafood','pantry','frozen','bakery','beverages','other'];

const SECTION_LABELS = {
  produce:   'Produce',
  dairy:     'Dairy & Eggs',
  meat:      'Meat & Poultry',
  seafood:   'Seafood',
  pantry:    'Pantry',
  frozen:    'Frozen',
  bakery:    'Bakery',
  beverages: 'Beverages',
  other:     'Other',
};

const SEASONS = ['spring','summer','fall','winter','all-year'];

function getCurrentSeason() {
  const month = new Date().getMonth(); // 0-11
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

function stars(rating) {
  if (!rating) return '';
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

// Normalize an ingredient name for grouping/dedup
function normalizeName(name) {
  return name.toLowerCase().trim()
    .replace(/\s+/g, ' ')
    .replace(/s$/, ''); // naive depluralize
}

// Unit normalization map
const UNIT_NORM = {
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbs: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp',
  cup: 'cup', cups: 'cup',
  ounce: 'oz', ounces: 'oz',
  pound: 'lb', pounds: 'lb', lbs: 'lb',
  gram: 'g', grams: 'g',
  kilogram: 'kg', kilograms: 'kg',
  liter: 'L', liters: 'L', litre: 'L',
  milliliter: 'ml', milliliters: 'ml',
  clove: 'clove', cloves: 'clove',
  slice: 'slice', slices: 'slice',
  piece: 'piece', pieces: 'piece',
  bunch: 'bunch', bunches: 'bunch',
  sprig: 'sprig', sprigs: 'sprig',
  can: 'can', cans: 'can',
  package: 'pkg', packages: 'pkg', pkg: 'pkg',
  head: 'head', heads: 'head',
  stalk: 'stalk', stalks: 'stalk',
};

function normalizeUnit(u) {
  if (!u) return '';
  return UNIT_NORM[u.toLowerCase().trim()] || u.toLowerCase().trim();
}

// Merge ingredient rows (from DB) into shopping list items
// Input: [{name, amount, unit, store_section}]
// Output: [{name, amount (string), store_section}]
function mergeIngredients(rows) {
  const groups = {};
  for (const row of rows) {
    const key = normalizeName(row.name);
    if (!groups[key]) {
      groups[key] = { canonical: row.name.trim(), section: row.store_section || 'other', parts: [] };
    }
    groups[key].parts.push({ amount: row.amount, unit: normalizeUnit(row.unit) });
    if (row.store_section && row.store_section !== 'other') {
      groups[key].section = row.store_section;
    }
  }

  return Object.values(groups).map(g => {
    // Group by unit
    const byUnit = {};
    for (const p of g.parts) {
      const u = p.unit || '';
      if (!byUnit[u]) byUnit[u] = 0;
      byUnit[u] += parseFloat(p.amount) || 0;
    }
    const amountStr = Object.entries(byUnit)
      .filter(([, v]) => v > 0)
      .map(([u, v]) => {
        const num = Number.isInteger(v) ? v : parseFloat(v.toFixed(2));
        return u ? `${num} ${u}` : `${num}`;
      })
      .join(' + ');

    return {
      name: g.canonical,
      amount: amountStr || '',
      store_section: g.section,
    };
  });
}

// Parse a pasted ingredient list into structured rows
// Tries to detect: "2 cups flour", "1 lb chicken", "3 cloves garlic", etc.
function parsePastedIngredients(text) {
  const UNIT_WORDS = Object.keys(UNIT_NORM).join('|');
  const re = new RegExp(
    `^([\\d\\/\\s¼½¾⅓⅔⅛]+)?\\s*(${UNIT_WORDS}s?)?[.]?\\s+(.+)$`,
    'i'
  );

  return text.split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const m = line.match(re);
      if (m) {
        return {
          amount: parseFraction(m[1]?.trim()),
          unit: m[2]?.trim() || '',
          name: m[3]?.trim() || line,
          store_section: 'other',
          raw: line,
        };
      }
      return { amount: null, unit: '', name: line, store_section: 'other', raw: line };
    });
}

function parseFraction(str) {
  if (!str) return null;
  const map = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 0.333, '⅔': 0.667, '⅛': 0.125 };
  let s = str;
  for (const [sym, val] of Object.entries(map)) {
    s = s.replace(sym, ` ${val}`);
  }
  s = s.trim();
  if (s.includes('/')) {
    const [n, d] = s.split('/');
    return parseFloat(n) / parseFloat(d);
  }
  const parts = s.split(/\s+/).map(Number);
  if (parts.length === 2) return parts[0] + parts[1]; // "1 0.5" from "1½"
  return parseFloat(s) || null;
}

function showToast(msg, duration = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden', 'fade-out');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    t.classList.add('fade-out');
    setTimeout(() => t.classList.add('hidden'), 350);
  }, duration);
}

function sectionLabel(s) {
  return SECTION_LABELS[s] || s;
}
