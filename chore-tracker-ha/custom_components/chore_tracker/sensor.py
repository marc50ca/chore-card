"""Sensor platform for Chore Tracker."""
from __future__ import annotations
import json
import logging

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import ChoreTrackerCoordinator

_LOGGER = logging.getLogger(__name__)

STAT_SENSORS = [
    ("total_tasks",      "Total Tasks",     "mdi:format-list-checks"),
    ("pending_tasks",    "Pending Tasks",   "mdi:clock-outline"),
    ("overdue_tasks",    "Overdue Tasks",   "mdi:alert-circle"),
    ("due_today",        "Due Today",       "mdi:calendar-today"),
    ("completed_today",  "Completed Today", "mdi:check-circle"),
]


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: ChoreTrackerCoordinator = hass.data[DOMAIN][entry.entry_id]
    entities: list[SensorEntity] = [
        ChoreTrackerStatSensor(coordinator, entry, key, name, icon)
        for key, name, icon in STAT_SENSORS
    ]
    # The data sensor — exposes all tasks so the Lovelace card can read them
    entities.append(ChoreTrackerDataSensor(coordinator, entry))
    async_add_entities(entities)


class ChoreTrackerStatSensor(CoordinatorEntity, SensorEntity):
    """Numeric stat sensor (counts)."""
    _attr_has_entity_name = True
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator, entry, stat_key, name, icon):
        super().__init__(coordinator)
        self._stat_key = stat_key
        self._attr_name = name
        self._attr_icon = icon
        self._attr_unique_id = f"{entry.entry_id}_{stat_key}"

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
    Data bridge sensor — the Lovelace card reads task data from this entity's
    state attributes.  State value is the total task count for convenience.

    Entity ID will be:  sensor.chore_tracker_tasks
    """
    _attr_has_entity_name = True
    _attr_icon = "mdi:clipboard-list"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator: ChoreTrackerCoordinator, entry: ConfigEntry):
        super().__init__(coordinator)
        self._entry = entry
        self._attr_name = "Tasks"
        self._attr_unique_id = f"{entry.entry_id}_tasks_data"

    @property
    def native_value(self) -> int:
        if not self.coordinator.data:
            return 0
        return len(self.coordinator.data.get("tasks", {}))

    @property
    def extra_state_attributes(self) -> dict:
        if not self.coordinator.data:
            return {"tasks": {}, "categories": []}

        tasks = self.coordinator.data.get("tasks", {})
        cats  = self.coordinator.data.get("categories", [])

        # Serialize date objects to strings so HA can store them as attributes
        serialized = {}
        for tid, task in tasks.items():
            t = dict(task)
            for key in ("due_date", "created_at", "completed_at", "snoozed_until"):
                if key in t and t[key] is not None:
                    t[key] = str(t[key])
            serialized[tid] = t

        return {
            "tasks": serialized,
            "categories": cats,
            "backend": self.coordinator.backend,
        }
