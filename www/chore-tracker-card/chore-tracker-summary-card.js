/**
 * Chore Tracker Summary Card — v1.0
 * A compact at-a-glance dashboard card.
 * Reads from sensor.chore_tracker_data (same as the main card).
 *
 * Config:
 *   type: custom:chore-tracker-summary-card
 *   title: "Chores"          # optional
 *   show_sparkline: true     # week completion sparkline
 *   show_urgent: true        # list top urgent/overdue tasks
 *   max_urgent: 3            # how many to show
 *   accent: "#3b82f6"        # optional accent colour override
 */

const h = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

const isOverdue = t => !!(t.due_date && t.status!=="completed" && t.status!=="temp_complete"
  && new Date(t.due_date+"T00:00:00") < (() => { const n=new Date(); n.setHours(0,0,0,0); return n; })());

const isToday = t => !!(t.due_date && (() => {
  const d=new Date(t.due_date+"T00:00:00"), n=new Date(); n.setHours(0,0,0,0);
  return d.getTime()===n.getTime();
})());

const isThisWeek = t => {
  if (!t.due_date) return false;
  const d=new Date(t.due_date+"T00:00:00"), n=new Date(); n.setHours(0,0,0,0);
  const w=new Date(n); w.setDate(w.getDate()+7);
  return d>n && d<=w;
};

const PRIORITY_ORD = {urgent:0, high:1, medium:2, low:3};

const CAT_ICON = {cleaning:"🧹",cooking:"🍳",laundry:"👕",shopping:"🛒",yard:"🌿",
  maintenance:"🔧",pets:"🐾",childcare:"👶",finance:"💰",health:"❤️",other:"📋"};

function fmtDue(t) {
  if (!t.due_date) return "";
  const d=new Date(t.due_date+"T00:00:00"), n=new Date(); n.setHours(0,0,0,0);
  const diff=Math.round((d-n)/86400000);
  if (diff===0) return "Today";
  if (diff===1) return "Tomorrow";
  if (diff<0)   return Math.abs(diff)+"d overdue";
  return "In "+diff+"d";
}

