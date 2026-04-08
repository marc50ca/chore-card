# CLAUDE.md — Chore Tracker for Home Assistant

Project guide for AI-assisted development. Read this before editing any file.

---

## What this is

A HACS-compatible Home Assistant custom integration that tracks household chores. It consists of:

- A Python backend (`custom_components/chore_tracker/`) that integrates with HA
- Two Lovelace dashboard cards (JS web components) served from `frontend/`
- Optional Microsoft 365 To Do sync via OAuth2
- iPhone push notifications for overdue chores

**Current versions:** Integration `1.1.0` · Main card `v4.2` · Summary card `v2.1`

---

## Repository structure

```
chore-tracker-ha/
├── hacs.json                          # HACS repo metadata (repo root)
├── README.md                          # User-facing install + config docs
├── CLAUDE.md                          # This file
└── custom_components/chore_tracker/
    ├── __init__.py                    # Entry point, service registration, frontend serving
    ├── manifest.json                  # HA integration manifest (domain, version, codeowners)
    ├── const.py                       # All constants — edit here first
    ├── coordinator.py                 # Data layer: storage, recurrence, M365 sync, reminders
    ├── config_flow.py                 # Setup wizard + M365 OAuth2 flow + options flow
    ├── sensor.py                      # Sensor entities — exposes task data as attributes
    ├── todo.py                        # Native HA Todo platform entity
    ├── services.yaml                  # Service field definitions with selectors
    ├── strings.json                   # UI strings (mirrors translations/en.json structure)
    ├── translations/en.json           # English translations for config/options/services UI
    └── frontend/
        ├── chore-tracker-card.js      # Main Lovelace card (full CRUD, filtering, NFC tab)
        └── chore-tracker-summary-card.js  # Horizontal summary card with action buttons
```

---

## Architecture

### Data flow

```
HA state updates (every ~15 min or on service call)
    │
    ▼
ChoreTrackerCoordinator._async_update_data()
    ├── _sync_m365()           (if M365 backend)
    ├── _check_overdue_tasks() (also auto-resets temp_complete)
    ├── _check_due_soon()      (fires due_soon events)
    └── _send_reminders()      (HA notification + iPhone push)
    │
    ▼
ChoreTrackerDataSensor.extra_state_attributes
    └── { tasks: {...}, categories: [...], stats: {...} }
    │
    ▼
hass.states["sensor.chore_tracker_data"]
    │
    ▼ (set hass called on every HA state update)
ChoreTrackerCard / ChoreTrackerSummaryCard
    └── reads tasks from entity attributes and re-renders
```

### Card rendering model

Both JS cards follow the **build once, patch in-place** pattern:

- `_buildSkeleton()` — writes `shadowRoot.innerHTML` exactly once
- `set hass(h)` — reads entity state, then calls `_refreshTaskPane()`
- **The add/edit form pane is NEVER touched by `set hass`** — guarded by `if (this._tab !== "add") return`
- All re-renders preserve `pane.scrollTop` to prevent scroll-jumping

**Never call `_buildSkeleton()` more than once.** If you need to reset the card, set `this._built = false` first.

### Task data schema

Each task stored in `this._tasks[id]`:

```js
{
  id:                     "uuid-string",
  name:                   "Vacuum living room",
  status:                 "pending" | "completed" | "temp_complete" | "overdue" | "skipped",
  category:               "cleaning" | "cooking" | ... | "other",
  priority:               "low" | "medium" | "high" | "urgent",
  due_date:               "2025-01-15",          // ISO date string or null
  recurrence:             "none" | "daily" | "weekly" | "bi_weekly" | "monthly" |
                          "bi_monthly" | "yearly" | "day_of_week" | "day_of_month_position",
  recurrence_day:         0-6,                   // 0=Monday
  recurrence_week_position: 1-4 | -1,            // -1=last
  assigned_to:            ["user1", "user2"],
  nfc_tag_id:             "tag-id" | null,
  description:            "string",
  notes:                  "string",
  created_at:             "ISO datetime",
  completed_at:           "ISO datetime" | null,
  temp_complete_reset_at: "ISO datetime" | null, // set when status=temp_complete
  last_reminded_date:     "2025-01-15",          // ISO date, prevents repeat reminders
  m365_task_id:           "graph-api-id" | null,
  completion_history:     [{ completed_at, completed_by, temp?, resets_in_hours? }]
}
```

