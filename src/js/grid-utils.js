// src/js/grid-utils.js
// Einheitliches Grid-System für alle SPA-Pages

// ─── Grid Column State ─────────────────────────────────────────────────────────
let gridCols = (() => {
  const saved = localStorage.getItem('grid_cols');
  if (saved !== null) {
    const v = parseInt(saved);
    const r = getColRange();
    if (v >= r.min && v <= r.max) return v;
  }
  return getDefaultCols();
})();

/**
 * Liefert den erlaubten Spaltenbereich basierend auf der Viewport-Breite.
 * @returns {{ min: number, max: number }}
 */
export function getColRange() {
  return window.innerWidth <= 600
    ? { min: 1, max: 7 }
    : { min: 3, max: 10 };
}

/**
 * Liefert die Standard-Spaltenanzahl (Mitte des Bereichs).
 * @returns {number}
 */
export function getDefaultCols() {
  const r = getColRange();
  return Math.round((r.min + r.max) / 2);
}

/**
 * Liefert die aktuelle Spaltenanzahl.
 * @returns {number}
 */
export function getGridCols() {
  return gridCols;
}

/**
 * Wendet die Spaltenanzahl auf ein Grid an und speichert sie.
 * @param {number} cols
 * @param {string} [gridSelector='#feed-grid']
 */
export function applyGridCols(cols, gridSelector = '#feed-grid') {
  gridCols = cols;
  const grid = document.querySelector(gridSelector);
  if (grid) {
    grid.style.gridTemplateColumns = cols === 1 ? '1fr' : `repeat(${cols}, 1fr)`;
  }
  localStorage.setItem('grid_cols', String(cols));
  // Dispatch event so other components can react
  window.dispatchEvent(new CustomEvent('gridcolschange', { detail: { cols } }));
}

/**
 * Initialisiert das Grid mit der gespeicherten Spaltenanzahl
 * und lauscht auf Resize, um den Bereich anzupassen.
 * @param {string} [gridSelector='#feed-grid']
 */
export function initGridCols(gridSelector = '#feed-grid') {
  applyGridCols(gridCols, gridSelector);
  window.addEventListener('resize', () => {
    const r = getColRange();
    const clamped = Math.max(r.min, Math.min(r.max, gridCols));
    if (clamped !== gridCols) applyGridCols(clamped, gridSelector);
  });
}