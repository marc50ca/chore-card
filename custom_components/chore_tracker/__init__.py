"""Chore Tracker Integration for Home Assistant."""
from __future__ import annotations

import logging
from datetime import date, timedelta

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import (
    DOMAIN,
    PLATFORMS,
    PRIORITY_MEDIUM,
    RECURRENCE_NONE,
    SERVICE_ADD_TASK,
    SERVICE_ASSIGN_NFC_TAG,
    SERVICE_COMPLETE_BY_NFC,
    SERVICE_COMPLETE_TASK,
    SERVICE_DELETE_TASK,
    SERVICE_SKIP_TASK,
    SERVICE_SNOOZE_TASK,
    SERVICE_UPDATE_TASK,
)
from .coordinator import ChoreTrackerCoordinator

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = vol.Schema({DOMAIN: vol.Schema({})}, extra=vol.ALLOW_EXTRA)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    coordinator = ChoreTrackerCoordinator(hass, entry)
    await coordinator.async_setup()
    await coordinator.async_config_entry_first_refresh()

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    _register_services(hass, coordinator)

    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


def _register_services(hass: HomeAssistant, coordinator: ChoreTrackerCoordinator) -> None:

    async def handle_complete_task(call: ServiceCall) -> None:
        await coordinator.async_complete_task(call.data["task_id"], call.data.get("completed_by"))

    async def handle_complete_by_nfc(call: ServiceCall) -> None:
        await coordinator.async_complete_by_nfc(call.data["nfc_tag_id"], call.data.get("completed_by"))

    async def handle_add_task(call: ServiceCall) -> None:
        await coordinator.async_add_task(dict(call.data))

    async def handle_update_task(call: ServiceCall) -> None:
        task_id = call.data["task_id"]
        data = {k: v for k, v in call.data.items() if k != "task_id"}
        await coordinator.async_update_task(task_id, data)

    async def handle_delete_task(call: ServiceCall) -> None:
        await coordinator.async_delete_task(call.data["task_id"])

    async def handle_skip_task(call: ServiceCall) -> None:
        await coordinator.async_skip_task(call.data["task_id"])

    async def handle_assign_nfc(call: ServiceCall) -> None:
        await coordinator.async_assign_nfc_tag(call.data["task_id"], call.data["nfc_tag_id"])

    async def handle_snooze(call: ServiceCall) -> None:
        until = date.today() + timedelta(days=call.data.get("days", 1))
        await coordinator.async_snooze_task(call.data["task_id"], until)

    hass.services.async_register(DOMAIN, SERVICE_COMPLETE_TASK, handle_complete_task,
        schema=vol.Schema({vol.Required("task_id"): cv.string, vol.Optional("completed_by"): cv.string}))

    hass.services.async_register(DOMAIN, SERVICE_COMPLETE_BY_NFC, handle_complete_by_nfc,
        schema=vol.Schema({vol.Required("nfc_tag_id"): cv.string, vol.Optional("completed_by"): cv.string}))

    hass.services.async_register(DOMAIN, SERVICE_ADD_TASK, handle_add_task,
        schema=vol.Schema({
            vol.Required("name"): cv.string,
            vol.Optional("description"): cv.string,
            vol.Optional("category"): cv.string,
            vol.Optional("priority", default=PRIORITY_MEDIUM): vol.In(["low","medium","high","urgent"]),
            vol.Optional("due_date"): cv.string,
            vol.Optional("recurrence", default=RECURRENCE_NONE): cv.string,
            vol.Optional("recurrence_day"): vol.Coerce(int),
            vol.Optional("recurrence_week_position"): vol.Coerce(int),
            vol.Optional("assigned_to"): vol.All(cv.ensure_list, [cv.string]),
            vol.Optional("nfc_tag_id"): cv.string,
            vol.Optional("notes"): cv.string,
        }))

    hass.services.async_register(DOMAIN, SERVICE_UPDATE_TASK, handle_update_task,
        schema=vol.Schema({
            vol.Required("task_id"): cv.string,
            vol.Optional("name"): cv.string,
            vol.Optional("description"): cv.string,
            vol.Optional("category"): cv.string,
            vol.Optional("priority"): vol.In(["low","medium","high","urgent"]),
            vol.Optional("due_date"): cv.string,
            vol.Optional("recurrence"): cv.string,
            vol.Optional("recurrence_day"): vol.Coerce(int),
            vol.Optional("recurrence_week_position"): vol.Coerce(int),
            vol.Optional("assigned_to"): vol.All(cv.ensure_list, [cv.string]),
            vol.Optional("status"): cv.string,
            vol.Optional("notes"): cv.string,
            vol.Optional("nfc_tag_id"): cv.string,
        }))

    hass.services.async_register(DOMAIN, SERVICE_DELETE_TASK, handle_delete_task,
        schema=vol.Schema({vol.Required("task_id"): cv.string}))

    hass.services.async_register(DOMAIN, SERVICE_SKIP_TASK, handle_skip_task,
        schema=vol.Schema({vol.Required("task_id"): cv.string}))

    hass.services.async_register(DOMAIN, SERVICE_ASSIGN_NFC_TAG, handle_assign_nfc,
        schema=vol.Schema({vol.Required("task_id"): cv.string, vol.Required("nfc_tag_id"): cv.string}))

    hass.services.async_register(DOMAIN, SERVICE_SNOOZE_TASK, handle_snooze,
        schema=vol.Schema({
            vol.Required("task_id"): cv.string,
            vol.Optional("days", default=1): vol.All(vol.Coerce(int), vol.Range(min=1, max=365)),
        }))
