/**
 * Smart Shopping Card for Home Assistant — v1.2.0
 *
 * Architecture: card body and modal layer are separate DOM nodes.
 * _updateDisplay() ONLY touches _cardDiv — never the modal.
 * This means HA state updates, filter clicks, etc. cannot steal focus
 * from any open modal input field.
 */

const CARD_VERSION = "1.3.0";

const DEFAULT_CATEGORIES = [
  { name: "Produce",       icon: "🥦", color: "#4CAF50" },
  { name: "Dairy",         icon: "🧀", color: "#2196F3" },
  { name: "Meat",          icon: "🥩", color: "#F44336" },
  { name: "Bakery",        icon: "🍞", color: "#FF9800" },
  { name: "Frozen",        icon: "🧊", color: "#00BCD4" },
  { name: "Beverages",     icon: "🥤", color: "#9C27B0" },
  { name: "Snacks",        icon: "🍿", color: "#FFEB3B" },
  { name: "Household",     icon: "🏠", color: "#607D8B" },
  { name: "Personal Care", icon: "🧴", color: "#E91E63" },
  { name: "Other",         icon: "📦", color: "#9E9E9E" },
];

const DEFAULT_STORES = [
  { name: "Grocery Store", icon: "🛒", latitude: null, longitude: null, radius: 100 },
];

const CAT_ICONS   = ["🥦","🧀","🥩","🍞","🧊","🥤","🍿","🏠","🧴","📦","🍎","🥛","🥚","🍗","🐟","🍅","🧅","🫑","🥕","🌽"];
const STORE_ICONS = ["🛒","🏪","🏬","🛍️","🏥","🌿","🥖","🍷"];

function isImageUrl(v) {
  if (!v) return false;
  return v.startsWith("http") || v.startsWith("/") || v.startsWith("data:") ||
    /\.(png|jpg|jpeg|gif|svg|webp)(\?|$)/i.test(v);
}

function renderIcon(icon, cls = "png-icon", alt = "") {
  if (!icon) return "📦";
  if (isImageUrl(icon)) {
    return `<img class="${cls}" src="${icon}" alt="${alt}" onerror="this.style.display='none'">`;
  }
  return icon;
}

// ─────────────────────────── STYLES ───────────────────────────