// Build last-7-days completion sparkline data
function buildSparkline(tasks) {
  const counts = Array(7).fill(0);
  const today  = new Date(); today.setHours(0,0,0,0);
  Object.values(tasks).forEach(t => {
    (t.completion_history||[]).forEach(e => {
      const d=new Date(e.completed_at); d.setHours(0,0,0,0);
      const diff=Math.round((today-d)/86400000);
      if (diff>=0 && diff<7) counts[6-diff]++;
    });
  });
  return counts;
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const CSS = `
:host{display:block}
*{box-sizing:border-box;margin:0;padding:0}

.card{
  background:var(--card-background-color,#1a1f2e);
  border-radius:18px;
  overflow:hidden;
  font-family:'DM Sans','Segoe UI',system-ui,sans-serif;
  color:var(--primary-text-color,#e8eaf0);
  border:1px solid rgba(255,255,255,.06);
  box-shadow:0 8px 32px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.05);
  position:relative;
}

/* Subtle background grid */
.card::before{
  content:'';position:absolute;inset:0;
  background-image:
    linear-gradient(rgba(255,255,255,.015) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.015) 1px, transparent 1px);
  background-size:28px 28px;
  pointer-events:none;
}

/* Top accent bar */
.accent-bar{
  height:3px;
  background:linear-gradient(90deg, var(--ct-accent,#3b82f6), #6366f1 60%, transparent);
}

.inner{position:relative;padding:16px 18px 14px}

/* Header row */
.hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.hdr-l{display:flex;align-items:center;gap:9px}
.hdr-ico{
  width:28px;height:28px;
  background:linear-gradient(135deg,var(--ct-accent,#3b82f6),#6366f1);
  border-radius:8px;display:flex;align-items:center;justify-content:center;
  font-size:13px;flex-shrink:0;
  box-shadow:0 2px 8px rgba(99,102,241,.35);
}
.hdr-title{font-size:13px;font-weight:700;letter-spacing:.3px;opacity:.75}
.hdr-time{font-size:11px;opacity:.35;font-variant-numeric:tabular-nums}

/* Stat pills row */
.stats{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}
.pill{
  flex:1;min-width:68px;
  background:rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.07);
  border-radius:12px;padding:10px 10px 9px;
  text-align:center;transition:background .2s;cursor:default;
  position:relative;overflow:hidden;
}
.pill::after{
  content:'';position:absolute;inset:0;
  background:linear-gradient(135deg,var(--pill-c,transparent) 0%,transparent 70%);
  opacity:.07;pointer-events:none;
}
.pill.danger{--pill-c:#ef4444;border-color:rgba(239,68,68,.2)}
.pill.warn  {--pill-c:#f59e0b;border-color:rgba(245,158,11,.2)}
.pill.ok    {--pill-c:#22c55e;border-color:rgba(34,197,94,.18)}
.pill.info  {--pill-c:#3b82f6;border-color:rgba(59,130,246,.2)}
.pill-n{
  display:block;font-size:26px;font-weight:800;line-height:1;
  font-variant-numeric:tabular-nums;letter-spacing:-1px;
}
.pill.danger .pill-n{color:#f87171}
.pill.warn   .pill-n{color:#fbbf24}
.pill.ok     .pill-n{color:#4ade80}
.pill.info   .pill-n{color:#60a5fa}
.pill-l{display:block;font-size:10px;font-weight:600;opacity:.5;margin-top:3px;
  text-transform:uppercase;letter-spacing:.5px}

/* Progress bar */
.prog-wrap{margin-bottom:14px}
.prog-labels{display:flex;justify-content:space-between;margin-bottom:5px}
.prog-title{font-size:11px;font-weight:700;opacity:.5;text-transform:uppercase;letter-spacing:.5px}
.prog-pct{font-size:11px;font-weight:700;color:var(--ct-accent,#3b82f6)}
.prog-track{
  height:6px;background:rgba(255,255,255,.07);border-radius:4px;overflow:hidden;
}
.prog-fill{
  height:100%;border-radius:4px;
  background:linear-gradient(90deg,var(--ct-accent,#3b82f6),#6366f1);
  transition:width .6s cubic-bezier(.34,1.56,.64,1);
  min-width:2px;
}

/* Sparkline */
.spark-wrap{margin-bottom:14px}
.spark-title{font-size:11px;font-weight:700;opacity:.5;text-transform:uppercase;
  letter-spacing:.5px;margin-bottom:7px}
.spark{display:flex;align-items:flex-end;gap:3px;height:36px}
.bar{
  flex:1;border-radius:3px 3px 0 0;
  background:linear-gradient(180deg,var(--ct-accent,#3b82f6),rgba(99,102,241,.5));
  min-height:3px;transition:height .4s ease;opacity:.8;
}
.bar.today{opacity:1;box-shadow:0 0 6px rgba(99,102,241,.5)}
.bar.zero{background:rgba(255,255,255,.06);opacity:1}
.spark-days{display:flex;gap:3px;margin-top:4px}
.spark-day{flex:1;font-size:9px;text-align:center;opacity:.3;font-weight:600}
.spark-day.today{opacity:.7;color:var(--ct-accent,#3b82f6)}

/* Urgent task list */
.section-title{
  font-size:11px;font-weight:700;opacity:.45;text-transform:uppercase;
  letter-spacing:.5px;margin-bottom:8px;
}
.task-list{display:flex;flex-direction:column;gap:5px}
.task-row{
  display:flex;align-items:center;gap:9px;
  background:rgba(255,255,255,.03);
  border:1px solid rgba(255,255,255,.06);
  border-radius:9px;padding:8px 11px;
  transition:background .15s;cursor:default;
}
.task-row.od{border-color:rgba(239,68,68,.2);background:rgba(239,68,68,.04)}
.task-row.tc{border-color:rgba(139,92,246,.2);background:rgba(139,92,246,.04)}
.task-ico{font-size:14px;flex-shrink:0;line-height:1}
.task-info{flex:1;min-width:0}
.task-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.task-row.od .task-name{color:#fca5a5}
.task-due{font-size:11px;opacity:.5;margin-top:1px}
.task-row.od .task-due{color:#f87171;opacity:.7}
.task-row.tc .task-due{color:#c4b5fd;opacity:.7}
.pri-dot{
  width:7px;height:7px;border-radius:50%;flex-shrink:0;
  background:var(--pd,#3b82f6);
}
.all-done{
  text-align:center;padding:14px 0 6px;
  font-size:13px;opacity:.4;
}
.all-done span{font-size:22px;display:block;margin-bottom:4px}

/* Footer */
.footer{
  margin-top:12px;padding-top:10px;
  border-top:1px solid rgba(255,255,255,.05);
  display:flex;align-items:center;justify-content:space-between;
}
.footer-note{font-size:10px;opacity:.3;font-style:italic}
.footer-badge{
  font-size:10px;padding:2px 8px;border-radius:20px;
  background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.09);
  opacity:.6;font-weight:600;
}
`;

// ─── Card ─────────────────────────────────────────────────────────────────────

class ChoreTrackerSummaryCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:"open"});
    this._cfg   = {};
    this._hass  = null;
    this._tasks = {};
    this._built = false;
  }

  setConfig(cfg) {
    this._cfg = {
      title:          "Chore Summary",
      show_sparkline: true,
      show_urgent:    true,
      max_urgent:     3,
      accent:         null,
      ...cfg,
    };
    if (!this._built) this._build();
    else this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const s = hass.states["sensor.chore_tracker_data"];
    if (s?.attributes?.tasks) this._tasks = s.attributes.tasks || {};
    if (!this._built) this._build();
    else this._render();
  }

  _build() {
    this._built = true;
    this.shadowRoot.innerHTML = `<style>${CSS}</style><div class="card">
      <div class="accent-bar" id="abar"></div>
      <div class="inner" id="inner"></div>
    </div>`;
    if (this._cfg.accent) {
      this.shadowRoot.querySelector(".card").style.setProperty("--ct-accent", this._cfg.accent);
    }
    this._render();
  }

  _render() {
    const inner = this.shadowRoot.getElementById("inner");
    if (!inner) return;

    const cfg   = this._cfg;
    const all   = Object.values(this._tasks);
    const active = all.filter(t => t.status !== "completed");

    const overdue  = all.filter(isOverdue);
    const today    = all.filter(t => isToday(t) && !isOverdue(t));
    const week     = all.filter(isThisWeek);
    const temp     = all.filter(t => t.status === "temp_complete");
    const done     = all.filter(t => t.status === "completed");
    const total    = all.length;
    const pct      = total > 0 ? Math.round((done.length / total) * 100) : 0;

    // Top urgent/overdue tasks to surface
    const urgent = [...overdue, ...today]
      .filter((t,i,a) => a.indexOf(t) === i)   // dedupe
      .concat(
        active
          .filter(t => !isOverdue(t) && !isToday(t))
          .filter(t => t.priority === "urgent" || t.priority === "high")
      )
      .sort((a,b) => (PRIORITY_ORD[a.priority]??2)-(PRIORITY_ORD[b.priority]??2))
      .slice(0, cfg.max_urgent || 3);

    const spark   = buildSparkline(this._tasks);
    const sparkMax= Math.max(...spark, 1);
    const DAYS    = ["M","T","W","T","F","S","S"];
    const todayDow= (new Date().getDay()+6)%7; // Mon=0

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});

    const priColor = {urgent:"#ef4444",high:"#f59e0b",medium:"#3b82f6",low:"#64748b"};

    inner.innerHTML = `
      <!-- Header -->
      <div class="hdr">
        <div class="hdr-l">
          <div class="hdr-ico">✓</div>
          <span class="hdr-title">${h(cfg.title)}</span>
        </div>
        <span class="hdr-time">${timeStr}</span>
      </div>

      <!-- Stats pills -->
      <div class="stats">
        <div class="pill${overdue.length>0?" danger":""}">
          <span class="pill-n">${overdue.length}</span>
          <span class="pill-l">Overdue</span>
        </div>
        <div class="pill${today.length>0?" warn":""}">
          <span class="pill-n">${today.length}</span>
          <span class="pill-l">Today</span>
        </div>
        <div class="pill info">
          <span class="pill-n">${week.length}</span>
          <span class="pill-l">This week</span>
        </div>
        <div class="pill ok">
          <span class="pill-n">${done.length}</span>
          <span class="pill-l">Done</span>
        </div>
      </div>

      <!-- Completion progress -->
      <div class="prog-wrap">
        <div class="prog-labels">
          <span class="prog-title">Completion</span>
          <span class="prog-pct">${pct}%</span>
        </div>
        <div class="prog-track">
          <div class="prog-fill" style="width:${pct}%"></div>
        </div>
      </div>

      <!-- Sparkline -->
      ${cfg.show_sparkline ? `
      <div class="spark-wrap">
        <div class="spark-title">Completed — last 7 days</div>
        <div class="spark">
          ${spark.map((n,i)=>`
            <div class="bar${i===6?" today":""}${n===0?" zero":""}"
                 style="height:${Math.round((n/sparkMax)*100)}%"
                 title="${n} completed"></div>
          `).join("")}
        </div>
        <div class="spark-days">
          ${DAYS.map((_,i)=>{
            const dayIdx = (todayDow - 6 + i + 7) % 7;
            return `<div class="spark-day${i===6?" today":""}">${DAYS[dayIdx]}</div>`;
          }).join("")}
        </div>
      </div>` : ""}

      <!-- Urgent / overdue tasks -->
      ${cfg.show_urgent ? `
      <div class="section-title">
        ${overdue.length>0 ? "⚠️ Needs attention" : today.length>0 ? "📅 Due today" : "📋 Up next"}
      </div>
      <div class="task-list">
        ${urgent.length === 0
          ? `<div class="all-done"><span>🎉</span>All clear — nothing urgent!</div>`
          : urgent.map(t=>`
            <div class="task-row${isOverdue(t)?" od":t.status==="temp_complete"?" tc":""}">
              <span class="task-ico">${CAT_ICON[t.category]||"📋"}</span>
              <div class="task-info">
                <div class="task-name">${h(t.name)}</div>
                <div class="task-due">${
                  t.status==="temp_complete"
                    ? "⏱ Temporarily done"
                    : fmtDue(t)
                }</div>
              </div>
              <div class="pri-dot" style="--pd:${priColor[t.priority]||"#3b82f6"}"></div>
            </div>`).join("")}
      </div>` : ""}

      <!-- Footer -->
      <div class="footer">
        <span class="footer-note">
          ${temp.length>0 ? `${temp.length} temporarily done` : `${active.length} active tasks`}
        </span>
        <span class="footer-badge">Chore Tracker</span>
      </div>
    `;
  }

  static getConfigElement() { return document.createElement("chore-tracker-summary-card-editor"); }
  static getStubConfig() {
    return {title:"Chore Summary", show_sparkline:true, show_urgent:true, max_urgent:3};
  }
  getCardSize() { return 4; }
}

