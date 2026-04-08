"""Sensor platform for Chore Tracker."""
from __future__ import annotations
import logging

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, VERSION, CARD_VERSION, SUMMARY_CARD_VERSION
from .coordinator import ChoreTrackerCoordinator

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: ChoreTrackerCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([
        ChoreTrackerStatSensor(coordinator, entry, "total_tasks",     "Chore Tracker Total Tasks",     "mdi:format-list-checks"),
        ChoreTrackerStatSensor(coordinator, entry, "pending_tasks",   "Chore Tracker Pending Tasks",   "mdi:clock-outline"),
        ChoreTrackerStatSensor(coordinator, entry, "overdue_tasks",   "Chore Tracker Overdue Tasks",   "mdi:alert-circle"),
        ChoreTrackerStatSensor(coordinator, entry, "due_today",       "Chore Tracker Due Today",       "mdi:calendar-today"),
        ChoreTrackerStatSensor(coordinator, entry, "completed_today", "Chore Tracker Completed Today", "mdi:check-circle"),
        # ── Data bridge sensor ────────────────────────────────────────────────
        # This sensor's attributes hold ALL task data so the Lovelace card
        # can read them.  The entity_id is always: sensor.chore_tracker_data
        ChoreTrackerDataSensor(coordinator, entry),
    ])


class ChoreTrackerStatSensor(CoordinatorEntity, SensorEntity):
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator, entry, stat_key, name, icon):
        super().__init__(coordinator)
        self._stat_key = stat_key
        self._attr_name = name
        self._attr_icon = icon
        # Unique ID drives entity_id generation: sensor.chore_tracker_<stat_key>
        self._attr_unique_id = f"chore_tracker_{stat_key}"

    @property
    def native_value(self) -> int:
        if not self.coordinator.data:
            return 0
        return self.coordinator.data.get("stats", {}).get(self._stat_key, 0)

    @property
    def extra_state_attributes(self) -> dict:
        if not self.coordinator.data:
            return {}
        return {
            "categories": self.coordinator.data.get("categories", []),
            "backend": self.coordinator.backend,
        }


class ChoreTrackerDataSensor(CoordinatorEntity, SensorEntity):
    """
    Exposes all task data as entity attributes so the Lovelace card can read it.
    Entity ID is always:  sensor.chore_tracker_data
    """
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_icon = "mdi:clipboard-list"
    # Fixed name → fixed entity_id: sensor.chore_tracker_data
    _attr_name = "Chore Tracker Data"
    _attr_unique_id = "chore_tracker_data"

    def __init__(self, coordinator: ChoreTrackerCoordinator, entry: ConfigEntry):
        super().__init__(coordinator)

    @property
    def native_value(self) -> int:
        if not self.coordinator.data:
            return 0
        return len(self.coordinator.data.get("tasks", {}))

    @property
    def extra_state_attributes(self) -> dict:
        if not self.coordinator.data:
            return {"tasks": {}, "categories": [], "stats": {}}

        tasks = self.coordinator.data.get("tasks", {})
        cats  = self.coordinator.data.get("categories", [])
        stats = self.coordinator.data.get("stats", {})

        serialized = {}
        for tid, task in tasks.items():
            t = dict(task)
            for key in ("due_date", "created_at", "completed_at", "snoozed_until"):
                if key in t and t[key] is not None:
                    t[key] = str(t[key])
            serialized[tid] = t

        return {
            "tasks":                serialized,
            "categories":           cats,
            "stats":                stats,
            "integration_version":  VERSION,
            "card_version":         CARD_VERSION,
            "summary_card_version": SUMMARY_CARD_VERSION,
        }
