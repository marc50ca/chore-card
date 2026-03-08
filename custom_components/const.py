"""Constants for the Chore Tracker integration."""

DOMAIN = "chore_tracker"
VERSION = "1.0.0"

# Config flow
CONF_BACKEND = "backend"
CONF_M365_CLIENT_ID = "m365_client_id"
CONF_M365_TENANT_ID = "m365_tenant_id"
CONF_M365_CLIENT_SECRET = "m365_client_secret"
CONF_M365_LIST_ID = "m365_list_id"
CONF_SCAN_INTERVAL = "scan_interval"

# Backends
BACKEND_LOCAL = "local"
BACKEND_M365 = "microsoft365"
BACKENDS = [BACKEND_LOCAL, BACKEND_M365]

# Task priorities
PRIORITY_LOW = "low"
PRIORITY_MEDIUM = "medium"
PRIORITY_HIGH = "high"
PRIORITY_URGENT = "urgent"
PRIORITIES = [PRIORITY_LOW, PRIORITY_MEDIUM, PRIORITY_HIGH, PRIORITY_URGENT]

PRIORITY_LABELS = {
    PRIORITY_LOW: "Low",
    PRIORITY_MEDIUM: "Medium",
    PRIORITY_HIGH: "High",
    PRIORITY_URGENT: "Urgent",
}

PRIORITY_COLORS = {
    PRIORITY_LOW: "#6b7280",
    PRIORITY_MEDIUM: "#3b82f6",
    PRIORITY_HIGH: "#f59e0b",
    PRIORITY_URGENT: "#ef4444",
}

# Task categories
DEFAULT_CATEGORIES = [
    "cleaning",
    "cooking",
    "laundry",
    "shopping",
    "yard",
    "maintenance",
    "pets",
    "childcare",
    "finance",
    "health",
    "other",
]

# Recurrence types
RECURRENCE_NONE = "none"
RECURRENCE_DAILY = "daily"
RECURRENCE_WEEKLY = "weekly"
RECURRENCE_BI_WEEKLY = "bi_weekly"
RECURRENCE_MONTHLY = "monthly"
RECURRENCE_BI_MONTHLY = "bi_monthly"
RECURRENCE_YEARLY = "yearly"
RECURRENCE_DAY_OF_WEEK = "day_of_week"
RECURRENCE_DAY_OF_MONTH_POSITION = "day_of_month_position"

RECURRENCE_TYPES = {
    RECURRENCE_NONE: "No repeat",
    RECURRENCE_DAILY: "Daily",
    RECURRENCE_WEEKLY: "Weekly",
    RECURRENCE_BI_WEEKLY: "Every 2 weeks",
    RECURRENCE_MONTHLY: "Monthly",
    RECURRENCE_BI_MONTHLY: "Every 2 months",
    RECURRENCE_YEARLY: "Yearly",
    RECURRENCE_DAY_OF_WEEK: "Specific day of week",
    RECURRENCE_DAY_OF_MONTH_POSITION: "Position in month (e.g. 3rd Wednesday)",
}

# Days of week
DAYS_OF_WEEK = {
    0: "Monday",
    1: "Tuesday",
    2: "Wednesday",
    3: "Thursday",
    4: "Friday",
    5: "Saturday",
    6: "Sunday",
}

WEEK_POSITIONS = {
    1: "1st",
    2: "2nd",
    3: "3rd",
    4: "4th",
    -1: "Last",
}

# Task status
STATUS_PENDING = "pending"
STATUS_IN_PROGRESS = "in_progress"
STATUS_COMPLETED = "completed"
STATUS_TEMP_COMPLETE = "temp_complete"   # done now, auto-resets after N hours
STATUS_OVERDUE = "overdue"
STATUS_SKIPPED = "skipped"

STATUSES = [STATUS_PENDING, STATUS_IN_PROGRESS, STATUS_COMPLETED, STATUS_TEMP_COMPLETE, STATUS_OVERDUE, STATUS_SKIPPED]

DEFAULT_TEMP_COMPLETE_HOURS = 24   # reset after this many hours if not set per-call

# Storage
STORAGE_KEY = f"{DOMAIN}.tasks"
STORAGE_VERSION = 1

# Services
SERVICE_COMPLETE_TASK = "complete_task"
SERVICE_COMPLETE_BY_NFC = "complete_by_nfc"
SERVICE_TEMP_COMPLETE_TASK = "temp_complete_task"
SERVICE_ADD_TASK = "add_task"
SERVICE_UPDATE_TASK = "update_task"
SERVICE_DELETE_TASK = "delete_task"
SERVICE_SKIP_TASK = "skip_task"
SERVICE_ASSIGN_NFC_TAG = "assign_nfc_tag"
SERVICE_SNOOZE_TASK = "snooze_task"

# Sensor types
SENSOR_TOTAL = "total_tasks"
SENSOR_PENDING = "pending_tasks"
SENSOR_OVERDUE = "overdue_tasks"
SENSOR_DUE_TODAY = "due_today"
SENSOR_COMPLETED_TODAY = "completed_today"
SENSOR_COMPLETED_WEEK = "completed_this_week"

# Coordinator
DEFAULT_SCAN_INTERVAL = 15  # minutes
UPDATE_INTERVAL = "update_interval"

# M365 Graph API
M365_GRAPH_BASE = "https://graph.microsoft.com/v1.0"
M365_SCOPES = ["Tasks.ReadWrite", "User.Read"]
M365_TOKEN_CACHE_KEY = f"{DOMAIN}_m365_token"

# Platforms
PLATFORMS = ["todo", "sensor"]

# NFC
NFC_TAG_KEY = "nfc_tag_id"

# Events
EVENT_TASK_COMPLETED = f"{DOMAIN}_task_completed"
EVENT_TASK_OVERDUE = f"{DOMAIN}_task_overdue"
EVENT_TASK_DUE_SOON = f"{DOMAIN}_task_due_soon"
