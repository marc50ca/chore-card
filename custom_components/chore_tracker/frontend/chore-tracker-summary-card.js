/**
 * Chore Tracker Summary Card — v2.2
 * Horizontal layout · task action buttons · sparkline · stats
 *
 * Config:
 *   type: custom:chore-tracker-summary-card
 *   title: "Chores"
 *   show_sparkline: true
 *   max_tasks: 8          # tasks shown in horizontal scroll
 *   accent: "#3b82f6"
 */

const CT = "chore_tracker";
const esc = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

const _now0 = () => { const n=new Date(); n.setHours(0,0,0,0); return n; };
const isOverdue  = t => !!(t.due_date && !["completed","temp_complete"].includes(t.status)
  && new Date(t.due_date+"T00:00:00") < _now0());
const isToday    = t => !!(t.due_date && new Date(t.due_date+"T00:00:00").getTime()===_now0().getTime());
const isThisWeek = t => { if(!t.due_date) return false;
  const d=new Date(t.due_date+"T00:00:00"), n=_now0(), w=new Date(n); w.setDate(w.getDate()+7);
  return d>n && d<=w; };

const PORD = {urgent:0,high:1,medium:2,low:3};
const PCOL = {urgent:"#ef4444",high:"#f59e0b",medium:"#3b82f6",low:"#64748b"};
const CICO = {cleaning:"🧹",cooking:"🍳",laundry:"👕",shopping:"🛒",yard:"🌿",
  maintenance:"🔧",pets:"🐾",childcare:"👶",finance:"💰",health:"❤️",other:"📋"};

function fmtDue(t) {
  if (!t.due_date) return "No due date";
  const diff = Math.round((new Date(t.due_date+"T00:00:00") - _now0()) / 86400000);
  if (diff===0)  return "Due today";
  if (diff===1)  return "Due tomorrow";
  if (diff===-1) return "1d overdue";
  if (diff<0)    return Math.abs(diff)+"d overdue";
  if (diff<7)    return "In "+diff+" days";
  return new Date(t.due_date+"T00:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric"});
}

