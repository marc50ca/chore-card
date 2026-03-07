# Smart Shopping

A feature-rich shopping list integration for Home Assistant with a beautiful Lovelace dashboard card.

## Features

- 🏪 **Custom stores** — with optional GPS geofencing
- 🏷 **Custom categories** — colour-coded with emoji or PNG icons
- 🔢 **Quantities & units** — track exact amounts
- 🖼 **Item images** — URL or `/local/` PNG per item
- 📋 **Todo backend** — syncs to any HA Todo entity
- 📍 **Popup alerts** — triggered when you're near a store
- ⚡ **HA services** — full automation API

## Installation

See [README.md](README.md) for full installation instructions.

## Card Configuration

```yaml
type: custom:smart-shopping-card
entity_id: sensor.smart_shopping_shopping_list
```
