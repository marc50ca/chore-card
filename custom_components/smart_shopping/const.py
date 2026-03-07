"""Constants for Smart Shopping integration."""

DOMAIN = "smart_shopping"
PLATFORMS = ["sensor"]

# Config keys
CONF_TODO_ENTITY = "todo_entity"
CONF_STORES = "stores"
CONF_CATEGORIES = "categories"
CONF_ITEMS = "items"

# Store keys
STORE_NAME = "name"
STORE_LATITUDE = "latitude"
STORE_LONGITUDE = "longitude"
STORE_RADIUS = "radius"
STORE_ICON = "icon"

# Category keys
CAT_NAME = "name"
CAT_ICON = "icon"
CAT_COLOR = "color"

# Item keys
ITEM_NAME = "name"
ITEM_CATEGORY = "category"
ITEM_QUANTITY = "quantity"
ITEM_UNIT = "unit"
ITEM_IMAGE_URL = "image_url"
ITEM_CHECKED = "checked"
ITEM_STORE = "store"
ITEM_NOTES = "notes"

# Events
EVENT_NEAR_STORE = f"{DOMAIN}_near_store"
EVENT_LIST_UPDATED = f"{DOMAIN}_list_updated"

# Services
SERVICE_ADD_ITEM = "add_item"
SERVICE_REMOVE_ITEM = "remove_item"
SERVICE_CHECK_ITEM = "check_item"
SERVICE_UNCHECK_ITEM = "uncheck_item"
SERVICE_CLEAR_CHECKED = "clear_checked"
SERVICE_ADD_STORE = "add_store"
SERVICE_ADD_CATEGORY = "add_category"
SERVICE_SYNC_TODO = "sync_todo"
SERVICE_UPDATE_STORES = "update_stores"
SERVICE_UPDATE_CATEGORIES = "update_categories"
SERVICE_UPDATE_ITEMS = "update_items"

# Default categories
DEFAULT_CATEGORIES = [
    {"name": "Produce", "icon": "mdi:fruit-grapes", "color": "#4CAF50"},
    {"name": "Dairy", "icon": "mdi:cow", "color": "#2196F3"},
    {"name": "Meat", "icon": "mdi:food-steak", "color": "#F44336"},
    {"name": "Bakery", "icon": "mdi:bread-slice", "color": "#FF9800"},
    {"name": "Frozen", "icon": "mdi:snowflake", "color": "#00BCD4"},
    {"name": "Beverages", "icon": "mdi:bottle-soda", "color": "#9C27B0"},
    {"name": "Snacks", "icon": "mdi:popcorn", "color": "#FFEB3B"},
    {"name": "Household", "icon": "mdi:home", "color": "#607D8B"},
    {"name": "Personal Care", "icon": "mdi:lotion", "color": "#E91E63"},
    {"name": "Other", "icon": "mdi:dots-horizontal", "color": "#9E9E9E"},
]

# Default stores
DEFAULT_STORES = [
    {"name": "Grocery Store", "icon": "mdi:store", "latitude": None, "longitude": None, "radius": 100},
]
