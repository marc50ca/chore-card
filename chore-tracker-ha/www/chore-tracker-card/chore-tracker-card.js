/**
 * Chore Tracker Card — v3.0
 * Data: WebSocket subscription to chore_tracker/subscribe
 * Rendering: stable skeleton, panes updated independently
 */

const CT_DOMAIN = "chore_tracker";

const PRIORITY = {
  low:    { label:"Low",    color:"#64748b", icon:"▽" },
  medium: { label:"Medium", color:"#3b82f6", icon:"◈" },
  high:   { label:"High",   color:"#f59e0b", icon:"▲" },
  urgent: { label:"Urgent", color:"#ef4444", icon:"⬡" },
};
const RECUR_LABELS = {
  none:"No repeat", daily:"Daily", weekly:"Weekly",
  bi_weekly:"Every 2 weeks", monthly:"Monthly", bi_monthly:"Every 2 months",
  yearly:"Yearly", day_of_week:"Day of week", day_of_month_position:"Position in month",
};
const DAYS     = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const WEEK_POS = {"1":"1st","2":"2nd","3":"3rd","4":"4th","-1":"Last"};
const CAT_ICON = {cleaning:"🧹",cooking:"🍳",laundry:"👕",shopping:"🛒",yard:"🌿",
  maintenance:"🔧",pets:"🐾",childcare:"👶",finance:"💰",health:"❤️",other:"📋"};
const ALL_CATS = ["cleaning","cooking","laundry","shopping","yard","maintenance","pets","childcare","finance","health","other"];

const h = (s) => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d+"T00:00:00"), now = new Date(); now.setHours(0,0,0,0);
  const diff = Math.round((dt-now)/86400000);
  if (diff===0) return "Today"; if (diff===1) return "Tomorrow"; if (diff===-1) return "Yesterday";
  if (diff<0) return Math.abs(diff)+"d overdue"; if (diff<7) return "In "+diff+"d";
  return dt.toLocaleDateString(undefined,{month:"short",day:"numeric"});
}
const isOverdue = t => !!(t.due_date && t.status!=="completed" && new Date(t.due_date+"T00:00:00") < (() => { const n=new Date(); n.setHours(0,0,0,0); return n; })());
const isToday   = t => !!(t.due_date && (() => { const d=new Date(t.due_date+"T00:00:00"), n=new Date(); n.setHours(0,0,0,0); return d.getTime()===n.getTime(); })());
const recurLabel = t => {
  const r=t.recurrence||"none";
  if (r==="day_of_week") return "Every "+DAYS[t.recurrence_day||0];
  if (r==="day_of_month_position") return (WEEK_POS[String(t.recurrence_week_position||1)]||"1st")+" "+DAYS[t.recurrence_day||0];
  return RECUR_LABELS[r]||r;
};

// ─── CSS ─────────────────────────────────────────────────────────────────────

