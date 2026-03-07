"""Sensor platform for Smart Shopping."""
from __future__ import annotations

import logging

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Smart Shopping sensors."""
    coordinator = hass.data[DOMAIN][entry.entry_id]

    sensors = [
        SmartShoppingCountSensor(coordinator, entry),
        SmartShoppingListSensor(coordinator, entry),
    ]

    async_add_entities(sensors)


class SmartShoppingCountSensor(SensorEntity):
    """Sensor showing number of unchecked shopping items."""

    _attr_icon = "mdi:cart"
    _attr_has_entity_name = True

    def __init__(self, coordinator, entry: ConfigEntry) -> None:
        self._coordinator = coordinator
        self._entry = entry
        self._attr_unique_id = f"{entry.entry_id}_count"
        self._attr_name = "Items Remaining"
        coordinator.add_listener(self._handle_coordinator_update)

    @callback
    def _handle_coordinator_update(self) -> None:
        self.async_write_ha_state()

    @property
    def native_value(self):
        return self._coordinator.unchecked_count

    @property
    def extra_state_attributes(self):
        return {
            "total_items": self._coordinator.total_count,
            "unchecked_items": self._coordinator.unchecked_count,
            "todo_entity": self._coordinator.todo_entity,
        }

    @property
    def device_info(self):
        return {
            "identifiers": {(DOMAIN, self._entry.entry_id)},
            "name": "Smart Shopping",
            "manufacturer": "Smart Shopping",
            "model": "Shopping Manager",
        }


class SmartShoppingListSensor(SensorEntity):
    """Sensor exposing the full shopping list state."""

    _attr_icon = "mdi:format-list-checks"
    _attr_has_entity_name = True

    def __init__(self, coordinator, entry: ConfigEntry) -> None:
        self._coordinator = coordinator
        self._entry = entry
        self._attr_unique_id = f"{entry.entry_id}_list"
        self._attr_name = "Shopping List"
        coordinator.add_listener(self._handle_coordinator_update)

    @callback
    def _handle_coordinator_update(self) -> None:
        self.async_write_ha_state()

    @property
    def native_value(self):
        unchecked = self._coordinator.unchecked_count
        total = self._coordinator.total_count
        return f"{unchecked}/{total} items"

    @property
    def extra_state_attributes(self):
        return self._coordinator.get_state_data()

    @property
    def device_info(self):
        return {
            "identifiers": {(DOMAIN, self._entry.entry_id)},
            "name": "Smart Shopping",
            "manufacturer": "Smart Shopping",
            "model": "Shopping Manager",
        }
