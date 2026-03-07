# 🗂️ Chore Tracker for Home Assistant

A full-featured HACS integration and Lovelace dashboard card for tracking household chores and tasks — with Microsoft 365 sync, iPhone NFC tag support, recurrence scheduling, and per-user assignment.

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)

---

## ✨ Features

- **Dual backend**: Store tasks locally in HA or sync with **Microsoft 365 To Do**
- **NFC tag support**: Complete tasks by tapping an NFC tag with your iPhone
- **Flexible recurrence**: Daily, Weekly, Bi-weekly, Monthly, Bi-monthly, Yearly, every specific weekday, Nth weekday of month (e.g. 3rd Wednesday, last Friday)
- **Priority levels**: Low, Medium, High, Urgent
- **Categories**: Cleaning, Cooking, Laundry, Shopping, Yard, Maintenance, Pets, Childcare, Finance, Health, custom
- **Assignment**: Assign tasks to existing Home Assistant users
- **Beautiful Lovelace card** with real-time WebSocket updates, filtering, search, sort
- **Sensor entities**: Overdue, Due Today, Pending, Completed Today stats
- **HA Todo integration**: Native To-do list platform support
- **Automation events**: Fire events on completion, overdue, and due-soon

---

## 📦 Installation via HACS

1. Open **HACS** in your Home Assistant
2. Go to **Integrations** → ⋮ menu → **Custom repositories**
3. Add `https://github.com/your-repo/chore-tracker-ha` with category **Integration**
4. Install and restart Home Assistant

### Lovelace Card

Copy `www/chore-tracker-card/chore-tracker-card.js` to `config/www/chore-tracker-card/` then add the resource:

**Settings → Dashboards → ⋮ → Resources → Add resource:**
```
/local/chore-tracker-card/chore-tracker-card.js
```
Type: **JavaScript module**

Add the card to your dashboard:
```yaml
type: custom:chore-tracker-card
title: Chore Tracker
show_stats: true
show_header: true
```

---

## ⚙️ Configuration

### Local Storage (default)

1. **Settings → Devices & Services → Add Integration**
2. Search **Chore Tracker** → select **Local** → Done

---

## 🔷 Microsoft 365 Setup

Microsoft To Do requires **delegated** (user-based) OAuth — not application/client credentials. This means you must complete a one-time browser login to authorise the integration.

### Step 1 — Create an Azure App Registration

