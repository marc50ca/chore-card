"""Todo platform for Chore Tracker."""
from __future__ import annotations

import logging
from datetime import date
from typing import Any

_LOGGER = logging.getLogger(__name__)

try:
    from homeassistant.components.todo import (
        TodoItem,
        TodoItemStatus,
        TodoListEntity,
        TodoListEntityFeature,
    )
    _TODO_AVAILABLE = True
except ImportError:
    _TODO_AVAILABLE = False
    _LOGGER.warning(
        "homeassistant.components.todo not available. Upgrade to HA 2023.11+ for Todo support."
    )

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, STATUS_COMPLETED
from .coordinator import ChoreTrackerCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Chore Tracker todo entities."""
    if not _TODO_AVAILABLE:
        _LOGGER.info("Skipping Todo platform — requires HA 2023.11+")
        return
    coordinator: ChoreTrackerCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([ChoreTrackerTodoList(coordinator, entry)])


class ChoreTrackerTodoList(CoordinatorEntity):
    """Chore Tracker todo list. Inherits TodoListEntity only when available."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: ChoreTrackerCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator)
        self._entry = entry
        self._attr_unique_id = f"{entry.entry_id}_todo_list"
        self._attr_name = "Chore Tracker"

    @property
    def todo_items(self):
        if not self.coordinator.data:
            return []
        items = []
        for task in self.coordinator.data.get("tasks", {}).values():
            due = task.get("due_date")
            if due and isinstance(due, str):
                try:
                    due = date.fromisoformat(due)
                except ValueError:
                    due = None
            if _TODO_AVAILABLE:
                status = (
                    TodoItemStatus.COMPLETED
                    if task.get("status") == STATUS_COMPLETED
                    else TodoItemStatus.NEEDS_ACTION
                )
                items.append(TodoItem(
                    uid=task["id"],
                    summary=task["name"],
                    status=status,
                    due=due,
                    description=task.get("description", ""),
                ))
        return items

    async def async_create_todo_item(self, item) -> None:
        await self.coordinator.async_add_task({
            "name": item.summary,
            "description": item.description or "",
            "due_date": str(item.due) if item.due else None,
        })

    async def async_update_todo_item(self, item) -> None:
        updates: dict[str, Any] = {}
        if item.summary is not None:
            updates["name"] = item.summary
        if item.description is not None:
            updates["description"] = item.description
        if item.due is not None:
            updates["due_date"] = str(item.due)
        if _TODO_AVAILABLE and item.status == TodoItemStatus.COMPLETED:
            await self.coordinator.async_complete_task(item.uid)
            return
        if updates:
            await self.coordinator.async_update_task(item.uid, updates)

    async def async_delete_todo_items(self, uids: list[str]) -> None:
        for uid in uids:
            await self.coordinator.async_delete_task(uid)

    async def async_move_todo_item(self, uid: str, previous_uid: str | None = None) -> None:
        pass


# Dynamically add TodoListEntity as parent if available so HA registers it correctly
if _TODO_AVAILABLE:
    ChoreTrackerTodoList.__bases__ = (CoordinatorEntity, TodoListEntity)
    ChoreTrackerTodoList._attr_supported_features = (
        TodoListEntityFeature.CREATE_TODO_ITEM
        | TodoListEntityFeature.UPDATE_TODO_ITEM
        | TodoListEntityFeature.DELETE_TODO_ITEM
        | TodoListEntityFeature.MOVE_TODO_ITEM
    )