function buildSparkline(tasks) {
  const counts = Array(7).fill(0);
  const today  = _now0();
  Object.values(tasks).forEach(t =>
    (t.completion_history||[]).forEach(e => {
      const d=new Date(e.completed_at); d.setHours(0,0,0,0);
      const diff=Math.round((today-d)/86400000);
      if (diff>=0 && diff<7) counts[6-diff]++;
    })
  );
  return counts;
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
:host{display:block}
*{box-sizing:border-box;margin:0;padding:0}

.card{
  background:var(--card-background-color,#181d2a);
  border-radius:18px;overflow:hidden;
  font-family:'DM Sans','Segoe UI',system-ui,sans-serif;
  color:var(--primary-text-color,#e4e8f5);
  border:1px solid rgba(255,255,255,.06);
  box-shadow:0 8px 40px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.05);
}

/* accent bar */
.abar{height:3px;background:linear-gradient(90deg,var(--ac,#3b82f6),#6366f1 55%,transparent)}

/* ── Top strip: header + stats + sparkline ── */
.top{
  display:grid;
  grid-template-columns:1fr auto;
  grid-template-rows:auto auto;
  gap:0;
  padding:14px 16px 12px;
  border-bottom:1px solid rgba(255,255,255,.05);
  background:linear-gradient(135deg,rgba(59,130,246,.04),rgba(99,102,241,.03));
}

/* header */
.hdr{display:flex;align-items:center;justify-content:space-between;
  grid-column:1;margin-bottom:11px}
.hdr-l{display:flex;align-items:center;gap:8px}
.hdr-ico{width:26px;height:26px;
  background:linear-gradient(135deg,var(--ac,#3b82f6),#6366f1);
  border-radius:7px;display:flex;align-items:center;justify-content:center;
  font-size:13px;box-shadow:0 2px 8px rgba(99,102,241,.4)}
.hdr-title{font-size:14px;font-weight:700;opacity:.85}
.hdr-time{font-size:11px;opacity:.3;font-variant-numeric:tabular-nums}

/* stats pills — horizontal */
.pills{display:flex;gap:7px;grid-column:1;flex-wrap:nowrap}
.pill{
  flex:1;min-width:0;
  background:rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.08);
  border-radius:10px;padding:8px 8px 7px;text-align:center;
  position:relative;overflow:hidden;
}
.pill::after{content:'';position:absolute;inset:0;
  background:radial-gradient(circle at 50% 0,var(--pc,transparent),transparent 70%);
  opacity:.12;pointer-events:none}
.pill.d{--pc:#ef4444;border-color:rgba(239,68,68,.22)}
.pill.w{--pc:#f59e0b;border-color:rgba(245,158,11,.22)}
.pill.g{--pc:#22c55e;border-color:rgba(34,197,94,.2)}
.pill.b{--pc:#3b82f6;border-color:rgba(59,130,246,.2)}
.pn{display:block;font-size:22px;font-weight:800;line-height:1;letter-spacing:-1px}
.pill.d .pn{color:#f87171}.pill.w .pn{color:#fbbf24}
.pill.g .pn{color:#4ade80}.pill.b .pn{color:#60a5fa}
.pl{display:block;font-size:9px;font-weight:700;opacity:.45;
  text-transform:uppercase;letter-spacing:.6px;margin-top:3px}

/* sparkline — right column, 2 rows */
.spark-col{
  grid-column:2;grid-row:1/3;
  display:flex;flex-direction:column;align-items:flex-end;
  padding-left:14px;justify-content:flex-end;
  min-width:80px;
}
.spark-lbl{font-size:9px;font-weight:700;opacity:.35;text-transform:uppercase;
  letter-spacing:.5px;margin-bottom:5px;align-self:flex-start}
.spark{display:flex;align-items:flex-end;gap:3px;height:38px;width:80px}
.sbar{flex:1;border-radius:2px 2px 0 0;min-height:3px;opacity:.75;
  background:linear-gradient(180deg,var(--ac,#3b82f6),rgba(99,102,241,.4));
  transition:height .4s ease}
.sbar.tod{opacity:1;box-shadow:0 0 5px rgba(99,102,241,.5)}
.sbar.z{background:rgba(255,255,255,.07);opacity:1}
.spark-days{display:flex;gap:3px;width:80px;margin-top:3px}
.sd{flex:1;font-size:8px;text-align:center;opacity:.28;font-weight:700}
.sd.tod{opacity:.65;color:var(--ac,#3b82f6)}

/* ── Progress bar ── */
.prog{padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.04)}
.prog-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}
.prog-lbl{font-size:10px;font-weight:700;opacity:.4;text-transform:uppercase;letter-spacing:.5px}
.prog-pct{font-size:11px;font-weight:800;color:var(--ac,#3b82f6)}
.prog-track{height:5px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden}
.prog-fill{height:100%;border-radius:3px;
  background:linear-gradient(90deg,var(--ac,#3b82f6),#6366f1);
  transition:width .7s cubic-bezier(.34,1.56,.64,1);min-width:3px}

/* ── Horizontal task strip ── */
.strip-hdr{
  display:flex;align-items:center;justify-content:space-between;
  padding:10px 16px 7px;
}
.strip-lbl{font-size:10px;font-weight:700;opacity:.4;text-transform:uppercase;letter-spacing:.5px}
.strip-count{font-size:10px;opacity:.3;font-weight:600}

.strip{
  display:flex;gap:9px;
  padding:0 16px 14px;
  overflow-x:auto;overflow-y:visible;
  scroll-snap-type:x mandatory;
  -webkit-overflow-scrolling:touch;
  overscroll-behavior-x:contain;
  scrollbar-width:none;
  cursor:grab;
}
.strip::-webkit-scrollbar{display:none}

/* individual task card */
.tcard{
  flex-shrink:0;width:185px;
  background:rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.08);
  border-radius:13px;padding:11px 12px 10px;
  scroll-snap-align:start;
  display:flex;flex-direction:column;gap:0;
  border-left:3px solid var(--tc,#3b82f6);
  transition:background .15s,transform .15s;
  position:relative;
}
.tcard:hover{background:rgba(255,255,255,.07);transform:translateY(-1px)}
.tcard.od{border-left-color:#ef4444;background:rgba(239,68,68,.05)}
.tcard.td{border-left-color:#f59e0b;background:rgba(245,158,11,.04)}
.tcard.tc{border-left-color:#8b5cf6;background:rgba(139,92,246,.05)}
.tcard.done{opacity:.4;border-left-color:#22c55e}

/* card top row */
.tc-top{display:flex;align-items:flex-start;gap:7px;margin-bottom:7px}
.tc-ico{font-size:16px;line-height:1;flex-shrink:0;margin-top:1px}
.tc-info{flex:1;min-width:0}
.tc-name{font-size:13px;font-weight:700;line-height:1.3;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tc-due{font-size:10px;margin-top:3px;opacity:.55;font-weight:600}
.tcard.od .tc-due{color:#f87171;opacity:.8}
.tcard.td .tc-due{color:#fbbf24;opacity:.8}
.tcard.tc .tc-due{color:#c4b5fd;opacity:.8}
.tc-pri{width:6px;height:6px;border-radius:50%;
  background:var(--pc,#3b82f6);flex-shrink:0;margin-top:5px}

/* action buttons */
.tc-acts{display:flex;gap:5px;margin-top:8px}
.act{
  flex:1;padding:7px 4px;border-radius:7px;border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.06);color:inherit;cursor:pointer;
  font-size:10px;font-weight:700;letter-spacing:.2px;
  display:flex;align-items:center;justify-content:center;gap:4px;
  transition:all .15s;white-space:nowrap;
  touch-action:manipulation;-webkit-tap-highlight-color:transparent;
  min-height:32px;
}
.act:hover{background:rgba(255,255,255,.13);transform:translateY(-1px)}
.act.done{background:rgba(34,197,94,.12);border-color:rgba(34,197,94,.3);color:#4ade80}
.act.done:hover{background:rgba(34,197,94,.2)}
.act.temp{background:rgba(139,92,246,.1);border-color:rgba(139,92,246,.3);color:#c4b5fd}
.act.temp:hover{background:rgba(139,92,246,.18)}
.act.undone{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.1);color:rgba(255,255,255,.45)}
.act.snz{background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.3);color:#fbbf24}
.act.snz:hover{background:rgba(245,158,11,.18)}
.act.skp{background:rgba(100,116,139,.1);border-color:rgba(100,116,139,.3);color:#94a3b8}
.act.skp:hover{background:rgba(100,116,139,.18)}
.act:disabled{opacity:.35;cursor:default;transform:none}

/* empty state */
.empty{text-align:center;padding:20px 16px 18px;opacity:.4;font-size:13px}
.empty-ico{font-size:28px;margin-bottom:6px}

/* footer */
.footer{
  display:flex;align-items:center;justify-content:space-between;
  padding:8px 16px 12px;border-top:1px solid rgba(255,255,255,.04);
}
.foot-note{font-size:10px;opacity:.3;font-style:italic}
.foot-badge{font-size:10px;padding:2px 8px;border-radius:20px;
  background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);
  opacity:.5;font-weight:600}
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
    this._fp    = null;
  }

  setConfig(cfg) {
    this._cfg = {
      title:          "Chore Summary",
      show_sparkline: true,
      max_tasks:      8,
      accent:         "#3b82f6",
      ...cfg,
    };
    if (!this._built) this._build();
    else this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const s  = hass.states["sensor.chore_tracker_data"];
    const fp = s?.attributes?.tasks ? JSON.stringify(s.attributes.tasks) : null;
    if (!this._built) {
      this._tasks = s?.attributes?.tasks || {};
      this._fp = fp;
      this._build();
      return;
    }
    if (fp === this._fp) return;
    this._fp    = fp;
    this._tasks = s?.attributes?.tasks || {};
    this._render();
  }

  _build() {
    this._built = true;
    this.shadowRoot.innerHTML = `<style>${CSS}</style>
      <div class="card" id="card">
        <div class="abar"></div>
        <div id="body"></div>
      </div>`;
    const accent = this._cfg.accent || "#3b82f6";
    this.shadowRoot.getElementById("card").style.setProperty("--ac", accent);
    this._render();
  }

  _render() {
    const body = this.shadowRoot.getElementById("body");
    if (!body) return;

    const cfg   = this._cfg;
    const all   = Object.values(this._tasks);
    const done  = all.filter(t => t.status === "completed");
    const temp  = all.filter(t => t.status === "temp_complete");
    const over  = all.filter(isOverdue);
    const tod   = all.filter(t => isToday(t) && !isOverdue(t));
    const week  = all.filter(isThisWeek);
    const pct   = all.length > 0 ? Math.round((done.length / all.length) * 100) : 0;

    // Task strip — priority order: overdue → today → high/urgent → rest
    const active = all.filter(t => !["completed"].includes(t.status));
    const strip  = [
      ...active.filter(isOverdue),
      ...active.filter(t => isToday(t) && !isOverdue(t)),
      ...active.filter(t => !isOverdue(t) && !isToday(t) && ["urgent","high"].includes(t.priority)),
      ...active.filter(t => !isOverdue(t) && !isToday(t) && !["urgent","high"].includes(t.priority)),
    ]
      .filter((t,i,a) => a.indexOf(t)===i)  // dedupe
      .slice(0, cfg.max_tasks || 8);

    // Sparkline
    const spark    = buildSparkline(this._tasks);
    const sparkMax = Math.max(...spark, 1);
    const DAYLBLS  = ["M","T","W","T","F","S","S"];
    const todayDow = (new Date().getDay()+6)%7;
    const timeStr  = new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});

    body.innerHTML = `
      <!-- Top strip -->
      <div class="top">
        <div class="hdr">
          <div class="hdr-l">
            <div class="hdr-ico">✓</div>
            <span class="hdr-title">${esc(cfg.title)}</span>
          </div>
          <span class="hdr-time">${timeStr}</span>
        </div>

        <!-- Stats pills -->
        <div class="pills">
          <div class="pill${over.length>0?" d":""}">
            <span class="pn">${over.length}</span><span class="pl">Overdue</span>
          </div>
          <div class="pill${tod.length>0?" w":""}">
            <span class="pn">${tod.length}</span><span class="pl">Today</span>
          </div>
          <div class="pill b">
            <span class="pn">${week.length}</span><span class="pl">Week</span>
          </div>
          <div class="pill g">
            <span class="pn">${done.length}</span><span class="pl">Done</span>
          </div>
        </div>

        <!-- Sparkline (right column) -->
        ${cfg.show_sparkline ? `
        <div class="spark-col">
          <div class="spark-lbl">Last 7 days</div>
          <div class="spark">
            ${spark.map((n,i)=>`
              <div class="sbar${i===6?" tod":""}${n===0?" z":""}"
                   style="height:${Math.round((n/sparkMax)*100)}%"
                   title="${n} done"></div>`).join("")}
          </div>
          <div class="spark-days">
            ${DAYLBLS.map((_,i)=>{
              const di=(todayDow-6+i+7)%7;
              return `<div class="sd${i===6?" tod":""}">${DAYLBLS[di]}</div>`;
            }).join("")}
          </div>
        </div>` : ""}
      </div>

      <!-- Progress -->
      <div class="prog">
        <div class="prog-row">
          <span class="prog-lbl">Overall completion</span>
          <span class="prog-pct">${pct}%</span>
        </div>
        <div class="prog-track">
          <div class="prog-fill" style="width:${pct}%"></div>
        </div>
      </div>

      <!-- Task strip header -->
      <div class="strip-hdr">
        <span class="strip-lbl">
          ${over.length>0 ? "⚠️ Needs attention" : tod.length>0 ? "📅 Due today" : "📋 Up next"}
        </span>
        <span class="strip-count">${active.length} active</span>
      </div>

      <!-- Horizontal task cards -->
      <div class="strip" id="strip">
        ${strip.length===0
          ? `<div class="empty" style="width:100%">
               <div class="empty-ico">🎉</div>All clear!
             </div>`
          : strip.map(t => {
              const od  = isOverdue(t);
              const tdy = isToday(t) && !od;
              const tmp = t.status==="temp_complete";
              const fin = t.status==="completed";
              const cc  = od?"od":tdy?"td":tmp?"tc":fin?"done":"";
              const pc  = PCOL[t.priority]||"#3b82f6";
              const due = tmp ? "⏱ Temp done" : fmtDue(t);
              return `
                <div class="tcard ${cc}" style="--tc:${pc};--pc:${pc}" data-tid="${t.id}">
                  <div class="tc-top">
                    <span class="tc-ico">${CICO[t.category]||"📋"}</span>
                    <div class="tc-info">
                      <div class="tc-name" title="${esc(t.name)}">${esc(t.name)}</div>
                      <div class="tc-due">${due}</div>
                    </div>
                    <div class="tc-pri" style="background:${pc}"></div>
                  </div>
                  <div class="tc-acts">
                    ${fin
                      ? `<button class="act undone" data-a="undo" data-tid="${t.id}">↩ Undo</button>`
                      : od
                        ? `<button class="act done" data-a="complete" data-tid="${t.id}">✓ Done</button>
                           <button class="act snz"  data-a="snooze"   data-tid="${t.id}">⏰ +1d</button>
                           ${t.recurrence&&t.recurrence!=="none"
                             ? `<button class="act skp" data-a="skip" data-tid="${t.id}">⏭ Skip</button>`
                             : `<button class="act temp" data-a="temp" data-tid="${t.id}">⏱ 24h</button>`}`
                        : `<button class="act done" data-a="complete" data-tid="${t.id}">✓ Done</button>
                           <button class="act temp" data-a="temp"     data-tid="${t.id}">⏱ 24h</button>`
                    }
                  </div>
                </div>`;
            }).join("")}
      </div>

      <!-- Footer -->
      <div class="footer">
        <span class="foot-note">
          ${temp.length>0 ? `${temp.length} temporarily done · ` : ""}${all.length} total tasks
        </span>
        <span class="foot-badge">Summary v2.2</span>
      </div>`;

    // Wire up action buttons — with optimistic UI for instant feedback
    body.querySelectorAll("[data-a]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const tid = btn.dataset.tid;
        const a   = btn.dataset.a;
        if (!this._hass || !tid) return;

        // Optimistic update: change local state immediately, re-render, then call service
        if (a === "complete" && this._tasks[tid]) {
          this._tasks[tid].status = "completed";
          this._render();
          this._hass.callService(CT, "complete_task", {task_id: tid})
            .catch(err => console.error("complete_task", err));
        } else if (a === "temp" && this._tasks[tid]) {
          this._tasks[tid].status = "temp_complete";
          this._render();
          this._hass.callService(CT, "temp_complete_task", {task_id: tid, hours: 24})
            .catch(err => console.error("temp_complete_task", err));
        } else if (a === "undo" && this._tasks[tid]) {
          this._tasks[tid].status = "pending";
          this._render();
          this._hass.callService(CT, "update_task", {task_id: tid, status: "pending"})
            .catch(err => console.error("update_task", err));
        } else if (a === "snooze" && this._tasks[tid]) {
          // Push due_date forward 1 day optimistically
          const t = this._tasks[tid];
          const d = new Date((t.due_date || new Date().toISOString().slice(0,10)) + "T00:00:00");
          d.setDate(d.getDate() + 1);
          t.due_date = d.toISOString().slice(0,10);
          if (t.status === "overdue") t.status = "pending";
          this._render();
          this._hass.callService(CT, "snooze_task", {task_id: tid, days: 1})
            .catch(err => console.error("snooze_task", err));
        } else if (a === "skip" && this._tasks[tid]) {
          this._tasks[tid].status = "skipped";
          this._render();
          this._hass.callService(CT, "skip_task", {task_id: tid})
            .catch(err => console.error("skip_task", err));
        }
      });
    });
  }

  static getConfigElement() { return document.createElement("chore-tracker-summary-card-editor"); }
  static getStubConfig() {
    return {title:"Chore Summary", show_sparkline:true, max_tasks:8, accent:"#3b82f6"};
  }
  getCardSize() { return 3; }
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
      h3{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;opacity:.5;
         margin:0 0 10px;padding-top:12px;border-top:1px solid var(--divider-color,rgba(0,0,0,.1))}
      h3:first-child{border-top:none;padding-top:0}
      .row{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}
      label{font-size:12px;font-weight:600;color:var(--secondary-text-color,#666)}
      input[type=text],input[type=number]{
        padding:7px 10px;border-radius:7px;width:100%;
        border:1px solid var(--divider-color,rgba(0,0,0,.2));
        background:var(--secondary-background-color,#f5f5f5);
        color:var(--primary-text-color);font-size:13px}
      .color-row{display:flex;align-items:center;gap:10px}
      input[type=color]{padding:2px;height:34px;width:48px;border-radius:6px;cursor:pointer;
        border:1px solid var(--divider-color,rgba(0,0,0,.2))}
      .color-val{font-size:12px;opacity:.6;font-family:monospace}
      .tog{display:flex;align-items:center;gap:9px;cursor:pointer;margin-bottom:10px;font-size:13px}
      .tog input{width:auto}
      .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    </style>
    <h3>General</h3>
    <div class="row">
      <label>Title</label>
      <input type="text" id="e-title" value="${c.title||"Chore Summary"}">
    </div>
    <div class="row">
      <label>Accent colour</label>
      <div class="color-row">
        <input type="color" id="e-accent" value="${c.accent||"#3b82f6"}">
        <span class="color-val" id="e-accent-val">${c.accent||"#3b82f6"}</span>
      </div>
    </div>
    <h3>Content</h3>
    <label class="tog">
      <input type="checkbox" id="e-spark" ${c.show_sparkline!==false?"checked":""}>
      Show 7-day sparkline
    </label>
    <div class="row">
      <label>Max tasks in scroll row</label>
      <input type="number" id="e-max" min="2" max="20" value="${c.max_tasks||8}">
    </div>`;

    const R = this.shadowRoot;
    R.getElementById("e-title" ).addEventListener("input",  e => this._fire({title:        e.target.value}));
    R.getElementById("e-accent").addEventListener("input",  e => {
      R.getElementById("e-accent-val").textContent = e.target.value;
      this._fire({accent: e.target.value});
    });
    R.getElementById("e-spark" ).addEventListener("change", e => this._fire({show_sparkline: e.target.checked}));
    R.getElementById("e-max"   ).addEventListener("change", e => this._fire({max_tasks: parseInt(e.target.value)||8}));
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
    description: "Horizontal summary card with action buttons, sparkline and stats.",
    preview:     true,
  });

console.info(
  "%c CHORE-TRACKER-SUMMARY %c v2.2 ",
  "background:#6366f1;color:#fff;padding:2px 6px;border-radius:4px 0 0 4px;font-weight:700",
  "background:#181d2a;color:#818cf8;padding:2px 6px;border-radius:0 4px 4px 0;font-weight:600"
);