1. Go to [portal.azure.com](https://portal.azure.com) and sign in with your Microsoft 365 account
2. Navigate to **Azure Active Directory → App registrations → New registration**
3. Fill in:
   - **Name**: `Home Assistant Chore Tracker` (or anything)
   - **Supported account types**: *Accounts in this organizational directory only* (single tenant) — or *Personal Microsoft accounts only* if you use Outlook.com/Hotmail
   - **Redirect URI**: Select **Web** and enter:
     ```
     https://YOUR-HA-URL/auth/external_callback
     ```
     Replace `YOUR-HA-URL` with your Home Assistant external URL (e.g. `https://homeassistant.local:8123`)
4. Click **Register**
5. Copy the **Application (client) ID** — you'll need this
6. Copy the **Directory (tenant) ID** — you'll need this

### Step 2 — Add API Permissions (Delegated only)

1. In your App Registration, go to **API permissions → Add a permission → Microsoft Graph**
2. Select **Delegated permissions** (NOT Application permissions)
3. Add these permissions:
   - `Tasks.ReadWrite` — read and write Microsoft To Do tasks
   - `offline_access` — required for refresh tokens so you don't need to re-login
   - `User.Read` — read user profile (needed to identify the signed-in user)
4. Click **Add permissions**
5. Click **Grant admin consent** (if you are a tenant admin) — or have your admin do this

> ⚠️ **Important**: Do NOT use "Application permissions" — Microsoft To Do does not support app-only access for personal task lists. You must use Delegated permissions with a signed-in user.

### Step 3 — Create a Client Secret

1. In your App Registration, go to **Certificates & secrets → Client secrets → New client secret**
2. Set a description and expiry (24 months recommended)
3. Copy the **Value** immediately — it will be hidden after you leave the page

### Step 4 — Configure in Home Assistant

1. **Settings → Devices & Services → Add Integration → Chore Tracker**
2. Select **Microsoft 365** as the backend
3. Enter:
   - **Client ID**: from Step 1
   - **Tenant ID**: from Step 1
   - **Client Secret**: from Step 3
4. You will be redirected to Microsoft's login page — sign in with your Microsoft 365 account
5. Grant the requested permissions
6. You will be redirected back to HA
7. Select which **To Do list** to sync

### Required Azure Permissions Summary

| Permission | Type | Why |
|---|---|---|
| `Tasks.ReadWrite` | Delegated | Create, read, update, delete To Do tasks |
| `offline_access` | Delegated | Refresh tokens (stay logged in) |
| `User.Read` | Delegated | Identify the signed-in user |

### Sync Behaviour

- Tasks created in HA card → pushed to Microsoft To Do
- Tasks created in Microsoft To Do (or Outlook, Teams) → appear in HA card
- Completing a task in either place syncs to the other
- Sync runs every 15 minutes (configurable in Options)

---

## 📱 NFC Tag Setup (iPhone)

### Prerequisites
- iPhone 7 or later
- [Home Assistant Companion App](https://apps.apple.com/app/home-assistant/id1099568401)

### Steps

1. **Assign a tag to a task** using the 📱 NFC tab in the dashboard card
2. **Create an automation** in HA:

```yaml
alias: "Complete task via NFC"
trigger:
  - platform: tag
    tag_id: "YOUR_NFC_TAG_ID"
action:
  - service: chore_tracker.complete_by_nfc
    data:
      nfc_tag_id: "YOUR_NFC_TAG_ID"
      completed_by: "{{ trigger.device_id }}"
```

3. **Write the tag** in HA Companion App → **☰ → NFC Tags → Write tag**
4. **Tap to complete** — the task is marked done and the next recurrence is scheduled

---

## 🃏 Dashboard Card

```yaml
type: custom:chore-tracker-card
title: Household Chores   # optional, default: "Chore Tracker"
show_header: true          # optional, default: true
show_stats: true           # optional, default: true
```

---

## 🔁 Recurrence Examples

| What you want | `recurrence` | Extra fields |
|---|---|---|
| Every day | `daily` | — |
| Every Monday | `day_of_week` | `recurrence_day: 0` |
| Every Friday | `day_of_week` | `recurrence_day: 4` |
| 3rd Wednesday | `day_of_month_position` | `recurrence_day: 2`, `recurrence_week_position: 3` |
| Last Friday | `day_of_month_position` | `recurrence_day: 4`, `recurrence_week_position: -1` |
| Every 2 weeks | `bi_weekly` | — |
| Monthly | `monthly` | — |

Day numbers: **0=Monday, 1=Tuesday, 2=Wednesday, 3=Thursday, 4=Friday, 5=Saturday, 6=Sunday**

---

## 🔧 Services

| Service | Key fields |
|---|---|
| `chore_tracker.add_task` | `name`, `category`, `priority`, `due_date`, `recurrence`, `assigned_to` |
| `chore_tracker.update_task` | `task_id` + any fields above |
| `chore_tracker.complete_task` | `task_id`, optional `completed_by` |
| `chore_tracker.complete_by_nfc` | `nfc_tag_id`, optional `completed_by` |
| `chore_tracker.delete_task` | `task_id` |
| `chore_tracker.skip_task` | `task_id` |
| `chore_tracker.snooze_task` | `task_id`, `days` (1–365) |
| `chore_tracker.assign_nfc_tag` | `task_id`, `nfc_tag_id` |

---

## 📡 Automation Events

| Event | Payload |
|---|---|
| `chore_tracker_task_completed` | `task_id`, `name`, `completed_by` |
| `chore_tracker_task_overdue` | `task_id`, `name` |
| `chore_tracker_task_due_soon` | `task_id`, `name`, `due_date` |

---

## 📄 License

MIT License