// ─── Editor ───────────────────────────────────────────────────────────────────

class ChoreTrackerSummaryCardEditor extends HTMLElement {
  constructor() { super(); this.attachShadow({mode:"open"}); }
  setConfig(c) { this._cfg = {...c}; this._render(); }
  set hass(h) {}

  _render() {
    const c = this._cfg || {};
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;padding:16px;font-family:'Segoe UI',system-ui,sans-serif}
      h3{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;
         opacity:.5;margin:0 0 10px;padding-top:12px;border-top:1px solid var(--divider-color,rgba(0,0,0,.1))}
      h3:first-of-type{border-top:none;padding-top:0}
      .row{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}
      label{font-size:12px;font-weight:600;color:var(--secondary-text-color,#666)}
      input[type=text],input[type=number],input[type=color]{
        padding:7px 10px;border-radius:7px;width:100%;
        border:1px solid var(--divider-color,rgba(0,0,0,.2));
        background:var(--secondary-background-color,#f5f5f5);
        color:var(--primary-text-color);font-size:13px}
      input[type=color]{padding:3px;height:36px;cursor:pointer}
      .tog{display:flex;align-items:center;gap:9px;cursor:pointer;margin-bottom:10px}
      .tog input{width:auto}
      .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    </style>
    <h3>General</h3>
    <div class="row"><label>Title</label>
      <input type="text" id="e-title" value="${c.title||"Chore Summary"}">
    </div>
    <div class="row"><label>Accent colour</label>
      <input type="color" id="e-accent" value="${c.accent||"#3b82f6"}">
    </div>
    <h3>Content</h3>
    <label class="tog"><input type="checkbox" id="e-spark" ${c.show_sparkline!==false?"checked":""}> Show 7-day sparkline</label>
    <label class="tog"><input type="checkbox" id="e-urg"   ${c.show_urgent!==false?"checked":""}> Show urgent/overdue tasks</label>
    <div class="row"><label>Max tasks shown</label>
      <input type="number" id="e-max" min="1" max="10" value="${c.max_urgent||3}">
    </div>`;

    const R = this.shadowRoot;
    R.getElementById("e-title" ).addEventListener("input",  e => this._fire({title:        e.target.value}));
    R.getElementById("e-accent").addEventListener("input",  e => this._fire({accent:       e.target.value}));
    R.getElementById("e-spark" ).addEventListener("change", e => this._fire({show_sparkline:e.target.checked}));
    R.getElementById("e-urg"   ).addEventListener("change", e => this._fire({show_urgent:  e.target.checked}));
    R.getElementById("e-max"   ).addEventListener("change", e => this._fire({max_urgent:   parseInt(e.target.value)||3}));
  }

  _fire(u) {
    this._cfg = {...this._cfg, ...u};
    this.dispatchEvent(new CustomEvent("config-changed",{detail:{config:this._cfg},bubbles:true,composed:true}));
  }
}

customElements.define("chore-tracker-summary-card",        ChoreTrackerSummaryCard);
customElements.define("chore-tracker-summary-card-editor", ChoreTrackerSummaryCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === "chore-tracker-summary-card"))
  window.customCards.push({
    type:        "chore-tracker-summary-card",
    name:        "Chore Tracker Summary",
    description: "At-a-glance chore summary with stats, sparkline, and urgent tasks.",
    preview:     true,
  });

console.info(
  "%c CHORE-TRACKER-SUMMARY %c v1.0 ",
  "background:#6366f1;color:#fff;padding:2px 6px;border-radius:4px 0 0 4px;font-weight:700",
  "background:#1a1f2e;color:#818cf8;padding:2px 6px;border-radius:0 4px 4px 0;font-weight:600"
);