---

## Key rules and gotchas

### Python

- **Always update `const.py` first** when adding new constants. All other files import from there.
- **`strings.json` and `translations/en.json` must stay in sync** for config/options keys. Service field descriptions only need to be in `strings.json`.
- **`TodoItemStatus.COMPLETED`** (past tense) — not `COMPLETE`. The HA enum has been wrong in previous versions; always use `COMPLETED`.
- **Static path API**: use `await hass.http.async_register_static_paths([StaticPathConfig(...)])`. The old `register_static_path` (singular, sync) was removed in HA 2024.2.
- **No `hass.components`** — this was removed. Import and call modules directly (e.g. `from homeassistant.components import websocket_api`).
- The coordinator's `async_config_entry_first_refresh()` must not raise `UpdateFailed` on empty storage. Always return `self._get_state()` even if tasks dict is empty.
- **Reminder deduplication**: each task stores `last_reminded_date` (ISO date string). `_send_reminders()` skips tasks where this equals today — prevents spam on every 15-min poll.

### JavaScript

- **No `innerHTML` re-render while the form is open.** The add/edit form has live `<input>` and `<select>` elements that would be destroyed. The guard is `if (this._tab !== "add") return` at the top of `set hass`.
- **Optimistic UI for complete/temp-complete**: flip `this._tasks[tid].status` locally and re-render *before* calling `callService`. HA confirms the real state via `set hass` a moment later.
- **Touch targets**: all interactive buttons must have `touch-action: manipulation` and `-webkit-tap-highlight-color: transparent`. Minimum effective tap area is 44px (use `::after` pseudo-element for invisible extension if the visual size is smaller).
- **Scroll preservation**: always save `pane.scrollTop` before `pane.innerHTML = ...` and restore it immediately after.
- **No WebSocket custom commands** — the card reads data directly from `hass.states["sensor.chore_tracker_data"].attributes.tasks`. Simple, reliable, no server-side WS handler needed.
- **Version bump**: when changing either JS file, bump `CARD_VERSION` or `SUMMARY_CARD_VERSION` in `const.py` and the version string in the JS file header comment and `console.info` call.

### HACS compliance checklist

Before releasing a new version, verify:

- [ ] `manifest.json` version is bumped (semver X.Y.Z)
- [ ] `hacs.json` exists at repo root with `name` and `category`
- [ ] `README.md` exists at repo root
- [ ] `strings.json` config/options keys match `translations/en.json`
- [ ] No placeholder URLs in `manifest.json` (`documentation`, `issue_tracker`, `codeowners`)
- [ ] No `__pycache__` or `.pyc` files in the zip
- [ ] `services.yaml` lists all services registered in `__init__.py`

---

## Adding a new service

1. Add `SERVICE_X = "x"` to `const.py`
2. Import it in `__init__.py` and add handler + `hass.services.async_register()`
3. Add schema to `services.yaml` with selectors
4. Add to `strings.json` under `services.x`
5. Add coordinator method `async_x()`
6. Add button/action in `chore-tracker-card.js` with `data-a="x"` and handler in `_onTaskClick()`

## Adding a new config option

1. Add `CONF_X` and `DEFAULT_X` to `const.py`
2. Import in `coordinator.py` and use in `_async_update_data()` or relevant method
3. Import in `config_flow.py` and add `vol.Optional(CONF_X, default=DEFAULT_X)` to options schema
4. Add label to both `strings.json` and `translations/en.json` under `options.step.init.data`

## Adding a new task status