const CARD_STYLES = `
  :host {
    --ss-bg: var(--card-background-color, #1a1a2e);
    --ss-surface: var(--secondary-background-color, #16213e);
    --ss-primary: #00d4aa;
    --ss-accent: #ff6b6b;
    --ss-text: var(--primary-text-color, #e0e0e0);
    --ss-text-secondary: var(--secondary-text-color, #9e9e9e);
    --ss-border: rgba(255,255,255,0.08);
    --ss-radius: 16px;
    --ss-font: 'Segoe UI', system-ui, sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }

  .card-wrap { background: var(--ss-bg); border-radius: var(--ss-radius); overflow: hidden; font-family: var(--ss-font); color: var(--ss-text); position: relative; }

  /* HEADER */
  .card-header { background: linear-gradient(135deg,#0f3460,#16213e 50%,#0f3460); padding:20px; display:flex; align-items:center; gap:14px; border-bottom:1px solid var(--ss-border); position:relative; overflow:hidden; }
  .card-header::before { content:''; position:absolute; top:-50%; right:-20%; width:200px; height:200px; background:radial-gradient(circle,rgba(0,212,170,.15),transparent 70%); border-radius:50%; pointer-events:none; }
  .header-icon { font-size:32px; width:52px; height:52px; background:linear-gradient(135deg,var(--ss-primary),#00a884); border-radius:14px; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 16px rgba(0,212,170,.3); flex-shrink:0; }
  .header-text { flex:1; }
  .header-title { font-size:20px; font-weight:700; letter-spacing:-.3px; color:#fff; }
  .header-subtitle { font-size:12px; color:var(--ss-primary); margin-top:2px; font-weight:500; }
  .header-actions { display:flex; gap:8px; align-items:center; }
  .badge { background:var(--ss-accent); color:#fff; border-radius:20px; padding:4px 10px; font-size:12px; font-weight:700; min-width:28px; text-align:center; }

  .icon-btn { background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.12); border-radius:10px; width:36px; height:36px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all .2s; font-size:16px; color:var(--ss-text); }
  .icon-btn:hover { background:rgba(0,212,170,.2); border-color:var(--ss-primary); color:var(--ss-primary); transform:translateY(-1px); }
  .icon-btn.active { background:var(--ss-primary); border-color:var(--ss-primary); color:#000; }

  /* BARS */
  .store-bar, .category-bar { display:flex; gap:8px; overflow-x:auto; scrollbar-width:none; border-bottom:1px solid var(--ss-border); }
  .store-bar { background:var(--ss-surface); padding:12px 16px; }
  .category-bar { padding:10px 16px; background:var(--ss-bg); }
  .store-bar::-webkit-scrollbar, .category-bar::-webkit-scrollbar { display:none; }

  .store-chip { flex-shrink:0; background:rgba(255,255,255,.05); border:1px solid var(--ss-border); border-radius:24px; padding:6px 14px; font-size:13px; cursor:pointer; transition:all .2s; display:flex; align-items:center; gap:6px; white-space:nowrap; color:var(--ss-text); }
  .store-chip:hover { background:rgba(0,212,170,.1); border-color:var(--ss-primary); }
  .store-chip.active { background:rgba(0,212,170,.15); border-color:var(--ss-primary); color:var(--ss-primary); font-weight:600; }

  .cat-chip { flex-shrink:0; border-radius:20px; padding:5px 12px; font-size:12px; cursor:pointer; transition:all .2s; display:flex; align-items:center; gap:5px; border:1.5px solid transparent; white-space:nowrap; background:rgba(255,255,255,.05); color:var(--ss-text-secondary); }
  .cat-chip.active { font-weight:600; color:#fff; }

  /* PROGRESS */
  .progress-section { padding:12px 16px; border-bottom:1px solid var(--ss-border); background:linear-gradient(90deg,rgba(15,52,96,.4),rgba(22,33,62,.4)); }
  .progress-bar-track { width:100%; height:6px; background:rgba(255,255,255,.08); border-radius:3px; overflow:hidden; margin-top:8px; }
  .progress-bar-fill { height:100%; background:linear-gradient(90deg,var(--ss-primary),#00a884); border-radius:3px; transition:width .5s ease; }
  .progress-label { display:flex; justify-content:space-between; font-size:12px; color:var(--ss-text-secondary); }
  .progress-pct { font-weight:700; color:var(--ss-primary); }

  /* SEARCH */
  .search-wrap { padding:12px 16px; background:var(--ss-surface); border-bottom:1px solid var(--ss-border); }
  .search-input { width:100%; background:rgba(255,255,255,.05); border:1px solid var(--ss-border); border-radius:10px; padding:9px 14px; font-size:14px; color:var(--ss-text); outline:none; transition:border-color .2s; font-family:var(--ss-font); }
  .search-input::placeholder { color:var(--ss-text-secondary); }
  .search-input:focus { border-color:var(--ss-primary); }

  /* ITEMS */
  .items-container { max-height:420px; overflow-y:auto; scrollbar-width:thin; scrollbar-color:rgba(255,255,255,.1) transparent; }
  .items-container::-webkit-scrollbar { width:4px; }
  .items-container::-webkit-scrollbar-thumb { background:rgba(255,255,255,.1); border-radius:2px; }

  .cat-header { padding:10px 16px 6px; font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:var(--ss-text-secondary); display:flex; align-items:center; gap:8px; position:sticky; top:0; background:var(--ss-bg); z-index:1; }
  .cat-header::after { content:''; flex:1; height:1px; background:var(--ss-border); }

  .shopping-item { display:flex; align-items:center; gap:12px; padding:10px 16px; transition:all .2s; cursor:pointer; border-bottom:1px solid var(--ss-border); position:relative; }
  .shopping-item:last-child { border-bottom:none; }
  .shopping-item:hover { background:rgba(255,255,255,.03); }
  .shopping-item.checked { opacity:.45; }

  .item-image { width:44px; height:44px; border-radius:10px; object-fit:cover; flex-shrink:0; background:rgba(255,255,255,.05); }
  .item-image-placeholder { width:44px; height:44px; border-radius:10px; background:rgba(255,255,255,.05); display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0; }

  .item-info { flex:1; min-width:0; }
  .item-name { font-size:14px; font-weight:500; color:var(--ss-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .shopping-item.checked .item-name { text-decoration:line-through; color:var(--ss-text-secondary); }
  .item-meta { font-size:11px; color:var(--ss-text-secondary); margin-top:2px; display:flex; gap:8px; align-items:center; }
  .item-store-tag { background:rgba(255,255,255,.06); border-radius:4px; padding:1px 6px; font-size:10px; }
  .item-qty { background:rgba(0,212,170,.15); color:var(--ss-primary); border-radius:6px; padding:2px 8px; font-size:12px; font-weight:700; flex-shrink:0; }

  .item-actions { display:flex; gap:4px; opacity:0; transition:opacity .2s; }
  .shopping-item:hover .item-actions { opacity:1; }
  .item-action-btn { background:rgba(255,255,255,.06); border:none; border-radius:7px; width:28px; height:28px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:13px; color:var(--ss-text); transition:all .15s; }
  .item-action-btn:hover { background:rgba(255,107,107,.2); color:var(--ss-accent); }

  .check-btn { width:22px; height:22px; border-radius:50%; border:2px solid var(--ss-border); background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:all .2s; font-size:12px; color:transparent; }
  .check-btn:hover { border-color:var(--ss-primary); background:rgba(0,212,170,.1); color:var(--ss-primary); }
  .check-btn.checked { background:var(--ss-primary); border-color:var(--ss-primary); color:#000; }

  .empty-state { text-align:center; padding:48px 20px; color:var(--ss-text-secondary); }
  .empty-icon { font-size:48px; margin-bottom:12px; }
  .empty-text { font-size:16px; font-weight:500; margin-bottom:6px; }
  .empty-sub { font-size:13px; opacity:.7; }

  /* FOOTER */
  .card-footer { padding:12px 16px; border-top:1px solid var(--ss-border); background:var(--ss-surface); display:flex; gap:8px; }
  .add-input { flex:1; background:rgba(255,255,255,.05); border:1px solid var(--ss-border); border-radius:10px; padding:9px 14px; font-size:14px; color:var(--ss-text); outline:none; transition:border-color .2s; font-family:var(--ss-font); }
  .add-input::placeholder { color:var(--ss-text-secondary); }
  .add-input:focus { border-color:var(--ss-primary); }
  .add-btn { background:linear-gradient(135deg,var(--ss-primary),#00a884); border:none; border-radius:10px; width:42px; height:40px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:20px; color:#000; transition:all .2s; font-weight:700; flex-shrink:0; }
  .add-btn:hover { transform:translateY(-1px); box-shadow:0 4px 16px rgba(0,212,170,.3); }

  /* SETTINGS */
  .tab-bar { display:flex; border-bottom:1px solid var(--ss-border); padding:0 20px; gap:4px; }
  .tab-btn { padding:10px 14px; font-size:13px; font-weight:600; cursor:pointer; border:none; background:transparent; color:var(--ss-text-secondary); border-bottom:2px solid transparent; transition:all .2s; white-space:nowrap; }
  .tab-btn.active { color:var(--ss-primary); border-bottom-color:var(--ss-primary); }
  .settings-section { margin-bottom:20px; }
  .settings-section-title { font-size:13px; font-weight:700; color:var(--ss-text-secondary); letter-spacing:.5px; text-transform:uppercase; margin-bottom:10px; display:flex; align-items:center; gap:8px; }
  .settings-list { display:flex; flex-direction:column; gap:8px; }
  .settings-item { background:rgba(255,255,255,.04); border:1px solid var(--ss-border); border-radius:10px; padding:10px 14px; display:flex; align-items:center; gap:10px; font-size:14px; }
  .settings-item-icon { font-size:20px; display:flex; align-items:center; }
  .settings-item-name { flex:1; }
  .settings-item-remove { background:transparent; border:none; color:var(--ss-text-secondary); cursor:pointer; font-size:16px; padding:0; transition:color .2s; }
  .settings-item-remove:hover { color:var(--ss-accent); }
  .color-dot { width:12px; height:12px; border-radius:50%; flex-shrink:0; }

  /* ICON SIZES */
  .png-icon    { width:24px; height:24px; object-fit:contain; border-radius:4px; flex-shrink:0; }
  .png-icon-sm { width:18px; height:18px; object-fit:contain; border-radius:3px; flex-shrink:0; }
  .png-icon-lg { width:32px; height:32px; object-fit:contain; border-radius:6px; flex-shrink:0; }

  /* MODAL OVERLAY — rendered in _modalDiv, never touched by _updateDisplay */
  .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.75); backdrop-filter:blur(4px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px; animation:fadeIn .2s ease; }
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }
  @keyframes slideUp { from{transform:translateY(30px);opacity:0} to{transform:translateY(0);opacity:1} }

  .modal { background:#1a1a2e; border:1px solid rgba(255,255,255,.1); border-radius:20px; width:100%; max-width:480px; max-height:90vh; overflow-y:auto; box-shadow:0 24px 80px rgba(0,0,0,.5); animation:slideUp .25s ease; }
  .modal-header { padding:20px 20px 0; display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
  .modal-title { font-size:18px; font-weight:700; color:#fff; display:flex; align-items:center; gap:10px; }
  .modal-close { background:rgba(255,255,255,.08); border:none; border-radius:8px; width:32px; height:32px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:18px; color:var(--ss-text); transition:all .2s; }
  .modal-close:hover { background:rgba(255,107,107,.2); color:var(--ss-accent); }
  .modal-body { padding:0 20px 20px; }

  .form-group { margin-bottom:14px; }
  .form-label { display:block; font-size:12px; font-weight:600; color:var(--ss-text-secondary); letter-spacing:.5px; margin-bottom:6px; text-transform:uppercase; }
  .form-input, .form-select { width:100%; background:rgba(255,255,255,.05); border:1px solid var(--ss-border); border-radius:10px; padding:10px 14px; font-size:14px; color:var(--ss-text); outline:none; transition:border-color .2s; font-family:var(--ss-font); appearance:none; }
  .form-input::placeholder { color:var(--ss-text-secondary); }
  .form-input:focus, .form-select:focus { border-color:var(--ss-primary); }
  .form-select option { background:#1a1a2e; }
  .form-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }

  .btn-primary { width:100%; background:linear-gradient(135deg,var(--ss-primary),#00a884); border:none; border-radius:10px; padding:12px; font-size:15px; font-weight:600; color:#000; cursor:pointer; transition:all .2s; margin-top:4px; }
  .btn-primary:hover { transform:translateY(-1px); box-shadow:0 4px 20px rgba(0,212,170,.3); }
  .btn-danger { background:rgba(255,107,107,.15); color:var(--ss-accent); border:1px solid rgba(255,107,107,.3); border-radius:10px; padding:10px 16px; cursor:pointer; font-size:13px; font-weight:600; transition:all .2s; }
  .btn-danger:hover { background:rgba(255,107,107,.25); }

  /* ICON PICKER */
  .icon-picker-tabs { display:flex; gap:4px; margin-bottom:10px; background:rgba(255,255,255,.04); border-radius:10px; padding:4px; }
  .icon-picker-tab { flex:1; padding:6px; text-align:center; font-size:12px; font-weight:600; cursor:pointer; border-radius:7px; border:none; background:transparent; color:var(--ss-text-secondary); transition:all .2s; }
  .icon-picker-tab.active { background:var(--ss-primary); color:#000; }

  .category-icon-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-top:8px; }
  .category-icon-opt { aspect-ratio:1; background:rgba(255,255,255,.05); border:1.5px solid transparent; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:22px; cursor:pointer; transition:all .15s; }
  .category-icon-opt:hover, .category-icon-opt.selected { border-color:var(--ss-primary); background:rgba(0,212,170,.1); }

  .icon-url-row { display:flex; gap:10px; align-items:center; }
  .icon-url-preview { width:48px; height:48px; border-radius:10px; border:1px solid var(--ss-border); object-fit:contain; background:rgba(255,255,255,.05); flex-shrink:0; }
  .icon-url-placeholder { width:48px; height:48px; border-radius:10px; border:1px dashed var(--ss-border); display:flex; align-items:center; justify-content:center; font-size:24px; color:var(--ss-text-secondary); flex-shrink:0; }

  .image-preview-row { display:flex; gap:10px; align-items:center; }
  .image-preview { width:60px; height:60px; border-radius:10px; object-fit:cover; border:1px solid var(--ss-border); }
  .image-preview-placeholder { width:60px; height:60px; border-radius:10px; border:1px dashed var(--ss-border); display:flex; align-items:center; justify-content:center; font-size:24px; color:var(--ss-text-secondary); }

  /* ═══════════════ LAYOUT: COMPACT ═══════════════ */
  .layout-compact .shopping-item { padding:6px 14px; gap:8px; }
  .layout-compact .item-image,
  .layout-compact .item-image-placeholder { display:none !important; }
  .layout-compact .item-name { font-size:13px; }
  .layout-compact .item-meta { display:none; }
  .layout-compact .item-qty { font-size:11px; padding:1px 6px; }
  .layout-compact .cat-header { padding:6px 14px 4px; font-size:10px; }
  .layout-compact .check-btn { width:18px; height:18px; font-size:10px; }

  /* ═══════════════ LAYOUT: GRID ═══════════════ */
  .layout-grid .items-container { padding:10px; }
  .layout-grid .cat-header { padding:8px 4px 4px; font-size:10px; }
  .layout-grid .items-grid {
    display:grid;
    grid-template-columns:repeat(var(--ss-cols,3), 1fr);
    gap:8px;
    margin-bottom:8px;
  }
  .layout-grid .grid-item {
    background:rgba(255,255,255,.04);
    border:1px solid var(--ss-border);
    border-radius:12px;
    overflow:hidden;
    cursor:pointer;
    transition:all .2s;
    position:relative;
    display:flex;
    flex-direction:column;
  }
  .layout-grid .grid-item:hover { background:rgba(255,255,255,.07); transform:translateY(-1px); }
  .layout-grid .grid-item.checked { opacity:.4; }
  .layout-grid .grid-item-img {
    width:100%; aspect-ratio:1; object-fit:cover;
    background:rgba(255,255,255,.05);
    display:flex; align-items:center; justify-content:center;
    font-size:32px; flex-shrink:0;
  }
  .layout-grid .grid-item-img img { width:100%; height:100%; object-fit:cover; }
  .layout-grid .grid-item-body { padding:8px; flex:1; }
  .layout-grid .grid-item-name { font-size:12px; font-weight:600; line-height:1.3; color:var(--ss-text); }
  .layout-grid .grid-item.checked .grid-item-name { text-decoration:line-through; color:var(--ss-text-secondary); }
  .layout-grid .grid-item-qty { font-size:10px; color:var(--ss-primary); font-weight:700; margin-top:3px; }
  .layout-grid .grid-check {
    position:absolute; top:6px; left:6px;
    width:22px; height:22px; border-radius:50%;
    border:2px solid rgba(255,255,255,.3);
    background:rgba(0,0,0,.4);
    cursor:pointer; display:flex; align-items:center; justify-content:center;
    font-size:11px; color:transparent; transition:all .2s; backdrop-filter:blur(4px);
  }
  .layout-grid .grid-check:hover { border-color:var(--ss-primary); color:var(--ss-primary); }
  .layout-grid .grid-check.checked { background:var(--ss-primary); border-color:var(--ss-primary); color:#000; }
  .layout-grid .grid-remove {
    position:absolute; top:6px; right:6px; opacity:0;
    width:22px; height:22px; border-radius:50%;
    border:none; background:rgba(255,107,107,.8);
    color:#fff; font-size:11px; cursor:pointer;
    display:flex; align-items:center; justify-content:center;
    transition:opacity .2s; backdrop-filter:blur(4px);
  }
  .layout-grid .grid-item:hover .grid-remove { opacity:1; }

  /* ═══════════════ LAYOUT TOGGLE BTN ═══════════════ */
  .layout-btn { position:relative; }
  .layout-menu {
    position:absolute; top:calc(100% + 6px); right:0;
    background:#1a1a2e; border:1px solid rgba(255,255,255,.12);
    border-radius:12px; padding:6px; z-index:200;
    box-shadow:0 8px 24px rgba(0,0,0,.4);
    display:flex; flex-direction:column; gap:4px; min-width:130px;
    animation:slideUp .15s ease;
  }
  .layout-option {
    display:flex; align-items:center; gap:8px;
    padding:8px 10px; border-radius:8px; cursor:pointer;
    font-size:13px; font-weight:500; color:var(--ss-text);
    border:none; background:transparent; width:100%; text-align:left;
    transition:background .15s;
  }
  .layout-option:hover { background:rgba(255,255,255,.06); }
  .layout-option.active { background:rgba(0,212,170,.15); color:var(--ss-primary); }

  /* ═══════════════ SIZE CONTROL ═══════════════ */
  .size-control {
    display:flex; align-items:center; gap:10px; padding:8px 16px;
    background:rgba(255,255,255,.02); border-bottom:1px solid var(--ss-border);
    font-size:12px; color:var(--ss-text-secondary);
  }
  .size-slider { flex:1; accent-color:var(--ss-primary); cursor:pointer; }
  .size-label { min-width:32px; text-align:right; font-weight:600; color:var(--ss-primary); font-size:11px; }

  /* STORE POPUP */
  .store-popup { position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:linear-gradient(135deg,#0f3460,#16213e); border:1px solid var(--ss-primary); border-radius:16px; padding:16px 20px; z-index:10000; box-shadow:0 8px 32px rgba(0,212,170,.25); display:flex; align-items:center; gap:14px; min-width:300px; animation:slideUp .3s ease; }
  .popup-icon { font-size:32px; display:flex; align-items:center; }
  .popup-content { flex:1; }
  .popup-title { font-size:14px; font-weight:700; color:#fff; }
  .popup-subtitle { font-size:12px; color:var(--ss-primary); margin-top:2px; }
  .popup-open-btn { background:var(--ss-primary); border:none; border-radius:8px; padding:8px 14px; font-size:13px; font-weight:700; color:#000; cursor:pointer; white-space:nowrap; transition:all .2s; }
  .popup-close-btn { background:transparent; border:none; color:var(--ss-text-secondary); cursor:pointer; font-size:18px; padding:0 4px; }
`;

