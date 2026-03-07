"""Config flow for Smart Shopping integration."""
from __future__ import annotations

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
import homeassistant.helpers.config_validation as cv

from .const import (
    DOMAIN,
    CONF_TODO_ENTITY,
    CONF_STORES,
    CONF_CATEGORIES,
    DEFAULT_CATEGORIES,
    DEFAULT_STORES,
)


async def _get_todo_entities(hass: HomeAssistant) -> list[str]:
    """Get all todo entities."""
    entity_reg = er.async_get(hass)
    return [
        entity.entity_id
        for entity in entity_reg.entities.values()
        if entity.domain == "todo"
    ]


class SmartShoppingConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle config flow for Smart Shopping."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        errors = {}

        todo_entities = await _get_todo_entities(self.hass)

        if not todo_entities:
            errors["base"] = "no_todo_entities"

        if user_input is not None and not errors:
            return self.async_create_entry(
                title="Smart Shopping",
                data={
                    CONF_TODO_ENTITY: user_input[CONF_TODO_ENTITY],
                    CONF_STORES: DEFAULT_STORES,
                    CONF_CATEGORIES: DEFAULT_CATEGORIES,
                },
            )

        schema = vol.Schema(
            {
                vol.Required(CONF_TODO_ENTITY, default=todo_entities[0] if todo_entities else ""): vol.In(todo_entities),
            }
        )

        return self.async_show_form(
            step_id="user",
            data_schema=schema,
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Get the options flow."""
        return SmartShoppingOptionsFlow(config_entry)


class SmartShoppingOptionsFlow(config_entries.OptionsFlow):
    """Handle options flow."""

    def __init__(self, config_entry):
        """Initialize options flow."""
        self.config_entry = config_entry

    async def async_step_init(self, user_input=None):
        """Handle options."""
        errors = {}
        todo_entities = await _get_todo_entities(self.hass)

        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        current_todo = self.config_entry.data.get(CONF_TODO_ENTITY, "")

        schema = vol.Schema(
            {
                vol.Required(CONF_TODO_ENTITY, default=current_todo): vol.In(todo_entities),
            }
        )

        return self.async_show_form(
            step_id="init",
            data_schema=schema,
            errors=errors,
        )