1. Add `STATUS_X = "x"` to `const.py` and append to `STATUSES`
2. Handle in `coordinator._check_overdue_tasks()` — decide if it should auto-reset or block overdue marking
3. Add CSS class in `chore-tracker-card.js` (`.tc.sx { ... }`)
4. Handle in `_taskHtml()` — set `tcClass` and checkmark icon
5. Handle in `_onTaskClick()` if clickable
6. Update `_filtered()` if it should be hidden by default

---

## M365 OAuth2 flow

```
async_step_user()
    └── async_step_m365_creds()   ← user enters Client ID / Tenant ID / Secret
            │                        registers M365OAuthCallbackView HTTP view
            │                        generates CSRF state token → self.context["oauth_state"]
            ▼
        async_external_step(url=microsoft_auth_url)
            │                        opens browser popup for Microsoft sign-in
            ▼
        [User signs in → Microsoft redirects to /api/chore_tracker/oauth_callback]
            │
        M365OAuthCallbackView.get()
            │                        matches flow by context["oauth_state"]
            │                        stores code in flow context["oauth_code"]
            └── hass.config_entries.flow.async_configure(flow_id, {code, error})
            ▼
        async_step_m365_oauth(user_input={code})
            │                        stores code in self.context["oauth_code"]
            └── async_external_step_done(next_step_id="m365_token")
            ▼
        async_step_m365_token()
            │                        reads code from self.context["oauth_code"]
            │                        calls _exchange_code() → gets access_token + refresh_token
            │                        calls _fetch_todo_lists() → gets available lists
            └── async_step_m365_list() or async_create_entry()
```

**Critical**: the auth code must be stored in `self.context` in `async_step_m365_oauth` *before* calling `async_external_step_done()`. After `external_step_done`, HA calls the next step with `user_input=None` — the code would be lost otherwise.

---

## Sensor entities

| Entity ID | State | Key attributes |
|---|---|---|
| `sensor.chore_tracker_data` | task count | `tasks`, `categories`, `stats`, `integration_version`, `card_version` |
| `sensor.chore_tracker_total_tasks` | int | `categories`, `backend` |
| `sensor.chore_tracker_pending_tasks` | int | — |
| `sensor.chore_tracker_overdue_tasks` | int | — |
| `sensor.chore_tracker_due_today` | int | — |
| `sensor.chore_tracker_completed_today` | int | — |

The `chore_tracker_data` sensor is the data bridge — the JS cards read from it directly. The others are for HA automations and Lovelace stat cards.

---

## HA events fired

| Event | Payload |
|---|---|
| `chore_tracker_task_completed` | `task_id`, `name`, `completed_by`, `temporary?`, `resets_at?` |
| `chore_tracker_task_overdue` | `task_id`, `name` |
| `chore_tracker_task_due_soon` | `task_id`, `name`, `due_date` |
| `chore_tracker_reminder` | `overdue_count`, `tasks[]` |

---

## Frontend URLs (after install)

Cards are served from inside the integration — no `www/` folder needed.

| File | URL |
|---|---|
| Main card | `/chore_tracker/frontend/chore-tracker-card.js` |
| Summary card | `/chore_tracker/frontend/chore-tracker-summary-card.js` |

Both are auto-registered as Lovelace resources on first boot via `lovelace.resources` storage. If auto-registration fails, add them manually in Settings → Dashboards → Resources as JavaScript module type.

---

## Known limitations

- M365 sync uses delegated (user-based) OAuth — app-only permissions are blocked by Microsoft for personal To Do lists
- The `sensor.chore_tracker_data` attribute payload is capped by HA's 16KB state attribute limit for very large task lists — if you hit this, the card will show partial data
- No WebSocket push from backend to card — the card polls via `set hass` (every state update cycle). Changes appear within ~1-2 seconds after a service call
- `async_move_todo_item` in `todo.py` is a no-op (HA Todo platform requires it but task ordering isn't persisted)