// ─────────────────────────── CARD ELEMENT ───────────────────────────

class SmartShoppingCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    // State
    this._hass        = null;
    this._config      = {};
    this._entityId    = null;
    this._rendered    = false;
    this._state = {
      items: [], stores: [...DEFAULT_STORES], categories: [...DEFAULT_CATEGORIES],
      todo_entity: "", unchecked_count: 0, total_count: 0,
    };

    // UI state
    this._view            = "list";
    this._activeStore     = "all";
    this._activeCategory  = "all";
    this._searchQuery     = "";
    this._settingsTab     = "stores";
    this._showLayoutMenu  = false;

    // Modal state — persisted separately so HA updates don't destroy them
    this._modalType       = null;   // "add_item" | "add_store" | "add_category" | "store_popup"
    this._storePopupData  = null;
    this._storeIconTab    = "emoji";
    this._catIconTab      = "emoji";

    // Form values — kept in state so we can restore on re-open
    this._itemForm  = { name:"", category:"Other", quantity:1, unit:"", image_url:"", store:"", notes:"" };
    this._storeForm = { name:"", icon:"🛒", latitude:"", longitude:"", radius:100 };
    this._catForm   = { name:"", icon:"📦", color:"#607D8B" };

    // DOM refs
    this._cardDiv  = null;
    this._modalDiv = null;

    // Layout & size — overridden by config YAML
    this._layout    = "list";   // "list" | "grid" | "compact"
    this._maxHeight = 420;
  }

  // ── Config / hass ──────────────────────────────────────────────────

  setConfig(config) {
    this._config   = config;
    this._entityId = config.entity_id || null;

    // Layout from YAML (user can also toggle at runtime)
    if (config.layout && ["list","grid","compact"].includes(config.layout))
      this._layout = config.layout;
    if (config.max_height && !isNaN(config.max_height))
      this._maxHeight = parseInt(config.max_height);

    this._initDOM();
  }

  set hass(hass) {
    this._hass = hass;
    this._syncFromHA();
    if (!this._rendered) this._initDOM();
  }

  _syncFromHA() {
    if (!this._hass || !this._entityId) return;
    const stateObj = this._hass.states[this._entityId];
    if (!stateObj) return;
    const a = stateObj.attributes;
    if (a.items !== undefined) {
      this._state.items           = a.items        || [];
      this._state.stores          = a.stores        || DEFAULT_STORES;
      this._state.categories      = a.categories    || DEFAULT_CATEGORIES;
      this._state.todo_entity     = a.todo_entity   || "";
      this._state.unchecked_count = a.unchecked_count || 0;
      this._state.total_count     = a.total_count   || 0;
    }
    // Only update the card body — NEVER touch _modalDiv
    this._updateCard();
  }

  // ── DOM init ───────────────────────────────────────────────────────

  _initDOM() {
    if (this._rendered) return;
    this._rendered = true;
    const root = this.shadowRoot;
    root.innerHTML = "";

    const style = document.createElement("style");
    style.textContent = CARD_STYLES;
    root.appendChild(style);

    const wrap = document.createElement("div");
    wrap.className = "card-wrap";
    root.appendChild(wrap);

    // Two independent layers
    this._cardDiv  = document.createElement("div");
    this._modalDiv = document.createElement("div");
    wrap.appendChild(this._cardDiv);
    wrap.appendChild(this._modalDiv);

    this._updateCard();
  }

  // ── Card body update (safe — never touches modal) ──────────────────

  _updateCard() {
    if (!this._cardDiv) return;
    this._cardDiv.innerHTML = this._buildCardHTML();
    this._bindCardEvents();
  }

  // ── Modal open/close (independent of card body) ────────────────────

  _openModal(type) {
    this._modalType = type;
    this._modalDiv.innerHTML = this._buildModalHTML(type);
    this._bindModalEvents();
  }

  _closeModal() {
    this._modalType = null;
    this._modalDiv.innerHTML = "";
    // Refresh card counts/state only
    this._updateCard();
  }

  // ── Service call ───────────────────────────────────────────────────

  _callService(service, data = {}) {
    if (!this._hass) return;
    this._hass.callService("smart_shopping", service, data);
  }

  // ── Helpers ────────────────────────────────────────────────────────

  _getCategoryInfo(name) {
    return this._state.categories.find(c => c.name === name) || { name, icon:"📦", color:"#9E9E9E" };
  }

  _calcProgress() {
    const total = this._state.total_count;
    if (!total) return 0;
    return Math.round(((total - this._state.unchecked_count) / total) * 100);
  }

  _getFilteredItems() {
    let items = [...this._state.items];
    if (this._activeStore !== "all")    items = items.filter(i => !i.store || i.store === this._activeStore);
    if (this._activeCategory !== "all") items = items.filter(i => i.category === this._activeCategory);
    if (this._searchQuery) {
      const q = this._searchQuery.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q));
    }
    return items;
  }

  _getGroupedItems() {
    const groups = {};
    for (const item of this._getFilteredItems()) {
      const cat = item.category || "Other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    for (const cat of Object.keys(groups))
      groups[cat].sort((a, b) => (a.checked ? 1 : 0) - (b.checked ? 1 : 0));
    return groups;
  }

  // ── Card HTML ──────────────────────────────────────────────────────

  _buildCardHTML() {
    const pct    = this._calcProgress();
    const groups = this._getGroupedItems();
    const total  = Object.values(groups).flat().length;
    const cfg    = this._config;

    // Apply layout class and CSS vars to the card div itself
    this._cardDiv.className = `layout-${this._layout}`;
    const cols = parseInt(cfg.columns) || (this._layout === "grid" ? 3 : 1);
    this._cardDiv.style.setProperty("--ss-cols", cols);

    const showProgress  = cfg.show_progress  !== false;
    const showSearch    = cfg.show_search    !== false;
    const showStoreBar  = cfg.show_store_bar !== false;
    const showCatBar    = cfg.show_categories !== false;

    return `
      ${this._buildHeader()}
      ${showStoreBar  ? this._buildStoreBar()     : ""}
      ${showCatBar    ? this._buildCategoryBar()  : ""}
      ${showProgress  ? this._buildProgress(pct)  : ""}
      ${this._buildSizeControl()}
      ${showSearch    ? this._buildSearchBar()    : ""}
      ${this._view === "settings" ? this._buildSettings() : this._buildItemsList(groups, total)}
      ${this._view !== "settings" ? this._buildFooter() : ""}
    `;
  }

  _buildLayoutMenu() {
    if (!this._showLayoutMenu) return "";
    const layoutIcons  = { list:"☰", grid:"⊞", compact:"≡" };
    const layoutLabels = { list:"List", grid:"Grid", compact:"Dense" };
    const opts = ["list","grid","compact"].map(l =>
      '<button class="layout-option ' + (this._layout===l?"active":"") + '" data-layout="' + l + '">' +
      '<span style="font-size:16px">' + layoutIcons[l] + '</span> ' + layoutLabels[l] +
      '</button>'
    ).join("");
    return '<div class="layout-menu">' + opts + '</div>';
  }

  _buildHeader() {
    const u = this._state.unchecked_count;
    const todoLabel = (this._state.todo_entity || "").replace("todo.","").replace(/_/g," ") || "No list";
    const layoutIcons = { list:"☰", grid:"⊞", compact:"≡" };
    const clearBtn = (u < this._state.total_count && this._state.total_count > 0)
      ? '<button class="icon-btn" id="hdr-clear" style="color:#ff6b6b" title="Clear checked">🗑</button>'
      : "";
    return `
      <div class="card-header">
        <div class="header-icon">🛒</div>
        <div class="header-text">
          <div class="header-title">Smart Shopping</div>
          <div class="header-subtitle">📋 ${todoLabel}</div>
        </div>
        <div class="header-actions">
          ${u > 0 ? '<div class="badge">' + u + '</div>' : ""}
          <button class="icon-btn" id="hdr-add" title="Add Item">＋</button>
          <div class="layout-btn">
            <button class="icon-btn ${this._showLayoutMenu ? "active" : ""}" id="hdr-layout"
              title="Change layout" style="font-size:18px">${layoutIcons[this._layout]}</button>
            ${this._buildLayoutMenu()}
          </div>
          <button class="icon-btn ${this._view === "settings" ? "active" : ""}" id="hdr-settings" title="Settings">⚙</button>
          ${clearBtn}
        </div>
      </div>`;
  }

  _buildSizeControl() {
    if (this._config.show_size_control === false) return "";
    const cols = parseInt(this._config.columns) || 3;
    const colsHtml = this._layout === "grid"
      ? '<span style="margin-left:8px">⊞ Cols</span>' +
        '<input class="size-slider" id="cols-slider" type="range" min="2" max="5" step="1" value="' + cols + '" style="max-width:80px">' +
        '<span class="size-label">' + cols + '</span>'
      : "";
    return `
      <div class="size-control">
        <span>↕ Height</span>
        <input class="size-slider" id="size-slider" type="range" min="150" max="800" step="10" value="${this._maxHeight}">
        <span class="size-label">${this._maxHeight}px</span>
        ${colsHtml}
      </div>`;
  }

  _buildStoreBar() {
    return `
      <div class="store-bar">
        <div class="store-chip ${this._activeStore==="all"?"active":""}" data-store="all">🌐 All Stores</div>
        ${this._state.stores.map(s => `
          <div class="store-chip ${this._activeStore===s.name?"active":""}" data-store="${s.name}">
            ${renderIcon(s.icon||"🛒","png-icon-sm",s.name)} ${s.name}
          </div>`).join("")}
        <div class="store-chip" id="bar-add-store" style="border-style:dashed;color:var(--ss-text-secondary)">＋ Store</div>
      </div>`;
  }

  _buildCategoryBar() {
    return `
      <div class="category-bar">
        <div class="cat-chip ${this._activeCategory==="all"?"active":""}" data-cat="all"
             style="${this._activeCategory==="all"?"background:rgba(0,212,170,.15);border-color:var(--ss-primary);color:var(--ss-primary)":""}">
          All
        </div>
        ${this._state.categories.map(c => `
          <div class="cat-chip ${this._activeCategory===c.name?"active":""}" data-cat="${c.name}"
               style="${this._activeCategory===c.name?`background:${c.color}22;border-color:${c.color};color:${c.color}`:""}">
            ${renderIcon(c.icon,"png-icon-sm",c.name)} ${c.name}
          </div>`).join("")}
        <div class="cat-chip" id="bar-add-cat" style="border-style:dashed;color:var(--ss-text-secondary)">＋ Cat</div>
      </div>`;
  }

  _buildProgress(pct) {
    const checked = this._state.total_count - this._state.unchecked_count;
    return `
      <div class="progress-section">
        <div class="progress-label">
          <span>${checked} of ${this._state.total_count} items</span>
          <span class="progress-pct">${pct}%</span>
        </div>
        <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      </div>`;
  }

  _buildSearchBar() {
    return `
      <div class="search-wrap">
        <input class="search-input" id="search" type="text" placeholder="🔍 Search…" value="${this._searchQuery||""}">
      </div>`;
  }

  _buildItemsList(groups, total) {
    if (!this._state.items.length) return `
      <div class="items-container"><div class="empty-state">
        <div class="empty-icon">🛒</div>
        <div class="empty-text">Your list is empty!</div>
        <div class="empty-sub">Tap ＋ to add your first item</div>
      </div></div>`;

    if (!total) return `
      <div class="items-container"><div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-text">No items found</div>
        <div class="empty-sub">Try adjusting your filters</div>
      </div></div>`;

    return `
      <div class="items-container" style="max-height:${this._maxHeight}px">
        ${Object.entries(groups).map(([cat, items]) => {
          const ci = this._getCategoryInfo(cat);
          return `
            <div>
              <div class="cat-header" style="color:${ci.color||"var(--ss-text-secondary)"}">
                ${renderIcon(ci.icon,"png-icon-sm",cat)} ${cat}
              </div>
              ${this._layout === "grid"
                ? `<div class="items-grid">${items.map(item => this._buildGridItem(item)).join("")}</div>`
                : items.map(item => this._buildListItem(item)).join("")
              }
            </div>`;
        }).join("")}
      </div>`;
  }

  _buildListItem(item) {
    const checked  = item.checked;
    const qty      = item.quantity || 1;
    const unit     = item.unit || "";
    const qtyLabel = unit ? (qty + unit) : qty > 1 ? ("×" + qty) : "";
    const catI     = this._getCategoryInfo(item.category);
    const showImg  = this._config.show_images !== false;
    const imgHtml  = showImg
      ? (item.image_url
          ? '<img class="item-image" src="' + item.image_url + '" alt="' + item.name + '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
            '<div class="item-image-placeholder" style="display:none">' + renderIcon(catI.icon,"png-icon-lg",item.category) + '</div>'
          : '<div class="item-image-placeholder">' + renderIcon(catI.icon,"png-icon-lg",item.category) + '</div>'
        )
      : "";
    const notesHtml = item.notes ? '<span>💬 ' + item.notes + '</span>' : "";
    const storeHtml = item.store ? '<span class="item-store-tag">📍 ' + item.store + '</span>' : "";
    return `
      <div class="shopping-item ${checked?"checked":""}" data-item="${item.name}">
        <button class="check-btn ${checked?"checked":""}" data-check="${item.name}">${checked?"✓":""}</button>
        ${imgHtml}
        <div class="item-info">
          <div class="item-name">${item.name}</div>
          <div class="item-meta">${notesHtml}${storeHtml}</div>
        </div>
        ${qtyLabel ? '<div class="item-qty">' + qtyLabel + '</div>' : ""}
        <div class="item-actions">
          <button class="item-action-btn" data-remove="${item.name}" title="Remove">✕</button>
        </div>
      </div>`;
  }

  _buildGridItem(item) {
    const checked  = item.checked;
    const qty      = item.quantity || 1;
    const unit     = item.unit || "";
    const qtyLabel = unit ? `${qty}${unit}` : qty > 1 ? `×${qty}` : "";
    const catI     = this._getCategoryInfo(item.category);
    const imgHtml  = item.image_url
      ? `<img src="${item.image_url}" alt="${item.name}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
      : renderIcon(catI.icon, "png-icon-lg", item.category);
    return `
      <div class="grid-item ${checked?"checked":""}">
        <div class="grid-item-img">${imgHtml}</div>
        <div class="grid-item-body">
          <div class="grid-item-name">${item.name}</div>
          ${qtyLabel ? `<div class="grid-item-qty">${qtyLabel}</div>` : ""}
        </div>
        <button class="grid-check ${checked?"checked":""}" data-check="${item.name}">${checked?"✓":""}</button>
        <button class="grid-remove" data-remove="${item.name}" title="Remove">✕</button>
      </div>`;
  }

  _buildFooter() {
    return `
      <div class="card-footer">
        <input class="add-input" id="quick-add" type="text" placeholder="Quick add item…">
        <button class="add-btn" id="quick-add-btn">＋</button>
      </div>`;
  }

  _buildSettings() {
    return `
      <div style="padding:0 0 16px">
        <div class="tab-bar">
          <button class="tab-btn ${this._settingsTab==="stores"?"active":""}"     data-tab="stores">🏪 Stores</button>
          <button class="tab-btn ${this._settingsTab==="categories"?"active":""}" data-tab="categories">🏷 Categories</button>
          <button class="tab-btn ${this._settingsTab==="layout"?"active":""}"     data-tab="layout">⊞ Layout</button>
          <button class="tab-btn ${this._settingsTab==="options"?"active":""}"    data-tab="options">⚙ Options</button>
        </div>
        <div style="padding:16px">
          ${this._settingsTab==="stores"     ? this._buildStoresTab()     : ""}
          ${this._settingsTab==="categories" ? this._buildCategoriesTab() : ""}
          ${this._settingsTab==="layout"     ? this._buildLayoutTab()     : ""}
          ${this._settingsTab==="options"    ? this._buildOptionsTab()    : ""}
        </div>
      </div>`;
  }

  _buildStoresTab() {
    return `
      <div class="settings-section">
        <div class="settings-section-title">🏪 My Stores</div>
        <div class="settings-list">
          ${this._state.stores.map(s => `
            <div class="settings-item">
              <span class="settings-item-icon">${renderIcon(s.icon||"🛒","png-icon-lg",s.name)}</span>
              <div class="settings-item-name">
                <div style="font-weight:600">${s.name}</div>
                ${s.latitude ? `<div style="font-size:11px;color:var(--ss-text-secondary)">📍 ${Number(s.latitude).toFixed(4)}, ${Number(s.longitude).toFixed(4)} · ${s.radius}m</div>` : '<div style="font-size:11px;color:var(--ss-text-secondary)">No geofence</div>'}
              </div>
              <button class="settings-item-remove" data-remove-store="${s.name}">✕</button>
            </div>`).join("")}
        </div>
        <button class="btn-primary" id="settings-add-store" style="margin-top:12px">＋ Add Store</button>
      </div>`;
  }

  _buildCategoriesTab() {
    return `
      <div class="settings-section">
        <div class="settings-section-title">🏷 Categories</div>
        <div class="settings-list">
          ${this._state.categories.map(c => `
            <div class="settings-item">
              <span class="settings-item-icon">${renderIcon(c.icon,"png-icon-lg",c.name)}</span>
              <div class="color-dot" style="background:${c.color}"></div>
              <div class="settings-item-name">${c.name}</div>
              <button class="settings-item-remove" data-remove-cat="${c.name}">✕</button>
            </div>`).join("")}
        </div>
        <button class="btn-primary" id="settings-add-cat" style="margin-top:12px">＋ Add Category</button>
      </div>`;
  }

  _buildColsSection(cols) {
    const btns = [2,3,4,5].map(n => {
      const active = cols === n;
      return '<button data-set-cols="' + n + '" style="flex:1;padding:10px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700;' +
        'background:' + (active?"rgba(0,212,170,.15)":"rgba(255,255,255,.04)") + ';' +
        'border:1.5px solid ' + (active?"var(--ss-primary)":"var(--ss-border)") + ';' +
        'color:' + (active?"var(--ss-primary)":"var(--ss-text)") + ';transition:all .2s;">' + n + '</button>';
    }).join("");
    return '<div class="settings-section"><div class="settings-section-title">⊞ Grid Columns</div><div style="display:flex;gap:8px">' + btns + '</div></div>';
  }

  _buildLayoutTab() {
    const cfg  = this._config;
    const cols = parseInt(cfg.columns) || 3;
    const layoutInfo = {
      list:    { icon:"☰", label:"List",    desc:"Classic rows with images" },
      grid:    { icon:"⊞", label:"Grid",    desc:"Image tiles in a grid" },
      compact: { icon:"≡", label:"Dense",   desc:"Tight rows, no images" },
    };
    return `
      <div class="settings-section">
        <div class="settings-section-title">⊞ Layout Style</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px">
          ${["list","grid","compact"].map(l => `
            <button data-set-layout="${l}" style="
              background:${this._layout===l?"rgba(0,212,170,.15)":"rgba(255,255,255,.04)"};
              border:1.5px solid ${this._layout===l?"var(--ss-primary)":"var(--ss-border)"};
              border-radius:10px; padding:12px 8px; cursor:pointer;
              color:${this._layout===l?"var(--ss-primary)":"var(--ss-text)"};
              display:flex; flex-direction:column; align-items:center; gap:6px; transition:all .2s;">
              <span style="font-size:22px">${layoutInfo[l].icon}</span>
              <span style="font-size:12px;font-weight:700">${layoutInfo[l].label}</span>
              <span style="font-size:10px;color:var(--ss-text-secondary);text-align:center">${layoutInfo[l].desc}</span>
            </button>`).join("")}
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">↕ List Height</div>
        <div style="display:flex;align-items:center;gap:10px">
          <input class="size-slider" id="st-height" type="range" min="150" max="900" step="10" value="${this._maxHeight}" style="flex:1;accent-color:var(--ss-primary)">
          <span id="st-height-label" style="font-weight:700;color:var(--ss-primary);min-width:44px">${this._maxHeight}px</span>
        </div>
      </div>

      ${this._layout === "grid" ? this._buildColsSection(cols) : ""}

      <div class="settings-section">
        <div class="settings-section-title">👁 Visible Sections</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${[
            ["show_store_bar",    "🏪 Store bar"],
            ["show_categories",  "🏷 Category bar"],
            ["show_progress",    "📊 Progress bar"],
            ["show_search",      "🔍 Search bar"],
            ["show_images",      "🖼 Item images"],
            ["show_size_control","↕ Size controls"],
          ].map(([key, label]) => {
            const on = cfg[key] !== false;
            return `
              <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,.04);border:1px solid var(--ss-border);border-radius:8px;padding:10px 12px">
                <span style="font-size:13px">${label}</span>
                <button data-toggle="${key}" style="
                  width:42px; height:24px; border-radius:12px; border:none; cursor:pointer;
                  background:${on?"var(--ss-primary)":"rgba(255,255,255,.12)"};
                  position:relative; transition:background .2s;">
                  <span style="position:absolute;top:3px;${on?"right:3px":"left:3px"};width:18px;height:18px;border-radius:50%;background:#fff;transition:all .2s;display:block"></span>
                </button>
              </div>`;
          }).join("")}
        </div>
        <div style="font-size:11px;color:var(--ss-text-secondary);margin-top:10px">
          💡 Changes here update your card's <code>configuration.yaml</code> keys when you copy them out.
        </div>
      </div>

      <div style="background:rgba(255,255,255,.04);border:1px solid var(--ss-border);border-radius:10px;padding:12px;font-size:11px;font-family:monospace;color:var(--ss-text-secondary);margin-top:4px">
        <div style="font-size:12px;font-weight:700;color:var(--ss-text);margin-bottom:6px">📋 Current YAML config</div>
        <pre id="yaml-preview" style="margin:0;white-space:pre-wrap;word-break:break-all">${this._buildYamlPreview()}</pre>
      </div>`;
  }

  _buildYamlPreview() {
    const cfg = this._config;
    const cols = parseInt(cfg.columns) || 3;
    const lines = [
      `type: custom:smart-shopping-card`,
      `entity_id: ${this._entityId || "sensor.smart_shopping_shopping_list"}`,
      `layout: ${this._layout}`,
      `max_height: ${this._maxHeight}`,
      ...(this._layout==="grid" ? [`columns: ${cols}`] : []),
      ...(cfg.show_store_bar    === false ? [`show_store_bar: false`]    : []),
      ...(cfg.show_categories   === false ? [`show_categories: false`]   : []),
      ...(cfg.show_progress     === false ? [`show_progress: false`]     : []),
      ...(cfg.show_search       === false ? [`show_search: false`]       : []),
      ...(cfg.show_images       === false ? [`show_images: false`]       : []),
      ...(cfg.show_size_control === false ? [`show_size_control: false`] : []),
    ];
    return lines.join("\n");
  }

  _buildOptionsTab() {
    return `
      <div class="settings-section">
        <div class="settings-section-title">📋 Todo List Backend</div>
        <div style="background:rgba(255,255,255,.04);border:1px solid var(--ss-border);border-radius:10px;padding:14px;font-size:13px;line-height:1.6">
          <div style="font-weight:600;margin-bottom:6px">Current: <span style="color:var(--ss-primary)">${this._state.todo_entity||"none"}</span></div>
          <div style="color:var(--ss-text-secondary)">Change via Settings → Devices → Smart Shopping → Configure.</div>
        </div>
      </div>
      <div class="settings-section" style="margin-top:16px">
        <div class="settings-section-title">🗑 Data</div>
        <button class="btn-danger" id="settings-clear-checked" style="width:100%">Clear All Checked Items</button>
      </div>
      <div style="text-align:center;margin-top:12px;font-size:11px;color:var(--ss-text-secondary)">Smart Shopping v${CARD_VERSION}</div>`;
  }

  // ── Modal HTML ─────────────────────────────────────────────────────

  _buildModalHTML(type) {
    switch (type) {
      case "add_item":     return this._buildAddItemModal();
      case "add_store":    return this._buildAddStoreModal();
      case "add_category": return this._buildAddCategoryModal();
      case "store_popup":  return this._buildStorePopup();
      default: return "";
    }
  }

  _buildAddItemModal() {
    const f = this._itemForm;
    return `
      <div class="modal-overlay" id="overlay">
        <div class="modal">
          <div class="modal-header">
            <div class="modal-title">🛒 Add Item</div>
            <button class="modal-close" id="modal-close">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Item Name</label>
              <input class="form-input" id="f-name" type="text" placeholder="e.g. Whole Milk" value="${f.name}">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Quantity</label>
                <input class="form-input" id="f-qty" type="number" min="1" value="${f.quantity||1}">
              </div>
              <div class="form-group">
                <label class="form-label">Unit</label>
                <input class="form-input" id="f-unit" type="text" placeholder="kg, L, pcs…" value="${f.unit||""}">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Category</label>
              <select class="form-select" id="f-cat">
                ${this._state.categories.map(c => `<option value="${c.name}" ${f.category===c.name?"selected":""}>${c.icon} ${c.name}</option>`).join("")}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Store (optional)</label>
              <select class="form-select" id="f-store">
                <option value="">Any store</option>
                ${this._state.stores.map(s => `<option value="${s.name}" ${f.store===s.name?"selected":""}>${s.icon||"🛒"} ${s.name}</option>`).join("")}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Image URL (optional)</label>
              <div class="image-preview-row">
                ${f.image_url && isImageUrl(f.image_url)
                  ? `<img id="img-preview" class="image-preview" src="${f.image_url}" alt="preview">`
                  : `<div id="img-preview" class="image-preview-placeholder">🖼</div>`}
                <input class="form-input" id="f-image" type="text" placeholder="https://… or /local/…" value="${f.image_url||""}">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Notes (optional)</label>
              <input class="form-input" id="f-notes" type="text" placeholder="e.g. Organic preferred" value="${f.notes||""}">
            </div>
            <button class="btn-primary" id="f-submit">Add to List</button>
          </div>
        </div>
      </div>`;
  }

  _buildAddStoreModal() {
    const f  = this._storeForm;
    const tab = this._storeIconTab;
    const isUrl = isImageUrl(f.icon);
    return `
      <div class="modal-overlay" id="overlay">
        <div class="modal">
          <div class="modal-header">
            <div class="modal-title">🏪 Add Store</div>
            <button class="modal-close" id="modal-close">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Store Name</label>
              <input class="form-input" id="f-name" type="text" placeholder="e.g. Whole Foods" value="${f.name}">
            </div>
            <div class="form-group">
              <label class="form-label">Icon</label>
              <div class="icon-picker-tabs">
                <button class="icon-picker-tab ${tab!=="url"?"active":""}" id="tab-emoji">Emoji</button>
                <button class="icon-picker-tab ${tab==="url"?"active":""}"  id="tab-url">PNG / URL</button>
              </div>
              ${tab === "url" ? `
                <div class="icon-url-row">
                  ${isUrl
                    ? `<img id="icon-preview" class="icon-url-preview" src="${f.icon}" alt="icon">`
                    : `<div id="icon-preview" class="icon-url-placeholder">${f.icon||"🛒"}</div>`}
                  <input class="form-input" id="f-icon-url" type="text" placeholder="https://… or /local/icons/store.png" value="${isUrl?f.icon:""}">
                </div>
                <div style="font-size:11px;color:var(--ss-text-secondary);margin-top:6px">Place PNGs in <code>config/www/icons/</code> → use <code>/local/icons/name.png</code></div>
              ` : `
                <div class="category-icon-grid">
                  ${STORE_ICONS.map(ic => `<div class="category-icon-opt ${f.icon===ic?"selected":""}" data-icon="${ic}">${ic}</div>`).join("")}
                </div>`}
            </div>
            <div class="form-group">
              <label class="form-label">📍 Geofence (optional)</label>
              <div class="form-row">
                <div>
                  <label class="form-label">Latitude</label>
                  <input class="form-input" id="f-lat" type="number" step="0.000001" placeholder="51.5074" value="${f.latitude||""}">
                </div>
                <div>
                  <label class="form-label">Longitude</label>
                  <input class="form-input" id="f-lng" type="number" step="0.000001" placeholder="-0.1278" value="${f.longitude||""}">
                </div>
              </div>
              <div style="margin-top:10px">
                <label class="form-label">Radius (m)</label>
                <input class="form-input" id="f-radius" type="number" min="10" max="1000" value="${f.radius||100}">
              </div>
            </div>
            <button class="btn-primary" id="f-submit">Add Store</button>
          </div>
        </div>
      </div>`;
  }

  _buildAddCategoryModal() {
    const f   = this._catForm;
    const tab = this._catIconTab;
    const isUrl = isImageUrl(f.icon);
    return `
      <div class="modal-overlay" id="overlay">
        <div class="modal">
          <div class="modal-header">
            <div class="modal-title">🏷 Add Category</div>
            <button class="modal-close" id="modal-close">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Category Name</label>
              <input class="form-input" id="f-name" type="text" placeholder="e.g. Baby Products" value="${f.name}">
            </div>
            <div class="form-group">
              <label class="form-label">Icon</label>
              <div class="icon-picker-tabs">
                <button class="icon-picker-tab ${tab!=="url"?"active":""}" id="tab-emoji">Emoji</button>
                <button class="icon-picker-tab ${tab==="url"?"active":""}"  id="tab-url">PNG / URL</button>
              </div>
              ${tab === "url" ? `
                <div class="icon-url-row">
                  ${isUrl
                    ? `<img id="icon-preview" class="icon-url-preview" src="${f.icon}" alt="icon">`
                    : `<div id="icon-preview" class="icon-url-placeholder">${f.icon||"📦"}</div>`}
                  <input class="form-input" id="f-icon-url" type="text" placeholder="https://… or /local/icons/cat.png" value="${isUrl?f.icon:""}">
                </div>
                <div style="font-size:11px;color:var(--ss-text-secondary);margin-top:6px">Place PNGs in <code>config/www/icons/</code> → use <code>/local/icons/name.png</code></div>
              ` : `
                <div class="category-icon-grid">
                  ${CAT_ICONS.map(ic => `<div class="category-icon-opt ${f.icon===ic?"selected":""}" data-icon="${ic}">${ic}</div>`).join("")}
                </div>`}
            </div>
            <div class="form-group" style="margin-top:12px">
              <label class="form-label">Color</label>
              <input class="form-input" id="f-color" type="color" value="${f.color||"#607D8B"}" style="height:44px;padding:4px 8px;cursor:pointer">
            </div>
            <button class="btn-primary" id="f-submit">Add Category</button>
          </div>
        </div>
      </div>`;
  }

  _buildStorePopup() {
    const d = this._storePopupData;
    if (!d) return "";
    const items = this._state.items.filter(i => !i.checked && (!i.store || i.store === d.name));
    return `
      <div class="store-popup" id="store-popup">
        <div class="popup-icon">${renderIcon(d.icon||"🛒","png-icon-lg",d.name)}</div>
        <div class="popup-content">
          <div class="popup-title">📍 Near ${d.name}!</div>
          <div class="popup-subtitle">${items.length} item${items.length!==1?"s":""} to pick up here</div>
        </div>
        <button class="popup-open-btn" id="popup-open">View List</button>
        <button class="popup-close-btn" id="popup-close">✕</button>
      </div>`;
  }

  // ── Card event binding ─────────────────────────────────────────────

  _bindCardEvents() {
    const sr  = this.shadowRoot;
    const $   = id => sr.getElementById(id);
    const $$  = sel => sr.querySelectorAll(sel);

    // Header
    $("hdr-add")?.addEventListener("click",      () => this._openModal("add_item"));
    $("hdr-settings")?.addEventListener("click", () => { this._view = this._view==="settings"?"list":"settings"; this._showLayoutMenu=false; this._updateCard(); });
    $("hdr-clear")?.addEventListener("click",    () => this._callService("clear_checked"));

    // Layout toggle button — open/close the dropdown menu
    $("hdr-layout")?.addEventListener("click", e => {
      e.stopPropagation();
      this._showLayoutMenu = !this._showLayoutMenu;
      this._updateCard();
    });
    // Close layout menu when clicking outside
    if (this._showLayoutMenu) {
      const closeMenu = () => { this._showLayoutMenu=false; this._updateCard(); sr.removeEventListener("click", closeMenu); };
      setTimeout(() => sr.addEventListener("click", closeMenu), 0);
    }
    $$("[data-layout]").forEach(el => el.addEventListener("click", e => {
      e.stopPropagation();
      this._layout = el.dataset.layout;
      this._showLayoutMenu = false;
      this._updateCard();
    }));

    // Size slider (header bar)
    $("size-slider")?.addEventListener("input", e => {
      this._maxHeight = parseInt(e.target.value);
      // Update label in-place without full re-render
      const lbl = e.target.nextElementSibling;
      if (lbl) lbl.textContent = this._maxHeight + "px";
      // Update the items container height directly
      const ic = sr.querySelector(".items-container");
      if (ic) ic.style.maxHeight = this._maxHeight + "px";
    });
    $("cols-slider")?.addEventListener("input", e => {
      const cols = parseInt(e.target.value);
      this._config = { ...this._config, columns: cols };
      this._cardDiv.style.setProperty("--ss-cols", cols);
      const lbl = e.target.nextElementSibling;
      if (lbl) lbl.textContent = cols;
    });

    // Store bar
    $$("[data-store]").forEach(el =>
      el.addEventListener("click", () => { this._activeStore = el.dataset.store; this._updateCard(); }));
    $("bar-add-store")?.addEventListener("click", () => this._openModal("add_store"));

    // Category bar
    $$("[data-cat]").forEach(el =>
      el.addEventListener("click", () => { this._activeCategory = el.dataset.cat; this._updateCard(); }));
    $("bar-add-cat")?.addEventListener("click", () => this._openModal("add_category"));

    // Search — update query but DON'T re-render (would steal focus)
    $("search")?.addEventListener("input", e => {
      this._searchQuery = e.target.value;
      // Debounced re-render that preserves focus by checking active element
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => {
        const focused = sr.activeElement;
        this._updateCard();
        // Restore focus if it was the search box
        if (focused?.id === "search") sr.getElementById("search")?.focus();
      }, 150);
    });

    // Check/uncheck
    $$("[data-check]").forEach(el => el.addEventListener("click", e => {
      e.stopPropagation();
      const name = el.dataset.check;
      const item = this._state.items.find(i => i.name === name);
      if (!item) return;
      item.checked = !item.checked;
      this._state.unchecked_count = this._state.items.filter(i => !i.checked).length;
      this._updateCard();
      this._callService(item.checked ? "check_item" : "uncheck_item", { name });
    }));

    // Remove
    $$("[data-remove]").forEach(el => el.addEventListener("click", e => {
      e.stopPropagation();
      const name = el.dataset.remove;
      this._state.items = this._state.items.filter(i => i.name !== name);
      this._state.total_count     = this._state.items.length;
      this._state.unchecked_count = this._state.items.filter(i => !i.checked).length;
      this._updateCard();
      this._callService("remove_item", { name });
    }));

    // Quick add
    const qa = $("quick-add");
    $("quick-add-btn")?.addEventListener("click", () => this._quickAdd(qa?.value));
    qa?.addEventListener("keydown", e => { if (e.key==="Enter") this._quickAdd(qa.value); });

    // Settings tabs
    $$("[data-tab]").forEach(el =>
      el.addEventListener("click", () => { this._settingsTab = el.dataset.tab; this._updateCard(); }));

    $$("[data-remove-store]").forEach(el => el.addEventListener("click", () => {
      const name = el.dataset.removeStore;
      this._state.stores = this._state.stores.filter(s => s.name !== name);
      this._updateCard();
      this._callService("update_stores", { stores: this._state.stores });
    }));

    $$("[data-remove-cat]").forEach(el => el.addEventListener("click", () => {
      const name = el.dataset.removeCat;
      this._state.categories = this._state.categories.filter(c => c.name !== name);
      this._updateCard();
      this._callService("update_categories", { categories: this._state.categories });
    }));

    $("settings-add-store")?.addEventListener("click", () => this._openModal("add_store"));
    $("settings-add-cat")?.addEventListener("click",   () => this._openModal("add_category"));
    $("settings-clear-checked")?.addEventListener("click", () => this._callService("clear_checked"));

    // Layout tab — layout selector buttons
    $$("[data-set-layout]").forEach(el => el.addEventListener("click", () => {
      this._layout = el.dataset.setLayout;
      this._updateCard();
    }));

    // Layout tab — columns selector
    $$("[data-set-cols]").forEach(el => el.addEventListener("click", () => {
      this._config = { ...this._config, columns: parseInt(el.dataset.setCols) };
      this._cardDiv.style.setProperty("--ss-cols", el.dataset.setCols);
      this._updateCard();
    }));

    // Layout tab — height slider
    $("st-height")?.addEventListener("input", e => {
      this._maxHeight = parseInt(e.target.value);
      const lbl = $("st-height-label");
      if (lbl) lbl.textContent = this._maxHeight + "px";
      const ic = sr.querySelector(".items-container");
      if (ic) ic.style.maxHeight = this._maxHeight + "px";
    });

    // Layout tab — visibility toggles
    $$("[data-toggle]").forEach(el => el.addEventListener("click", () => {
      const key = el.dataset.toggle;
      const cur = this._config[key] !== false;
      this._config = { ...this._config, [key]: !cur };
      this._updateCard();
    }));
  }

  // ── Modal event binding ────────────────────────────────────────────

  _bindModalEvents() {
    const sr = this.shadowRoot;
    const $  = id => sr.getElementById(id);
    const $$ = sel => sr.querySelectorAll(sel);

    // Close handlers
    $("modal-close")?.addEventListener("click", () => this._closeModal());
    $("overlay")?.addEventListener("click", e => { if (e.target.id==="overlay") this._closeModal(); });

    switch (this._modalType) {
      case "add_item":     this._bindAddItemEvents($, $$);     break;
      case "add_store":    this._bindAddStoreEvents($, $$);    break;
      case "add_category": this._bindAddCategoryEvents($, $$); break;
      case "store_popup":  this._bindStorePopupEvents($);      break;
    }
  }

  _bindAddItemEvents($, $$) {
    const f = this._itemForm;

    // Track text fields without re-rendering — store directly into form state
    $("f-name")?.addEventListener("input",  e => { f.name  = e.target.value; });
    $("f-qty")?.addEventListener("input",   e => { f.quantity = parseInt(e.target.value)||1; });
    $("f-unit")?.addEventListener("input",  e => { f.unit  = e.target.value; });
    $("f-notes")?.addEventListener("input", e => { f.notes = e.target.value; });
    $("f-cat")?.addEventListener("change",  e => { f.category = e.target.value; });
    $("f-store")?.addEventListener("change",e => { f.store = e.target.value; });

    // Image URL — update preview in-place only
    $("f-image")?.addEventListener("input", e => {
      const val = e.target.value;
      f.image_url = val;
      const preview = this.shadowRoot.getElementById("img-preview");
      if (!preview) return;
      if (isImageUrl(val)) {
        if (preview.tagName === "IMG") {
          preview.src = val;
        } else {
          const img = document.createElement("img");
          img.id = "img-preview"; img.className = "image-preview"; img.src = val; img.alt = "preview";
          img.onerror = () => img.style.display = "none";
          preview.replaceWith(img);
        }
      }
    });

    $("f-submit")?.addEventListener("click", () => {
      const name = (this.shadowRoot.getElementById("f-name")?.value || f.name).trim();
      if (!name) return;
      const item = { name, category: this.shadowRoot.getElementById("f-cat")?.value||f.category,
        quantity: parseInt(this.shadowRoot.getElementById("f-qty")?.value)||1,
        unit: this.shadowRoot.getElementById("f-unit")?.value||"",
        image_url: f.image_url||"",
        store: this.shadowRoot.getElementById("f-store")?.value||"",
        notes: this.shadowRoot.getElementById("f-notes")?.value||"",
      };
      this._state.items.unshift({ ...item, checked:false, added:new Date().toISOString() });
      this._state.total_count++;
      this._state.unchecked_count++;
      this._itemForm = { name:"", category:"Other", quantity:1, unit:"", image_url:"", store:"", notes:"" };
      this._closeModal();
      this._callService("add_item", item);
    });
  }

  _bindAddStoreEvents($, $$) {
    const f = this._storeForm;

    $("tab-emoji")?.addEventListener("click", () => { this._storeIconTab="emoji"; f.icon="🛒"; this._openModal("add_store"); });
    $("tab-url")?.addEventListener("click",   () => { this._storeIconTab="url";              this._openModal("add_store"); });

    // Emoji grid — no re-render, just toggle class and store value
    $$("[data-icon]").forEach(el => el.addEventListener("click", () => {
      $$("[data-icon]").forEach(e => e.classList.remove("selected"));
      el.classList.add("selected");
      f.icon = el.dataset.icon;
    }));

    // PNG URL — update preview in-place, store value, NO re-render
    $("f-icon-url")?.addEventListener("input", e => {
      const val = e.target.value;
      f.icon = val;
      const preview = this.shadowRoot.getElementById("icon-preview");
      if (!preview) return;
      if (isImageUrl(val)) {
        if (preview.tagName === "IMG") {
          preview.src = val;
        } else {
          const img = document.createElement("img");
          img.id = "icon-preview"; img.className = "icon-url-preview"; img.src = val; img.alt = "icon";
          img.onerror = () => img.style.display = "none";
          preview.replaceWith(img);
        }
      }
    });

    $("f-name")?.addEventListener("input",   e => { f.name      = e.target.value; });
    $("f-lat")?.addEventListener("input",    e => { f.latitude  = e.target.value; });
    $("f-lng")?.addEventListener("input",    e => { f.longitude = e.target.value; });
    $("f-radius")?.addEventListener("input", e => { f.radius    = parseInt(e.target.value)||100; });

    $("f-submit")?.addEventListener("click", () => {
      const name = (this.shadowRoot.getElementById("f-name")?.value || f.name).trim();
      if (!name) return;
      const store = { name, icon: f.icon||"🛒",
        latitude:  parseFloat(this.shadowRoot.getElementById("f-lat")?.value)||null,
        longitude: parseFloat(this.shadowRoot.getElementById("f-lng")?.value)||null,
        radius:    parseInt(this.shadowRoot.getElementById("f-radius")?.value)||100,
      };
      this._state.stores.push(store);
      this._storeForm = { name:"", icon:"🛒", latitude:"", longitude:"", radius:100 };
      this._storeIconTab = "emoji";
      this._closeModal();
      this._callService("add_store", store);
    });
  }

  _bindAddCategoryEvents($, $$) {
    const f = this._catForm;

    $("tab-emoji")?.addEventListener("click", () => { this._catIconTab="emoji"; f.icon="📦"; this._openModal("add_category"); });
    $("tab-url")?.addEventListener("click",   () => { this._catIconTab="url";               this._openModal("add_category"); });

    $$("[data-icon]").forEach(el => el.addEventListener("click", () => {
      $$("[data-icon]").forEach(e => e.classList.remove("selected"));
      el.classList.add("selected");
      f.icon = el.dataset.icon;
    }));

    // PNG URL — update preview in-place only
    $("f-icon-url")?.addEventListener("input", e => {
      const val = e.target.value;
      f.icon = val;
      const preview = this.shadowRoot.getElementById("icon-preview");
      if (!preview) return;
      if (isImageUrl(val)) {
        if (preview.tagName === "IMG") {
          preview.src = val;
        } else {
          const img = document.createElement("img");
          img.id = "icon-preview"; img.className = "icon-url-preview"; img.src = val; img.alt = "icon";
          img.onerror = () => img.style.display = "none";
          preview.replaceWith(img);
        }
      }
    });

    $("f-name")?.addEventListener("input",   e => { f.name  = e.target.value; });
    $("f-color")?.addEventListener("input",  e => { f.color = e.target.value; });

    $("f-submit")?.addEventListener("click", () => {
      const name = (this.shadowRoot.getElementById("f-name")?.value || f.name).trim();
      if (!name) return;
      const cat = { name, icon: f.icon||"📦",
        color: this.shadowRoot.getElementById("f-color")?.value || f.color || "#607D8B",
      };
      this._state.categories.push(cat);
      this._catForm = { name:"", icon:"📦", color:"#607D8B" };
      this._catIconTab = "emoji";
      this._closeModal();
      this._callService("add_category", cat);
    });
  }

  _bindStorePopupEvents($) {
    $("popup-open")?.addEventListener("click", () => {
      if (this._storePopupData) this._activeStore = this._storePopupData.name;
      this._storePopupData = null;
      this._closeModal();
    });
    $("popup-close")?.addEventListener("click", () => {
      this._storePopupData = null;
      this._closeModal();
    });
  }

  // ── Quick add ──────────────────────────────────────────────────────

  _quickAdd(name) {
    name = (name||"").trim();
    if (!name) return;
    const item = { name, category:"Other", quantity:1, unit:"", image_url:"", store:"", notes:"" };
    this._state.items.unshift({ ...item, checked:false, added:new Date().toISOString() });
    this._state.total_count++;
    this._state.unchecked_count++;
    this._updateCard();
    this._callService("add_item", item);
    const qa = this.shadowRoot.getElementById("quick-add");
    if (qa) qa.value = "";
  }

  // ── Geofencing ─────────────────────────────────────────────────────

  _startGeofence() {
    if (!navigator.geolocation) return;
    this._geoWatch = navigator.geolocation.watchPosition(
      pos => this._checkGeofences(pos.coords),
      null,
      { enableHighAccuracy:true, timeout:10000, maximumAge:30000 }
    );
  }

  _stopGeofence() {
    if (this._geoWatch !== undefined) navigator.geolocation.clearWatch(this._geoWatch);
  }

  _checkGeofences({ latitude, longitude }) {
    for (const store of this._state.stores) {
      if (!store.latitude || !store.longitude) continue;
      const dist = this._haversine(latitude, longitude, store.latitude, store.longitude);
      if (dist <= (store.radius||100)) {
        const items = this._state.items.filter(i => !i.checked && (!i.store || i.store===store.name));
        if (items.length > 0 && this._modalType !== "store_popup") {
          this._storePopupData = store;
          this._openModal("store_popup");
          break;
        }
      }
    }
  }

  _haversine(lat1, lon1, lat2, lon2) {
    const R=6371000, dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  connectedCallback()    { this._startGeofence(); }
  disconnectedCallback() { this._stopGeofence();  }

  static getStubConfig() {
    return {
      entity_id: "sensor.smart_shopping_shopping_list",
      layout: "list",
      max_height: 420,
    };
  }
  getCardSize()           { return 6; }
}

customElements.define("smart-shopping-card", SmartShoppingCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "smart-shopping-card",
  name: "Smart Shopping",
  description: "Feature-rich shopping list with stores, categories, images & geofence alerts.",
  preview: true,
});

console.info(`%c SMART SHOPPING %c v${CARD_VERSION} `,
  "color:#00d4aa;font-weight:bold;background:#16213e;padding:2px 6px;border-radius:4px 0 0 4px;",
  "color:#fff;background:#0f3460;padding:2px 6px;border-radius:0 4px 4px 0;");