const CSS = `
:host{display:block}*{box-sizing:border-box;margin:0;padding:0}
.card{background:var(--card-background-color,#1e2130);border-radius:16px;overflow:hidden;
  font-family:'Segoe UI',system-ui,sans-serif;color:var(--primary-text-color,#e2e8f0);
  border:1px solid rgba(255,255,255,.07);box-shadow:0 4px 24px rgba(0,0,0,.3)}
.hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 18px 12px;
  border-bottom:1px solid rgba(255,255,255,.06);
  background:linear-gradient(135deg,rgba(59,130,246,.08),rgba(99,102,241,.05))}
.hdr-l{display:flex;align-items:center;gap:10px}
.hdr-ico{width:30px;height:30px;background:linear-gradient(135deg,#3b82f6,#6366f1);
  border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px}
.hdr-title{font-size:16px;font-weight:700}
.search{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:20px;
  padding:5px 13px;color:inherit;font-size:13px;width:150px;outline:none;transition:border-color .2s,width .2s}
.search:focus{border-color:#3b82f6;width:190px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid rgba(255,255,255,.06)}
.stat{padding:11px 6px;text-align:center;cursor:pointer;border-right:1px solid rgba(255,255,255,.05);transition:background .15s}
.stat:last-child{border-right:none}.stat:hover{background:rgba(255,255,255,.04)}
.sn{display:block;font-size:20px;font-weight:800;line-height:1}
.sl{display:block;font-size:11px;opacity:.6;margin-top:2px}
.sd .sn{color:#ef4444}.sw .sn{color:#f59e0b}.sg .sn{color:#22c55e}
.tabs{display:flex;border-bottom:1px solid rgba(255,255,255,.07);background:rgba(0,0,0,.15)}
.tab{flex:1;padding:10px 6px;background:none;border:none;color:inherit;cursor:pointer;
  font-size:13px;font-weight:500;opacity:.55;transition:all .2s;border-bottom:2px solid transparent}
.tab:hover{opacity:.85}.tab.on{opacity:1;color:#3b82f6;border-bottom-color:#3b82f6}
.pane{padding:14px;max-height:580px;overflow-y:auto;overflow-x:hidden}
.pane::-webkit-scrollbar{width:3px}
.pane::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:2px}
.frow{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.chips{display:flex;gap:5px;flex-wrap:wrap;flex:1}
.chip{padding:4px 11px;border-radius:20px;border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.05);color:inherit;cursor:pointer;font-size:12px;
  font-weight:500;white-space:nowrap;user-select:none;transition:background .15s,border-color .15s}
.chip:hover{background:rgba(255,255,255,.1)}.chip.on{background:rgba(59,130,246,.2);border-color:#3b82f6;color:#60a5fa}
.chip.sm{font-size:11px;padding:3px 9px}
.catrow{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px}
.sortsel{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:8px;
  padding:5px 8px;color:inherit;font-size:12px;cursor:pointer}
.sortsel option{background:#1e2130;color:#e2e8f0}
.tlist{display:flex;flex-direction:column;gap:7px}
.tc{border-radius:11px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);
  border-left:3px solid var(--pc,#3b82f6);transition:background .2s}
.tc:hover{background:rgba(255,255,255,.06)}.tc.od{background:rgba(239,68,68,.04)}.tc.dn{opacity:.45}
.tm{display:flex;align-items:center;gap:9px;padding:11px 13px}
.chk{width:23px;height:23px;border-radius:50%;border:2px solid rgba(255,255,255,.2);background:none;
  cursor:pointer;color:#fff;font-size:12px;flex-shrink:0;display:flex;align-items:center;
  justify-content:center;transition:all .15s}
.chk:hover{border-color:#22c55e;background:rgba(34,197,94,.1)}.chk.on{background:#22c55e;border-color:#22c55e}
.tbody{flex:1;cursor:pointer;min-width:0}
.tname{font-size:14px;font-weight:600;line-height:1.3}
.tmeta{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.mc{font-size:11px;padding:2px 7px;border-radius:9px;background:rgba(255,255,255,.07);color:rgba(255,255,255,.7);white-space:nowrap}
.mc.r{background:rgba(239,68,68,.15);color:#fca5a5}.mc.y{background:rgba(245,158,11,.15);color:#fcd34d}
.mc.p{background:rgba(139,92,246,.15);color:#c4b5fd}
.tact{display:flex;align-items:center;gap:5px;flex-shrink:0}
.pb{font-size:11px;padding:2px 7px;border-radius:7px;border:1px solid;font-weight:600;white-space:nowrap}
.ibtn{width:27px;height:27px;border-radius:6px;border:1px solid rgba(255,255,255,.1);
  background:rgba(255,255,255,.05);color:inherit;cursor:pointer;font-size:12px;
  display:flex;align-items:center;justify-content:center;transition:all .15s}
.ibtn:hover{background:rgba(255,255,255,.12)}
.ibtn.del:hover{background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.4);color:#fca5a5}
.tdet{padding:10px 13px 13px 46px;border-top:1px solid rgba(255,255,255,.05);background:rgba(0,0,0,.1)}
.tdesc{font-size:13px;opacity:.75;margin-bottom:7px;line-height:1.5}
.tnotes{font-size:12px;opacity:.6;margin-bottom:9px;font-style:italic}
.dact{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:9px}
.abtn{padding:5px 12px;border-radius:7px;border:1px solid rgba(255,255,255,.15);cursor:pointer;
  font-size:12px;font-weight:600;background:rgba(255,255,255,.07);color:inherit;transition:all .15s}
.abtn:hover{background:rgba(255,255,255,.13)}
.abtn.pri{background:#3b82f6;border-color:#3b82f6;color:#fff}.abtn.pri:hover{background:#2563eb}
.abtn.nfc{background:rgba(139,92,246,.15);border-color:rgba(139,92,246,.4);color:#c4b5fd}
.hist{margin-top:7px}.histt{font-size:10px;opacity:.45;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px}
.histi{font-size:12px;opacity:.55;padding:1px 0}
.empty{text-align:center;padding:36px 16px}.empty-ico{font-size:36px;margin-bottom:8px}
.empty-txt{font-size:14px;opacity:.45}
.err{padding:20px;text-align:center;font-size:13px;opacity:.6}
.form{display:flex;flex-direction:column;gap:13px}
.ftitle{font-size:15px;font-weight:700}
.fg{display:flex;flex-direction:column;gap:5px}
.fr2{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.fl{font-size:11px;font-weight:700;opacity:.6;text-transform:uppercase;letter-spacing:.5px}
.fi,.fs,.ft{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:8px;
  padding:8px 11px;color:inherit;font-size:13px;font-family:inherit;outline:none;width:100%;
  transition:border-color .2s}
.fi:focus,.fs:focus,.ft:focus{border-color:#3b82f6}
.fs{cursor:pointer}.fs option{background:#1e2130;color:#e2e8f0}
.ft{resize:vertical;min-height:58px}
.factions{display:flex;gap:9px;margin-top:4px}
.nfc-wrap{display:flex;flex-direction:column;gap:14px}
.nfc-hdr{display:flex;align-items:center;gap:12px}
.nfc-ico{font-size:34px}
.nfc-card{background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.2);border-radius:11px;padding:14px}
.nfc-st{font-size:13px;font-weight:700;color:#c4b5fd;margin-bottom:9px}
.nfc-steps{padding-left:16px;display:flex;flex-direction:column;gap:5px}
.nfc-steps li{font-size:13px;opacity:.8;line-height:1.5}
.code{background:rgba(0,0,0,.3);border-radius:7px;padding:10px;font-size:11px;
  font-family:'Courier New',monospace;color:#a5f3fc;line-height:1.6;border:1px solid rgba(255,255,255,.05);
  margin-top:10px;overflow-x:auto;white-space:pre}
.stitle{font-size:12px;font-weight:700;opacity:.6;text-transform:uppercase;letter-spacing:.5px}
.ntlist{display:flex;flex-direction:column;gap:7px}
.nti{display:flex;align-items:center;gap:11px;padding:9px 13px;background:rgba(255,255,255,.04);
  border-radius:9px;border:1px solid rgba(255,255,255,.08)}
.nti-info{flex:1}.nti-name{font-size:13px;font-weight:600}
.nti-tag{font-size:11px;opacity:.45;margin-top:1px}
.nti-tag code{font-family:monospace;color:#c4b5fd}
.naform{display:flex;flex-direction:column;gap:9px}
`;

