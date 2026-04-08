# 🗂️ Chore Tracker for Home Assistant

A full-featured HACS integration and Lovelace dashboard card for tracking household chores — with Microsoft 365 sync, iPhone NFC support, recurrence scheduling, temporary completion, and push notifications.

---

## 📦 Installation

### Step 1 — Copy the integration folder

Unzip the package and copy **one folder** into your HA config directory:

```
config/
└── custom_components/
    └── chore_tracker/        ← copy this entire folder
```

That's it. No `www` folder needed. The dashboard cards are bundled inside the integration and served automatically.

### Step 2 — Restart Home Assistant (full restart required)

**Settings → System → Restart → Restart Home Assistant**

A full restart — not just a reload — is required. On first boot HA will:
- Register the integration
- Serve the card JS files at `/chore_tracker/frontend/`
- Auto-add both cards as Lovelace resources

### Step 3 — Hard refresh your browser

After restart, force the browser to load the new JS:

- **Desktop**: `Ctrl + Shift + R` (Windows/Linux) or `Cmd + Shift + R` (Mac)
- **Mobile/HA App**: Force-close and reopen

> ⚠️ **Card not appearing after restart?**
> 1. Hard refresh first (above) — this fixes 90% of cases
> 2. Check **Settings → Dashboards → Resources** — you should see two entries for `/chore_tracker/frontend/`
> 3. If they're missing, add them manually as **JavaScript module**:
>    - `/chore_tracker/frontend/chore-tracker-card.js`
>    - `/chore_tracker/frontend/chore-tracker-summary-card.js`
> 4. Open browser DevTools → Console — any red JS error there identifies the exact problem

### Step 4 — Add the integration

**Settings → Devices & Services → Add Integration → search "Chore Tracker"**

Choose **Local** (stores tasks in HA) or **Microsoft 365** (syncs with To Do).

### Step 5 — Add cards to your dashboard

**Dashboard → Edit → Add card → search "Chore Tracker"**

Main card:
```yaml
type: custom:chore-tracker-card
title: Household Chores
show_stats: true
show_header: true
layout: normal        # compact | normal | large | wide
max_height: 580
```

Summary card (horizontal):
```yaml
type: custom:chore-tracker-summary-card
title: Chore Summary
show_sparkline: true
max_tasks: 8
accent: "#3b82f6"
```

---

## 📋 Changelog

### v1.1.0 — Current
- **Temporary complete** — mark a chore done for 24h, auto-resets to pending
- **iPhone push notifications** — direct push to `notify.mobile_app_marcs_iphone_14` when chores are 2+ days overdue
- **Microsoft 365 OAuth** — proper delegated auth flow with browser sign-in popup
- **Dashboard cards self-register** — no manual Lovelace resource steps needed
- **Horizontal summary card** — at-a-glance view with sparkline, stats, and action buttons
- **Reminder popup** — in-card banner when overdue chores exist, dismissible for the day
- **Layout options** — compact / normal / large / wide, column count, height
- **Scroll fixes** — scroll position preserved across HA state updates
- **Touch fixes** — larger tap targets, no 300ms iOS delay, optimistic UI on complete

### v1.0.0 — Initial release
- Local storage and Microsoft 365 To Do backends
- Full recurrence engine (daily → yearly, day-of-week, nth weekday of month)
- NFC tag support for iPhone completion
- Priority levels, categories, assignment to HA users
- Lovelace card with filtering, sorting, search
- Sensor entities for overdue/today/pending counts

## 🔷 Microsoft 365 Setup

### 1 — Create Azure App Registration

1. Go to [portal.azure.com](https://portal.azure.com) → **Azure Active Directory → App registrations → New registration**
2. Name: anything (e.g. `HA Chore Tracker`)
3. Supported account types: *Accounts in this organizational directory only* (or personal if using Outlook.com)
4. Redirect URI: **Web** platform →
   ```
   https://homeassistant.peterborough.madasc.com:8123/api/chore_tracker/oauth_callback
   ```
5. Click **Register** — copy the **Application (Client) ID** and **Directory (Tenant) ID**

### 2 — Add API Permissions (delegated only)

**API permissions → Add a permission → Microsoft Graph → Delegated permissions:**

| Permission | Purpose |
|---|---|
| `Tasks.ReadWrite` | Read and write To Do tasks |
| `offline_access` | Stay logged in (refresh tokens) |
| `User.Read` | Identify signed-in user |

Click **Grant admin consent**.

> ⚠️ Use **Delegated** permissions only — Microsoft To Do blocks app-only (Application) permissions.

### 3 — Create Client Secret

**Certificates & secrets → Client secrets → New client secret** — copy the **Value** immediately.

### 4 — Configure in HA

1. **Settings → Devices & Services → Add Integration → Chore Tracker → Microsoft 365**
2. Enter Client ID, Tenant ID, Client Secret
3. Click **Open Microsoft login** → sign in → grant permissions → tab closes
4. Choose which To Do list to sync

---

## 📱 iPhone Push Notifications

Tasks overdue by 2+ days automatically send a push notification to your iPhone.

**Configure in:** Settings → Devices & Services → Chore Tracker → **Configure**

| Option | Default | Description |
|---|---|---|
| Reminders enabled | Yes | Toggle all reminders on/off |
| Days overdue before reminder | 2 | How many days past due before push fires |
| iPhone notify service | `notify.mobile_app_marcs_iphone_14` | HA notify service for your phone |

To find your iPhone's service name: **Developer Tools → Services → search `notify.mobile_app`**

---

## 📱 NFC Tag Setup (iPhone)

1. Assign an NFC tag in the 📱 NFC tab in the main card
2. Create an automation:

```yaml
alias: "Complete chore via NFC"
trigger:
  - platform: tag
    tag_id: "YOUR_TAG_ID"
action:
  - service: chore_tracker.complete_by_nfc
    data:
      nfc_tag_id: "YOUR_TAG_ID"
      completed_by: "Marc"
```

3. Write tag in HA Companion App → NFC Tags → Write tag

---

## 🔁 Recurrence Reference

| Recurrence | `recurrence` value | Extra fields |
|---|---|---|
| Every day | `daily` | — |
| Every week | `weekly` | — |
| Every Monday | `day_of_week` | `recurrence_day: 0` |
| 3rd Wednesday | `day_of_month_position` | `recurrence_day: 2`, `recurrence_week_position: 3` |
| Last Friday | `day_of_month_position` | `recurrence_day: 4`, `recurrence_week_position: -1` |

Day numbers: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun

---

## 🔧 Services

| Service | Fields |
|---|---|
| `chore_tracker.add_task` | `name`, `category`, `priority`, `due_date`, `recurrence`, `assigned_to` |
| `chore_tracker.complete_task` | `task_id`, `completed_by` |
| `chore_tracker.temp_complete_task` | `task_id`, `completed_by`, `hours` (default 24) |
| `chore_tracker.update_task` | `task_id` + any add_task fields |
| `chore_tracker.delete_task` | `task_id` |
| `chore_tracker.skip_task` | `task_id` |
| `chore_tracker.snooze_task` | `task_id`, `days` |
| `chore_tracker.complete_by_nfc` | `nfc_tag_id`, `completed_by` |
| `chore_tracker.assign_nfc_tag` | `task_id`, `nfc_tag_id` |

---

## 📄 License

MIT
