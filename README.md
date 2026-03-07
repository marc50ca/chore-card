# 🛒 Smart Shopping — Home Assistant Integration

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)

A feature-rich shopping list integration with a custom Lovelace dashboard card.

---

## ✨ Features

- 🏪 **Custom stores** — add any number with emoji or PNG icons and optional GPS geofencing
- 🏷 **Custom categories** — colour-coded, emoji or PNG icons
- 🔢 **Quantities & units** — e.g. 2kg, 1L, 3 pcs
- 🖼 **Item pictures** — image URL or `/local/` PNG per item
- 📋 **Todo backend** — syncs to any HA Todo entity (pick it during setup)
- 📍 **Store popup** — browser GPS triggers a popup when you're near a store
- ⚡ **Full service API** — add/check/remove items via automations

---

## 📦 Installation via HACS (recommended)

1. In HA, go to **HACS → Custom repositories**
2. Add the URL of this repo, category **Integration**
3. Click **Download**
4. Restart Home Assistant
5. Go to **Settings → Devices & Services → Add Integration → Smart Shopping**
6. Select your Todo entity

The Lovelace card JS is served and registered **automatically** — no manual resource configuration needed.

---

## 📦 Manual Installation

### Integration
Copy `custom_components/smart_shopping/` → `config/custom_components/smart_shopping/`

### Card (manual resource)
If you prefer to host the JS yourself:

1. Copy `www/smart-shopping-card/smart-shopping-card.js` → `config/www/smart-shopping-card/`
2. Add resource in **Settings → Dashboards → Resources**:
   - URL: `/local/smart-shopping-card/smart-shopping-card.js`
   - Type: JavaScript Module

When installed via HACS or via `custom_components/`, the card JS is served automatically at `/smart_shopping/smart-shopping-card.js` — skip step 2.

---

## 🎨 Add the Card

```yaml
type: custom:smart-shopping-card
entity_id: sensor.smart_shopping_shopping_list
```

---

## 🗺️ Store Geofencing

**In-card (browser GPS):** Open the card Settings → Stores → Add Store → enter lat/lng/radius.  
**Server-side (HA zones):** Create a zone matching the store coordinates, then use the provided automation templates in `automations/shopping_automations.yaml`.

---

## 🔧 Services

| Service | Key params | Description |
|---|---|---|
| `smart_shopping.add_item` | name, category, quantity, unit, image_url, store, notes | Add item |
| `smart_shopping.remove_item` | name | Remove item |
| `smart_shopping.check_item` | name | Mark purchased |
| `smart_shopping.uncheck_item` | name | Unmark item |
| `smart_shopping.clear_checked` | — | Remove all checked |
| `smart_shopping.add_store` | name, icon, latitude, longitude, radius | Add store |
| `smart_shopping.add_category` | name, icon, color | Add category |
| `smart_shopping.sync_todo` | — | Force sync to Todo |
| `smart_shopping.update_stores` | stores | Replace store list |
| `smart_shopping.update_categories` | categories | Replace category list |
| `smart_shopping.update_items` | items | Replace item list |

---

## 🖼 PNG Icons

Any icon field accepts an emoji **or** an image URL:

- `/local/icons/walmart.png` — file placed at `config/www/icons/walmart.png`
- `https://example.com/logo.png` — any external image

---

## 📄 License

MIT
