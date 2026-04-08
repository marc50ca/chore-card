"""Chore Tracker Integration for Home Assistant."""
from __future__ import annotations

import logging
import pathlib
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
    SERVICE_TEMP_COMPLETE_TASK,
    SERVICE_UPDATE_TASK,
)
from .coordinator import ChoreTrackerCoordinator

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = vol.Schema({DOMAIN: vol.Schema({})}, extra=vol.ALLOW_EXTRA)

# JS files live in  custom_components/chore_tracker/frontend/
# and are served at /chore_tracker/frontend/<filename>
_FRONTEND_DIR  = pathlib.Path(__file__).parent / "frontend"
_FRONTEND_URL  = f"/{DOMAIN}/frontend"
_CARD_FILES    = [
    "chore-tracker-card.js",
    "chore-tracker-summary-card.js",
]

# Class-level flag so we only register once per HA process lifetime
_frontend_registered: bool = False


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    hass.data.setdefault(DOMAIN, {})
    hass.async_create_task(_async_register_frontend(hass))
    return True


async def _async_register_frontend(hass: HomeAssistant) -> None:
    """Register static path + Lovelace resources (idempotent)."""
    global _frontend_registered
    if _frontend_registered:
        return
    _frontend_registered = True

    # Serve the frontend/ directory over HTTP.
    # HA exposes async_register_static_paths (async, takes a list of StaticPathConfig).
    try:
        from homeassistant.components.http import StaticPathConfig
        await hass.http.async_register_static_paths([
            StaticPathConfig(_FRONTEND_URL, str(_FRONTEND_DIR), cache_headers=False)
        ])
        _LOGGER.debug("Chore Tracker: serving frontend at %s", _FRONTEND_URL)
    except Exception as err:
        _LOGGER.error(
            "Chore Tracker: could not register static path — "
            "add resources manually in Settings → Dashboards → Resources. Error: %s", err
        )
        return

    # 2. Auto-register each JS file as a Lovelace resource so users don't need
    #    to add them manually in Settings → Dashboards → Resources.
    #    We use lovelace.resources storage directly to avoid the UI dependency.
    async def _register_resources() -> None:
        try:
            from homeassistant.components.lovelace import resources as ll_resources
            res_store = ll_resources.ResourceStorageCollection(hass)
            await res_store.async_load()
            existing_urls = {r["url"] for r in res_store.async_items()}

            for fname in _CARD_FILES:
                url = f"{_FRONTEND_URL}/{fname}"
                if url not in existing_urls:
                    await res_store.async_create_item({
                        "res_type": "module",
                        "url":       url,
                    })
                    _LOGGER.info("Chore Tracker: auto-registered Lovelace resource %s", url)
                else:
                    _LOGGER.debug("Chore Tracker: resource already registered: %s", url)
        except Exception as err:
            # Non-fatal — user can add manually if auto-registration fails
            _LOGGER.warning(
                "Chore Tracker: could not auto-register Lovelace resources "
                "(you may need to add them manually): %s", err
            )

    hass.async_create_task(_register_resources())


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    # Ensure frontend is registered even if async_setup wasn't called
    hass.async_create_task(_async_register_frontend(hass))

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

    async def handle_temp_complete_task(call: ServiceCall) -> None:
        await coordinator.async_temp_complete_task(
            call.data["task_id"],
            call.data.get("completed_by"),
            hours=call.data.get("hours", 24),
        )

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

    hass.services.async_register(DOMAIN, SERVICE_TEMP_COMPLETE_TASK, handle_temp_complete_task,
        schema=vol.Schema({
            vol.Required("task_id"):          cv.string,
            vol.Optional("completed_by"):     cv.string,
            vol.Optional("hours", default=24): vol.All(vol.Coerce(int), vol.Range(min=1, max=168)),
        }))

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
