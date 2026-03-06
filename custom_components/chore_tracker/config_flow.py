"""Config flow for Chore Tracker."""
from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult

from .const import (
    BACKEND_LOCAL,
    BACKEND_M365,
    BACKENDS,
    CONF_BACKEND,
    CONF_M365_CLIENT_ID,
    CONF_M365_CLIENT_SECRET,
    CONF_M365_LIST_ID,
    CONF_M365_TENANT_ID,
    CONF_SCAN_INTERVAL,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)

STEP_USER_SCHEMA = vol.Schema({
    vol.Required(CONF_BACKEND, default=BACKEND_LOCAL): vol.In(BACKENDS),
})

STEP_M365_SCHEMA = vol.Schema({
    vol.Required(CONF_M365_CLIENT_ID): str,
    vol.Required(CONF_M365_TENANT_ID): str,
    vol.Required(CONF_M365_CLIENT_SECRET): str,
    vol.Optional(CONF_M365_LIST_ID): str,
})


class ChoreTrackerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle config flow for Chore Tracker."""

    VERSION = 1

    def __init__(self) -> None:
        """Initialize."""
        self._data: dict[str, Any] = {}

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle initial step."""
        if user_input is not None:
            self._data.update(user_input)
            if user_input[CONF_BACKEND] == BACKEND_M365:
                return await self.async_step_m365()
            return self.async_create_entry(title="Chore Tracker", data=self._data)

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_SCHEMA,
            description_placeholders={
                "local_desc": "Store tasks locally in Home Assistant",
                "m365_desc": "Sync with Microsoft 365 To Do",
            },
        )

    async def async_step_m365(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle M365 configuration step."""
        errors: dict[str, str] = {}

        if user_input is not None:
            self._data.update(user_input)
            # Skip live validation here to avoid startup network issues.
            # Connection errors will surface when the coordinator first syncs.
            if not user_input.get(CONF_M365_LIST_ID):
                # If user didn't provide a list ID, ask them to enter it manually.
                # (Live list fetching is optional — they can always enter it directly.)
                return self.async_create_entry(
                    title="Chore Tracker (M365)",
                    data=self._data,
                )
            return self.async_create_entry(
                title="Chore Tracker (M365)", data=self._data
            )

        return self.async_show_form(
            step_id="m365",
            data_schema=STEP_M365_SCHEMA,
            errors=errors,
        )

    async def async_step_m365_list(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Let user pick which M365 To Do list to sync."""
        errors: dict[str, str] = {}

        if user_input is not None:
            self._data[CONF_M365_LIST_ID] = user_input[CONF_M365_LIST_ID]
            return self.async_create_entry(title="Chore Tracker (M365)", data=self._data)

        # Fetch lists
        try:
            import aiohttp

            token_url = (
                f"https://login.microsoftonline.com/"
                f"{self._data[CONF_M365_TENANT_ID]}/oauth2/v2.0/token"
            )
            token = None
            async with aiohttp.ClientSession() as session:
                async with session.post(token_url, data={
                    "grant_type": "client_credentials",
                    "client_id": self._data[CONF_M365_CLIENT_ID],
                    "client_secret": self._data[CONF_M365_CLIENT_SECRET],
                    "scope": "https://graph.microsoft.com/.default",
                }) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        token = data.get("access_token")

            lists = {}
            if token:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        "https://graph.microsoft.com/v1.0/me/todo/lists",
                        headers={"Authorization": f"Bearer {token}"},
                    ) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            for lst in data.get("value", []):
                                lists[lst["id"]] = lst["displayName"]

            if not lists:
                lists = {"tasks": "Tasks (default)"}

        except Exception as err:
            _LOGGER.exception("Failed to fetch M365 lists: %s", err)
            lists = {"tasks": "Tasks (default)"}

        schema = vol.Schema({
            vol.Required(CONF_M365_LIST_ID): vol.In(lists),
        })

        return self.async_show_form(
            step_id="m365_list",
            data_schema=schema,
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Return options flow."""
        return ChoreTrackerOptionsFlow(config_entry)


class ChoreTrackerOptionsFlow(config_entries.OptionsFlow):
    """Handle options flow."""

    def __init__(self, config_entry) -> None:
        """Initialize."""
        self.config_entry = config_entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle options."""
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        current_backend = self.config_entry.data.get(CONF_BACKEND, BACKEND_LOCAL)

        schema = vol.Schema({
            vol.Required(
                CONF_SCAN_INTERVAL,
                default=self.config_entry.options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
            ): vol.All(vol.Coerce(int), vol.Range(min=1, max=1440)),
            vol.Optional(
                CONF_BACKEND,
                default=current_backend,
            ): vol.In(BACKENDS),
        })

        return self.async_show_form(step_id="init", data_schema=schema)