// ─── Card ─────────────────────────────────────────────────────────────────────

class ChoreTrackerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:"open"});
    this._cfg     = {};
    this._hass    = null;
    this._tasks   = {};
    this._cats    = [];
    this._stats   = {};
    this._filter  = "all";
    this._sort    = "due_date";
    this._catF    = "all";
    this._showDone = false;
    this._tab     = "tasks";
    this._editId  = null;
    this._expId   = null;
    this._q       = "";
    this._built   = false;
    this._wsUnsub = null;   // WebSocket unsubscribe function
    this._wsReady = false;  // has WS subscription succeeded?
  }

  // ── HA lifecycle ────────────────────────────────────────────────────────────

  setConfig(cfg) {
    this._cfg = {title:"Chore Tracker", show_header:true, show_stats:true, ...cfg};
    if (!this._built) this._buildSkeleton();
    else this._refreshAll();
  }

  set hass(hass) {
    const firstTime = !this._hass;
    this._hass = hass;

    if (!this._built) this._buildSkeleton();

    // Start WS subscription once we have hass (only once)
    if (firstTime || !this._wsReady) this._subscribeWS();

    // Never disturb the add form
    if (this._tab !== "add") this._refreshTaskPane();
  }

  disconnectedCallback() {
    // Clean up WS subscription when card is removed
    if (this._wsUnsub) { this._wsUnsub(); this._wsUnsub = null; }
    this._wsReady = false;
  }

  // ── WebSocket subscription ──────────────────────────────────────────────────

  async _subscribeWS() {
    if (!this._hass || this._wsReady) return;
    try {
      // Subscribe to live updates from the integration
      this._wsUnsub = await this._hass.connection.subscribeMessage(
        (event) => this._onWsEvent(event),
        {type: "chore_tracker/subscribe"}
      );
      this._wsReady = true;
    } catch (err) {
      // WS subscribe failed — fall back to one-time fetch
      console.warn("ChoreTracker: WS subscribe failed, trying get_tasks:", err);
      this._wsReady = false;
      this._fetchOnce();
    }
  }

  _onWsEvent(data) {
    if (!data) return;
    this._tasks = data.tasks      || {};
    this._cats  = data.categories || [];
    this._stats = data.stats      || {};
    if (this._tab !== "add") this._refreshTaskPane();
  }

  async _fetchOnce() {
    if (!this._hass) return;
    try {
      const data = await this._hass.callWS({type:"chore_tracker/get_tasks"});
      this._tasks = data.tasks      || {};
      this._cats  = data.categories || [];
      this._stats = data.stats      || {};
      if (this._tab !== "add") this._refreshTaskPane();
    } catch (err) {
      console.error("ChoreTracker: get_tasks failed:", err);
    }
  }

  // ── Service call + re-fetch ─────────────────────────────────────────────────

  async _svc(service, data) {
    if (!this._hass) return;
    try {
      await this._hass.callService(CT_DOMAIN, service, data);
    } catch(e) {
      console.error("chore_tracker."+service, e);
    }
    // The WS subscription will auto-push updated data if coordinator refreshes.
    // As insurance, also do a manual fetch after a short delay.
    setTimeout(() => this._fetchOnce(), 800);
  }

  // ── Skeleton (built once) ───────────────────────────────────────────────────

  _buildSkeleton() {
    this._built = true;
    this.shadowRoot.innerHTML = `<style>${CSS}</style>
    <div class="card">
      <div id="p-hdr"></div>
      <div id="p-stats"></div>
      <div class="tabs">
        <button class="tab on" id="t-tasks">📋 Tasks</button>
        <button class="tab"    id="t-add">＋ New</button>
        <button class="tab"    id="t-nfc">📱 NFC</button>
      </div>
      <div id="p-tasks" class="pane"></div>
      <div id="p-add"   class="pane" style="display:none"></div>
      <div id="p-nfc"   class="pane" style="display:none"></div>
    </div>`;

    const R = this.shadowRoot;
    R.getElementById("t-tasks").addEventListener("click", () => this._switchTab("tasks"));
    R.getElementById("t-add"  ).addEventListener("click", () => { this._editId=null; this._switchTab("add"); });
    R.getElementById("t-nfc"  ).addEventListener("click", () => this._switchTab("nfc"));

    this._refreshAll();
  }

  _switchTab(tab) {
    this._tab = tab;
    const R = this.shadowRoot;
    ["tasks","add","nfc"].forEach(t => {
      const pane = R.getElementById("p-"+t);
      const btn  = R.getElementById("t-"+t);
      if (pane) pane.style.display = t===tab ? "" : "none";
      if (btn)  btn.classList.toggle("on", t===tab);
    });
    if (tab==="tasks") this._renderTaskList();
    if (tab==="add")   this._renderForm();
    if (tab==="nfc")   this._renderNfc();
  }

  _refreshAll() {
    this._renderHeader();
    this._renderStats();
    if (this._tab==="tasks") this._renderTaskList();
    if (this._tab==="nfc")   this._renderNfc();
  }

  _refreshTaskPane() {
    this._renderStats();
    if (this._tab==="tasks") this._renderTaskList();
    if (this._tab==="nfc")   this._renderNfc();
  }

  // ── Header ──────────────────────────────────────────────────────────────────

  _renderHeader() {
    const el = this.shadowRoot.getElementById("p-hdr");
    if (!el || !this._cfg.show_header) { if(el) el.innerHTML=""; return; }
    el.innerHTML = `<div class="hdr">
      <div class="hdr-l">
        <div class="hdr-ico">✓</div>
        <span class="hdr-title">${h(this._cfg.title)}</span>
      </div>
      <input class="search" id="srch" type="text" placeholder="Search…" value="${h(this._q)}">
    </div>`;
    let st;
    el.querySelector("#srch").addEventListener("input", e => {
      this._q = e.target.value;
      clearTimeout(st); st = setTimeout(() => this._renderTaskList(), 200);
    });
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  _renderStats() {
    const el = this.shadowRoot.getElementById("p-stats");
    if (!el || !this._cfg.show_stats) { if(el) el.innerHTML=""; return; }
    const all  = Object.values(this._tasks);
    const od   = all.filter(isOverdue).length;
    const tod  = all.filter(isToday).length;
    const pend = all.filter(t=>t.status==="pending").length;
    const done = all.filter(t=>t.status==="completed").length;
    el.innerHTML = `<div class="stats">
      <div class="stat${od>0?" sd":""}" data-sf="overdue"><span class="sn">${od}</span><span class="sl">Overdue</span></div>
      <div class="stat${tod>0?" sw":""}" data-sf="today"><span class="sn">${tod}</span><span class="sl">Today</span></div>
      <div class="stat" data-sf="all"><span class="sn">${pend}</span><span class="sl">Pending</span></div>
      <div class="stat sg"><span class="sn">${done}</span><span class="sl">Done</span></div>
    </div>`;
    el.querySelectorAll("[data-sf]").forEach(s => s.addEventListener("click", () => {
      if (s.dataset.sf==="done") { this._showDone=true; this._filter="all"; }
      else this._filter = s.dataset.sf;
      this._switchTab("tasks");
    }));
  }

  // ── Task list ───────────────────────────────────────────────────────────────

  _renderTaskList() {
    const pane = this.shadowRoot.getElementById("p-tasks");
    if (!pane) return;
    const cats     = [...new Set([...ALL_CATS, ...this._cats])];
    const filtered = this._filtered();

    pane.innerHTML = `
      <div class="frow">
        <div class="chips">
          ${["all","overdue","today","upcoming"].map(f=>`
            <button class="chip${this._filter===f?" on":""}" data-f="${f}">
              ${f==="all"?"All":f==="overdue"?"🔴 Overdue":f==="today"?"📅 Today":"📆 Week"}
            </button>`).join("")}
          <button class="chip${this._showDone?" on":""}" id="tog">
            ${this._showDone?"Hide Done":"✓ Done"}
          </button>
        </div>
        <select class="sortsel" id="sort">
          <option value="due_date"${this._sort==="due_date"?" selected":""}>By date</option>
          <option value="priority"${this._sort==="priority"?" selected":""}>By priority</option>
          <option value="name"    ${this._sort==="name"    ?" selected":""}>By name</option>
        </select>
      </div>
      <div class="catrow">
        <button class="chip sm${this._catF==="all"?" on":""}" data-cat="all">All</button>
        ${cats.map(c=>`<button class="chip sm${this._catF===c?" on":""}" data-cat="${c}">${CAT_ICON[c]||"📌"} ${c}</button>`).join("")}
      </div>
      <div class="tlist" id="tl">
        ${filtered.length===0
          ? `<div class="empty"><div class="empty-ico">🎉</div><div class="empty-txt">All clear!</div></div>`
          : filtered.map(t=>this._taskHtml(t)).join("")}
      </div>`;

    pane.querySelectorAll("[data-f]").forEach(b => b.addEventListener("click", () => { this._filter=b.dataset.f; this._renderTaskList(); }));
    pane.querySelectorAll("[data-cat]").forEach(b => b.addEventListener("click", () => { this._catF=b.dataset.cat; this._renderTaskList(); }));
    pane.querySelector("#tog")?.addEventListener("click", () => { this._showDone=!this._showDone; this._renderTaskList(); });
    pane.querySelector("#sort")?.addEventListener("change", e => { this._sort=e.target.value; this._renderTaskList(); });
    pane.querySelector("#tl")?.addEventListener("click", e => this._onTaskClick(e));
  }

  _taskHtml(t) {
    const p   = PRIORITY[t.priority]||PRIORITY.medium;
    const od  = isOverdue(t), tod = isToday(t), exp = this._expId===t.id;
    const asgn = (t.assigned_to||[]).join(", ");
    return `<div class="tc${od?" od":""}${t.status==="completed"?" dn":""}" style="--pc:${p.color}" data-tid="${t.id}">
      <div class="tm">
        <button class="chk${t.status==="completed"?" on":""}" data-a="complete" data-tid="${t.id}">${t.status==="completed"?"✓":""}</button>
        <div class="tbody" data-a="expand" data-tid="${t.id}">
          <div class="tname">${h(t.name)}</div>
          <div class="tmeta">
            ${t.category ?`<span class="mc">${CAT_ICON[t.category]||"📌"} ${t.category}</span>`:""}
            ${t.due_date ?`<span class="mc${od?" r":tod?" y":""}">📅 ${fmtDate(t.due_date)}</span>`:""}
            ${t.recurrence&&t.recurrence!=="none"?`<span class="mc">🔄 ${recurLabel(t)}</span>`:""}
            ${t.nfc_tag_id?`<span class="mc p">📱 NFC</span>`:""}
            ${asgn?`<span class="mc">👤 ${h(asgn)}</span>`:""}
          </div>
        </div>
        <div class="tact">
          <span class="pb" style="background:${p.color}20;color:${p.color};border-color:${p.color}40">${p.icon} ${p.label}</span>
          <button class="ibtn"     data-a="edit"   data-tid="${t.id}">✏</button>
          <button class="ibtn del" data-a="delete" data-tid="${t.id}">✕</button>
        </div>
      </div>
      ${exp?`<div class="tdet">
        ${t.description?`<div class="tdesc">${h(t.description)}</div>`:""}
        ${t.notes?`<div class="tnotes">📝 ${h(t.notes)}</div>`:""}
        <div class="dact">
          ${t.recurrence&&t.recurrence!=="none"?`<button class="abtn" data-a="skip" data-tid="${t.id}">⏭ Skip</button>`:""}
          <button class="abtn" data-a="snooze" data-tid="${t.id}">⏰ Snooze 1d</button>
          ${!t.nfc_tag_id
            ?`<button class="abtn nfc" data-a="assign-nfc" data-tid="${t.id}">📱 Assign NFC</button>`
            :`<span class="mc p">📱 ${h(t.nfc_tag_id)}</span>
              <button class="abtn" data-a="remove-nfc" data-tid="${t.id}">Remove NFC</button>`}
        </div>
        ${(t.completion_history||[]).length?`<div class="hist">
          <div class="histt">Recent</div>
          ${t.completion_history.slice(-3).reverse().map(e=>`<div class="histi">✓ ${new Date(e.completed_at).toLocaleDateString()}${e.completed_by?" · "+e.completed_by:""}</div>`).join("")}
        </div>`:""}
      </div>`:""}
    </div>`;
  }

  _onTaskClick(e) {
    const btn = e.target.closest("[data-a]"); if (!btn) return;
    const a = btn.dataset.a, tid = btn.dataset.tid;
    if (a==="complete")   { e.stopPropagation(); this._svc("complete_task",{task_id:tid}); }
    if (a==="expand")     { this._expId=this._expId===tid?null:tid; this._renderTaskList(); }
    if (a==="edit")       { e.stopPropagation(); this._editId=tid; this._switchTab("add"); }
    if (a==="delete")     { e.stopPropagation(); if(confirm("Delete this task?")) this._svc("delete_task",{task_id:tid}); }
    if (a==="skip")       { this._svc("skip_task",{task_id:tid}); }
    if (a==="snooze")     { this._svc("snooze_task",{task_id:tid,days:1}); }
    if (a==="assign-nfc") { const tag=prompt("Enter NFC Tag ID:"); if(tag) this._svc("assign_nfc_tag",{task_id:tid,nfc_tag_id:tag.trim()}); }
    if (a==="remove-nfc") { this._svc("update_task",{task_id:tid,nfc_tag_id:""}); }
  }

  // ── Add / Edit form ─────────────────────────────────────────────────────────

  _renderForm() {
    const pane = this.shadowRoot.getElementById("p-add"); if (!pane) return;
    const tid  = this._editId;
    const t    = tid ? (this._tasks[tid]||{}) : {};
    const cats = [...new Set([...ALL_CATS, ...this._cats])];

    pane.innerHTML = `<div class="form">
      <div class="ftitle">${tid?"✏ Edit Task":"＋ New Task"}</div>
      <div class="fg"><label class="fl">Task Name *</label>
        <input class="fi" id="f-name" type="text" placeholder="e.g. Vacuum living room" value="${h(t.name||"")}">
      </div>
      <div class="fr2">
        <div class="fg"><label class="fl">Category</label>
          <select class="fs" id="f-cat">
            ${cats.map(c=>`<option value="${c}"${t.category===c?" selected":""}>${CAT_ICON[c]||"📌"} ${c}</option>`).join("")}
          </select>
        </div>
        <div class="fg"><label class="fl">Priority</label>
          <select class="fs" id="f-pri">
            ${["low","medium","high","urgent"].map(p=>`<option value="${p}"${(t.priority||"medium")===p?" selected":""}>${PRIORITY[p].icon} ${PRIORITY[p].label}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="fg"><label class="fl">Description</label>
        <textarea class="ft" id="f-desc" rows="2" placeholder="Optional…">${h(t.description||"")}</textarea>
      </div>
      <div class="fr2">
        <div class="fg"><label class="fl">Due Date</label>
          <input class="fi" id="f-due" type="date" value="${h(t.due_date||"")}">
        </div>
        <div class="fg"><label class="fl">Assigned To</label>
          <input class="fi" id="f-asgn" type="text" placeholder="user1, user2" value="${h((t.assigned_to||[]).join(", "))}">
        </div>
      </div>
      <div class="fg"><label class="fl">Recurrence</label>
        <select class="fs" id="f-recur">
          ${Object.entries(RECUR_LABELS).map(([k,v])=>`<option value="${k}"${(t.recurrence||"none")===k?" selected":""}>${v}</option>`).join("")}
        </select>
      </div>
      <div id="f-extra" style="${["day_of_week","day_of_month_position"].includes(t.recurrence||"")?"":"display:none"}">
        <div class="fr2">
          <div class="fg"><label class="fl">Day of Week</label>
            <select class="fs" id="f-day">
              ${DAYS.map((d,i)=>`<option value="${i}"${(t.recurrence_day??0)===i?" selected":""}>${d}</option>`).join("")}
            </select>
          </div>
          <div class="fg" id="f-pos-g" style="${t.recurrence==="day_of_month_position"?"":"display:none"}">
            <label class="fl">Week Position</label>
            <select class="fs" id="f-pos">
              ${Object.entries(WEEK_POS).map(([k,v])=>`<option value="${k}"${String(t.recurrence_week_position??1)===k?" selected":""}>${v}</option>`).join("")}
            </select>
          </div>
        </div>
      </div>
      <div class="fg"><label class="fl">Notes</label>
        <textarea class="ft" id="f-notes" rows="2" placeholder="Extra notes…">${h(t.notes||"")}</textarea>
      </div>
      ${tid?`<input type="hidden" id="f-tid" value="${tid}">`:""}
      <div class="factions">
        <button class="abtn pri" id="f-save">${tid?"💾 Save Changes":"＋ Add Task"}</button>
        <button class="abtn"     id="f-cancel">Cancel</button>
      </div>
    </div>`;

    // Recurrence toggle — DOM manipulation only, no re-render
    pane.querySelector("#f-recur").addEventListener("change", e => {
      const v = e.target.value;
      pane.querySelector("#f-extra").style.display    = ["day_of_week","day_of_month_position"].includes(v) ? "" : "none";
      pane.querySelector("#f-pos-g").style.display    = v==="day_of_month_position" ? "" : "none";
    });
    pane.querySelector("#f-save"  ).addEventListener("click",  () => this._submitForm());
    pane.querySelector("#f-cancel").addEventListener("click",  () => { this._editId=null; this._switchTab("tasks"); });
  }

  _submitForm() {
    const p    = this.shadowRoot.getElementById("p-add");
    const name = p.querySelector("#f-name")?.value?.trim();
    if (!name) { alert("Task name is required."); return; }
    const recur = p.querySelector("#f-recur")?.value || "none";
    const data  = {
      name,
      category:    p.querySelector("#f-cat")?.value    || "other",
      priority:    p.querySelector("#f-pri")?.value    || "medium",
      description: p.querySelector("#f-desc")?.value   || "",
      due_date:    p.querySelector("#f-due")?.value     || null,
      assigned_to: (p.querySelector("#f-asgn")?.value||"").split(",").map(s=>s.trim()).filter(Boolean),
      recurrence:  recur,
      notes:       p.querySelector("#f-notes")?.value  || "",
    };
    if (["day_of_week","day_of_month_position"].includes(recur)) {
      data.recurrence_day = parseInt(p.querySelector("#f-day")?.value||"0",10);
      if (recur==="day_of_month_position")
        data.recurrence_week_position = parseInt(p.querySelector("#f-pos")?.value||"1",10);
    }
    const tid = p.querySelector("#f-tid")?.value;
    if (tid) this._svc("update_task",{task_id:tid,...data});
    else     this._svc("add_task",data);
    this._editId=null;
    this._switchTab("tasks");
  }

  // ── NFC ─────────────────────────────────────────────────────────────────────

  _renderNfc() {
    const pane = this.shadowRoot.getElementById("p-nfc"); if (!pane) return;
    const all      = Object.values(this._tasks);
    const tagged   = all.filter(t=>t.nfc_tag_id);
    const untagged = all.filter(t=>!t.nfc_tag_id&&t.status!=="completed");
    pane.innerHTML = `<div class="nfc-wrap">
      <div class="nfc-hdr"><div class="nfc-ico">📱</div>
        <div><div style="font-size:15px;font-weight:700">NFC Tag Management</div>
          <div style="font-size:13px;opacity:.6;margin-top:2px">Complete tasks by tapping NFC tags</div>
        </div>
      </div>
      <div class="nfc-card">
        <div class="nfc-st">📋 iPhone Setup</div>
        <ol class="nfc-steps">
          <li>Install <strong>Home Assistant Companion App</strong> on iPhone</li>
          <li>Assign an NFC tag below, or via service call</li>
          <li>Create an automation triggered by <strong>Tag scanned</strong></li>
          <li>Use service <em>chore_tracker.complete_by_nfc</em> with the tag ID</li>
          <li>Write tag via HA app → NFC Tools → Write</li>
        </ol>
        <div class="code">trigger:
  - platform: tag
    tag_id: "YOUR_TAG_ID"
action:
  - service: chore_tracker.complete_by_nfc
    data:
      nfc_tag_id: "YOUR_TAG_ID"
      completed_by: "{{ trigger.device_id }}"</div>
      </div>
      ${tagged.length?`<div class="stitle">✅ Tagged (${tagged.length})</div>
        <div class="ntlist">${tagged.map(t=>`
          <div class="nti">
            <div class="nti-info">
              <div class="nti-name">${h(t.name)}</div>
              <div class="nti-tag">Tag: <code>${h(t.nfc_tag_id)}</code></div>
            </div>
            <button class="ibtn del" data-a="remove-nfc" data-tid="${t.id}">✕</button>
          </div>`).join("")}
        </div>`:""}
      ${untagged.length?`<div class="stitle">📭 Assign Tag</div>
        <div class="naform">
          <select class="fs" id="nfc-sel">
            <option value="">— Choose a task —</option>
            ${untagged.map(t=>`<option value="${t.id}">${h(t.name)}</option>`).join("")}
          </select>
          <input class="fi" id="nfc-inp" type="text" placeholder="NFC Tag ID">
          <button class="abtn pri" id="nfc-go">📱 Assign Tag</button>
        </div>`:""}
    </div>`;
    pane.querySelectorAll("[data-a='remove-nfc']").forEach(b =>
      b.addEventListener("click", () => this._svc("update_task",{task_id:b.dataset.tid,nfc_tag_id:""}))
    );
    pane.querySelector("#nfc-go")?.addEventListener("click", () => {
      const tid = pane.querySelector("#nfc-sel")?.value;
      const tag = pane.querySelector("#nfc-inp")?.value?.trim();
      if (!tid||!tag) { alert("Select a task and enter a tag ID."); return; }
      this._svc("assign_nfc_tag",{task_id:tid,nfc_tag_id:tag});
    });
  }

  // ── Filter / sort ────────────────────────────────────────────────────────────

  _filtered() {
    let list = Object.values(this._tasks);
    if (!this._showDone) list = list.filter(t=>t.status!=="completed");
    if (this._filter==="overdue")  list = list.filter(isOverdue);
    if (this._filter==="today")    list = list.filter(isToday);
    if (this._filter==="upcoming") list = list.filter(t=>{
      if (!t.due_date) return false;
      const d=new Date(t.due_date+"T00:00:00"),n=new Date(); n.setHours(0,0,0,0);
      const w=new Date(n); w.setDate(w.getDate()+7);
      return d>n && d<=w;
    });
    if (this._catF!=="all") list = list.filter(t=>t.category===this._catF);
    if (this._q) { const q=this._q.toLowerCase(); list=list.filter(t=>t.name.toLowerCase().includes(q)||(t.description||"").toLowerCase().includes(q)); }
    const ord={urgent:0,high:1,medium:2,low:3};
    list.sort((a,b)=>{
      if (this._sort==="priority") return (ord[a.priority]??2)-(ord[b.priority]??2);
      if (this._sort==="name") return a.name.localeCompare(b.name);
      if (!a.due_date&&!b.due_date) return 0;
      if (!a.due_date) return 1; if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });
    return list;
  }

  static getConfigElement() { return document.createElement("chore-tracker-card-editor"); }
  static getStubConfig() { return {title:"Chore Tracker",show_stats:true,show_header:true}; }
  getCardSize() { return 5; }
}

// ─── Editor ───────────────────────────────────────────────────────────────────

class ChoreTrackerCardEditor extends HTMLElement {
  constructor() { super(); this.attachShadow({mode:"open"}); }
  setConfig(c) { this._cfg=c; this._render(); }
  set hass(h) {}
  _render() {
    const c=this._cfg||{};
    this.shadowRoot.innerHTML=`<style>
      :host{display:block;padding:14px}
      .r{display:flex;flex-direction:column;gap:5px;margin-bottom:11px}
      label{font-size:12px;font-weight:600;opacity:.7}
      input[type=text]{padding:7px 11px;border-radius:6px;border:1px solid var(--divider-color,rgba(0,0,0,.2));
        background:var(--secondary-background-color);color:var(--primary-text-color);font-size:13px;width:100%}
      .cr{display:flex;align-items:center;gap:9px}
    </style>
    <div class="r"><label>Title</label><input type="text" id="ti" value="${c.title||"Chore Tracker"}"></div>
    <div class="r cr"><input type="checkbox" id="sh" ${c.show_header!==false?"checked":""}><label for="sh">Show header</label></div>
    <div class="r cr"><input type="checkbox" id="ss" ${c.show_stats!==false?"checked":""}><label for="ss">Show stats bar</label></div>`;
    this.shadowRoot.getElementById("ti").addEventListener("input",e=>this._fire({title:e.target.value}));
    [["sh","show_header"],["ss","show_stats"]].forEach(([id,key])=>
      this.shadowRoot.getElementById(id).addEventListener("change",e=>this._fire({[key]:e.target.checked}))
    );
  }
  _fire(u) { this._cfg={...this._cfg,...u}; this.dispatchEvent(new CustomEvent("config-changed",{detail:{config:this._cfg}})); }
}

customElements.define("chore-tracker-card",       ChoreTrackerCard);
customElements.define("chore-tracker-card-editor", ChoreTrackerCardEditor);
window.customCards = window.customCards||[];
if (!window.customCards.find(c=>c.type==="chore-tracker-card"))
  window.customCards.push({type:"chore-tracker-card",name:"Chore Tracker",
    description:"Chores with NFC, M365 sync, recurrence & assignment.",preview:true});
console.info("%c CHORE-TRACKER %c v3.0 ","background:#3b82f6;color:#fff;padding:2px 6px;border-radius:4px 0 0 4px;font-weight:700","background:#1e2130;color:#60a5fa;padding:2px 6px;border-radius:0 4px 4px 0;font-weight:600");
