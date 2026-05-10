// src/js/grid-controls.js
// Swipe-Control + Filter-Popup für das einheitliche Grid-System

import { getColRange, getGridCols, applyGridCols } from './grid-utils.js';

/**
 * Rendert die Grid-Controls (Button + Filter-Popup) in einen Container.
 * @param {HTMLElement} container
 * @param {string} gridSelector - CSS-Selektor für das Grid-Element
 */
export function renderGridControls(container, gridSelector) {
  container.innerHTML = `
    <div class="grid-controls">
      <button class="grid-controls-btn" id="gridFilterBtn" aria-label="Kachelgröße">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;display:block">
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/>
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.2"/>
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/>
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.2"/>
        </svg>
      </button>
    </div>
  `;

  // Filter Popup
  const popup = document.createElement('div');
  popup.className = 'filter-popup';
  popup.id = 'gridFilterPopup';
  popup.innerHTML = `
    <div class="fp-header">Kachelgröße</div>
    <div class="swipe-control" id="swipeControl">
      <button class="swipe-arrow" id="colDec" aria-label="Weniger Spalten">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;display:block">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <div class="swipe-track-wrap">
        <div class="swipe-track" id="swipeTrack">
          <div class="swipe-fill" id="swipeFill"></div>
          <div class="swipe-thumb" id="swipeThumb"><span id="swipeValue">${getGridCols()}</span></div>
        </div>
      </div>
      <button class="swipe-arrow" id="colInc" aria-label="Mehr Spalten">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;display:block">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    </div>
    <div class="fp-divider"></div>
    <button class="fp-sort-btn" id="sortNewestBtn">
      <span class="fp-sort-icon">🕐</span> Zuletzt hinzugefügt
    </button>
  `;
  container.appendChild(popup);

  // Wire up swipe control
  wireSwipeControl(gridSelector);
  wireFilterPopup(container);
}

// ─── Swipe Control ─────────────────────────────────────────────────────────────

function wireSwipeControl(gridSelector) {
  const swipeThumb = document.getElementById('swipeThumb');
  const swipeTrack = document.getElementById('swipeTrack');
  const swipeFill = document.getElementById('swipeFill');
  const swipeValue = document.getElementById('swipeValue');
  const colDec = document.getElementById('colDec');
  const colInc = document.getElementById('colInc');

  if (!swipeThumb) return;

  function updateSwipeUI() {
    const r = getColRange();
    const cols = getGridCols();
    const pct = r.max > r.min ? ((cols - r.min) / (r.max - r.min)) * 100 : 50;
    swipeThumb.style.left = pct + '%';
    swipeFill.style.width = pct + '%';
    swipeValue.textContent = cols;
  }

  let _drag = false;

  function startDrag(e) {
    _drag = true;
    swipeThumb.classList.add('dragging');
    e.preventDefault();
  }

  function moveDrag(cx) {
    if (!_drag) return;
    const rect = swipeTrack.getBoundingClientRect();
    let pct = (cx - rect.left) / rect.width;
    pct = Math.max(0, Math.min(1, pct));
    const r = getColRange();
    const cols = Math.round(r.min + pct * (r.max - r.min));
    if (cols !== getGridCols()) applyGridCols(cols, gridSelector);
    updateSwipeUI();
  }

  function endDrag() {
    if (!_drag) return;
    _drag = false;
    swipeThumb.classList.remove('dragging');
  }

  swipeThumb.addEventListener('touchstart', startDrag, { passive: false });
  document.addEventListener('touchmove', e => { if (_drag) moveDrag(e.touches[0].clientX); }, { passive: true });
  document.addEventListener('touchend', endDrag, { passive: true });
  swipeThumb.addEventListener('mousedown', startDrag);
  document.addEventListener('mousemove', e => { if (_drag) moveDrag(e.clientX); });
  document.addEventListener('mouseup', endDrag);
  swipeTrack.addEventListener('click', e => { if (e.target !== swipeThumb) moveDrag(e.clientX); });

  colDec.onclick = () => {
    const r = getColRange();
    if (getGridCols() > r.min) applyGridCols(getGridCols() - 1, gridSelector);
    updateSwipeUI();
  };
  colInc.onclick = () => {
    const r = getColRange();
    if (getGridCols() < r.max) applyGridCols(getGridCols() + 1, gridSelector);
    updateSwipeUI();
  };

  // Listen for external changes
  window.addEventListener('gridcolschange', updateSwipeUI);
  updateSwipeUI();
}

// ─── Filter Popup ──────────────────────────────────────────────────────────────

function wireFilterPopup(container) {
  const btn = container.querySelector('#gridFilterBtn');
  const popup = document.getElementById('gridFilterPopup');
  if (!btn || !popup) return;

  btn.onclick = e => {
    e.stopPropagation();
    popup.classList.toggle('show');
  };

  document.addEventListener('click', e => {
    if (!e.target.closest('#gridFilterPopup') && !e.target.closest('#gridFilterBtn')) {
      popup.classList.remove('show');
    }
  });
}