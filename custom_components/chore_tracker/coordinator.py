"""Data coordinator for Chore Tracker."""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import date, datetime, timedelta
from typing import Any

from homeassistant.components.persistent_notification import async_create
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .const import (
    BACKEND_LOCAL,
    BACKEND_M365,
    CONF_BACKEND,
    CONF_M365_CLIENT_ID,
    CONF_M365_CLIENT_SECRET,
    CONF_M365_LIST_ID,
    CONF_M365_TENANT_ID,
    DAYS_OF_WEEK,
    DEFAULT_CATEGORIES,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    EVENT_TASK_COMPLETED,
    EVENT_TASK_DUE_SOON,
    EVENT_TASK_OVERDUE,
    M365_GRAPH_BASE,
    M365_SCOPES,
    PRIORITY_MEDIUM,
    RECURRENCE_BI_MONTHLY,
    RECURRENCE_BI_WEEKLY,
    RECURRENCE_DAILY,
    RECURRENCE_DAY_OF_MONTH_POSITION,
    RECURRENCE_DAY_OF_WEEK,
    RECURRENCE_MONTHLY,
    RECURRENCE_NONE,
    RECURRENCE_WEEKLY,
    RECURRENCE_YEARLY,
    STATUS_COMPLETED,
    STATUS_OVERDUE,
    STATUS_PENDING,
    STATUS_TEMP_COMPLETE,
    DEFAULT_TEMP_COMPLETE_HOURS,
    CONF_REMINDER_ENABLED,
    CONF_REMINDER_DAYS,
    CONF_MOBILE_NOTIFY,
    DEFAULT_REMINDER_DAYS,
    DEFAULT_MOBILE_NOTIFY,
    STORAGE_KEY,
    STORAGE_VERSION,
)

_LOGGER = logging.getLogger(__name__)


def _compute_next_due(task: dict) -> date | None:
    """Compute next due date based on recurrence settings."""
    recurrence = task.get("recurrence", RECURRENCE_NONE)
    if recurrence == RECURRENCE_NONE:
        return None

    base = task.get("due_date")
    if base:
        if isinstance(base, str):
            base = date.fromisoformat(base)
    else:
        base = date.today()

    today = date.today()
    # Advance past today if needed
    next_date = base

    if recurrence == RECURRENCE_DAILY:
        while next_date <= today:
            next_date += timedelta(days=1)

    elif recurrence == RECURRENCE_WEEKLY:
        while next_date <= today:
            next_date += timedelta(weeks=1)

    elif recurrence == RECURRENCE_BI_WEEKLY:
        while next_date <= today:
            next_date += timedelta(weeks=2)

    elif recurrence == RECURRENCE_MONTHLY:
        while next_date <= today:
            # Add one month
            month = next_date.month + 1
            year = next_date.year
            if month > 12:
                month = 1
                year += 1
            try:
                next_date = next_date.replace(year=year, month=month)
            except ValueError:
                import calendar
                last_day = calendar.monthrange(year, month)[1]
                next_date = next_date.replace(year=year, month=month, day=last_day)

    elif recurrence == RECURRENCE_BI_MONTHLY:
        while next_date <= today:
            month = next_date.month + 2
            year = next_date.year
            while month > 12:
                month -= 12
                year += 1
            try:
                next_date = next_date.replace(year=year, month=month)
            except ValueError:
                import calendar
                last_day = calendar.monthrange(year, month)[1]
                next_date = next_date.replace(year=year, month=month, day=last_day)

    elif recurrence == RECURRENCE_YEARLY:
        while next_date <= today:
            try:
                next_date = next_date.replace(year=next_date.year + 1)
            except ValueError:
                next_date = next_date.replace(year=next_date.year + 1, day=28)

    elif recurrence == RECURRENCE_DAY_OF_WEEK:
        # task["recurrence_day"] = 0-6 (Monday=0)
        target_weekday = task.get("recurrence_day", 0)
        next_date = today + timedelta(days=1)
        while next_date.weekday() != target_weekday:
            next_date += timedelta(days=1)

    elif recurrence == RECURRENCE_DAY_OF_MONTH_POSITION:
        # task["recurrence_week_position"] = 1,2,3,4,-1
        # task["recurrence_day"] = 0-6
        position = task.get("recurrence_week_position", 1)
        target_weekday = task.get("recurrence_day", 0)
        next_date = _next_position_date(today, position, target_weekday)

    return next_date


def _next_position_date(from_date: date, position: int, weekday: int) -> date:
    """Get next occurrence of nth weekday in month."""
    import calendar

    def nth_weekday_in_month(year: int, month: int, position: int, weekday: int) -> date | None:
        cal = calendar.monthcalendar(year, month)
        days = [week[weekday] for week in cal if week[weekday] != 0]
        if position == -1:
            day = days[-1]
        elif 1 <= position <= len(days):
            day = days[position - 1]
        else:
            return None
        return date(year, month, day)

    # Try current month first
    year, month = from_date.year, from_date.month
    candidate = nth_weekday_in_month(year, month, position, weekday)

    if candidate and candidate > from_date:
        return candidate

    # Try next month
    if month == 12:
        year += 1
        month = 1
    else:
        month += 1

    return nth_weekday_in_month(year, month, position, weekday)


def _reset_status(task: dict, today: date) -> str:
    """Return the status a temp_complete task should revert to after its timer expires.

    Non-recurring tasks whose due date is already in the past go straight back
    to STATUS_OVERDUE so they don't cycle through pending → overdue on the next
    _check_overdue_tasks pass (which would re-fire the overdue event).
    """
    due = task.get("due_date")
    if due:
        if isinstance(due, str):
            due = date.fromisoformat(due)
        if due < today and task.get("recurrence", RECURRENCE_NONE) == RECURRENCE_NONE:
            return STATUS_OVERDUE
    return STATUS_PENDING


class ChoreTrackerCoordinator(DataUpdateCoordinator):
    """Coordinator for Chore Tracker data."""

    def __init__(self, hass: HomeAssistant, config_entry) -> None:
        """Initialize coordinator."""
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(minutes=DEFAULT_SCAN_INTERVAL),
        )
        self.config_entry = config_entry
        self.backend = config_entry.data.get(CONF_BACKEND, BACKEND_LOCAL)
        self._store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._tasks: dict[str, dict] = {}
        self._categories: list[str] = list(DEFAULT_CATEGORIES)
        self._m365_token: str | None = None
        self._m365_session = None

    async def async_setup(self) -> None:
        """Load stored data safely."""
        try:
            stored = await self._store.async_load()
            if stored:
                self._tasks = stored.get("tasks", {})
                self._categories = stored.get("categories", list(DEFAULT_CATEGORIES))
        except Exception as err:
            _LOGGER.warning("Could not load stored tasks: %s", err)
            self._tasks = {}
            self._categories = list(DEFAULT_CATEGORIES)
        try:
            await self._check_overdue_tasks()
        except Exception as err:
            _LOGGER.warning("Could not check overdue tasks: %s", err)

    async def _async_update_data(self) -> dict:
        """Fetch/refresh data from backend."""
        try:
            if self.backend == BACKEND_M365:
                try:
                    await self._sync_m365()
                except Exception as m365_err:
                    _LOGGER.warning("M365 sync failed (non-fatal): %s", m365_err)
            try:
                await self._check_overdue_tasks()
                await self._check_due_soon()
                await self._send_reminders()
            except Exception as check_err:
                _LOGGER.warning("Task check failed (non-fatal): %s", check_err)
            return self._get_state()
        except Exception as err:
            _LOGGER.error("Error updating chore tracker: %s", err)
            # Return last known state rather than raising UpdateFailed on first load
            return self._get_state()

    def _get_state(self) -> dict:
        """Return current state snapshot."""
        today = date.today()
        tasks_list = list(self._tasks.values())
        return {
            "tasks": self._tasks,
            "categories": self._categories,
            "stats": {
                "total": len(tasks_list),
                "pending": sum(1 for t in tasks_list if t.get("status") == STATUS_PENDING),
                "overdue": sum(1 for t in tasks_list if t.get("status") == STATUS_OVERDUE),
                "due_today": sum(
                    1 for t in tasks_list
                    if t.get("due_date") and date.fromisoformat(str(t["due_date"])) == today
                    and t.get("status") in (STATUS_PENDING, STATUS_OVERDUE)
                ),
                "completed_today": sum(
                    1 for t in tasks_list
                    if t.get("completed_at") and
                    datetime.fromisoformat(str(t["completed_at"])).date() == today
                ),
            },
        }

    async def _check_overdue_tasks(self) -> None:
        """Mark tasks as overdue and fire events. Also auto-reset temp_complete tasks."""
        today = date.today()
        now   = dt_util.now()
        changed = False

        for task in self._tasks.values():
            status = task.get("status")

            # Auto-reset temp_complete → pending when reset_at time has passed
            if status == STATUS_TEMP_COMPLETE:
                reset_at_str = task.get("temp_complete_reset_at")
                if reset_at_str:
                    try:
                        from datetime import datetime, timezone
                        reset_at = datetime.fromisoformat(reset_at_str)
                        if reset_at.tzinfo is None:
                            reset_at = reset_at.replace(tzinfo=timezone.utc)
                        if now >= reset_at:
                            task["status"] = _reset_status(task, today)
                            task["temp_complete_reset_at"] = None
                            changed = True
                            _LOGGER.debug("Auto-reset temp_complete task: %s", task["name"])
                    except (ValueError, TypeError):
                        task["status"] = _reset_status(task, today)
                        changed = True
                else:
                    # No reset time set — reset immediately
                    task["status"] = _reset_status(task, today)
                    changed = True
                continue  # don't mark temp_complete tasks as overdue

            if status not in (STATUS_PENDING, STATUS_OVERDUE):
                continue
            due = task.get("due_date")
            if due:
                if isinstance(due, str):
                    due = date.fromisoformat(due)
                if due < today and task.get("status") == STATUS_PENDING:
                    task["status"] = STATUS_OVERDUE
                    changed = True
                    self.hass.bus.async_fire(
                        EVENT_TASK_OVERDUE,
                        {"task_id": task["id"], "name": task["name"]},
                    )
        if changed:
            await self._save()

    async def async_temp_complete_task(
        self,
        task_id: str,
        completed_by: str | None = None,
        hours: int = DEFAULT_TEMP_COMPLETE_HOURS,
    ) -> None:
        """
        Mark a task as temporarily complete.
        It will automatically reset to pending after `hours` hours.
        """
        if task_id not in self._tasks:
            raise ValueError(f"Task {task_id} not found")

        task = self._tasks[task_id]
        now  = dt_util.now()
        from datetime import timedelta as _td
        reset_at = now + _td(hours=hours)

        task["status"]                 = STATUS_TEMP_COMPLETE
        task["temp_complete_reset_at"] = reset_at.isoformat()
        task["temp_complete_hours"]    = hours

        # Record in completion history so it's visible in the card
        task.setdefault("completion_history", []).append({
            "completed_at":   now.isoformat(),
            "completed_by":   completed_by,
            "temp":           True,
            "resets_in_hours": hours,
        })

        self.hass.bus.async_fire(
            EVENT_TASK_COMPLETED,
            {
                "task_id":      task_id,
                "name":         task["name"],
                "completed_by": completed_by,
                "temporary":    True,
                "resets_at":    reset_at.isoformat(),
            },
        )

        await self._save()
        await self.async_refresh()

    async def _check_due_soon(self) -> None:
        """Fire due-soon events for tasks due tomorrow."""
        tomorrow = date.today() + timedelta(days=1)
        for task in self._tasks.values():
            if task.get("status") not in (STATUS_PENDING,):
                continue
            due = task.get("due_date")
            if due:
                if isinstance(due, str):
                    due = date.fromisoformat(due)
                if due == tomorrow:
                    self.hass.bus.async_fire(
                        EVENT_TASK_DUE_SOON,
                        {"task_id": task["id"], "name": task["name"], "due_date": str(due)},
                    )

    async def _send_reminders(self) -> None:
        """
        Send HA persistent notification + iPhone push for tasks overdue by
        CONF_REMINDER_DAYS or more.  Fires at most once per task per day.
        """
        options        = self.config_entry.options if self.config_entry else {}
        enabled        = options.get(CONF_REMINDER_ENABLED, True)
        if not enabled:
            return

        threshold_days  = int(options.get(CONF_REMINDER_DAYS, DEFAULT_REMINDER_DAYS))
        mobile_service  = options.get(CONF_MOBILE_NOTIFY, DEFAULT_MOBILE_NOTIFY).strip()
        today           = date.today()
        # task must have been due ON or BEFORE this date to qualify
        cutoff          = today - timedelta(days=threshold_days)
        today_str       = today.isoformat()
        changed         = False
        remind_tasks: list[tuple[dict, int]] = []

        for task in self._tasks.values():
            if task.get("status") not in (STATUS_PENDING, STATUS_OVERDUE):
                continue
            due = task.get("due_date")
            if not due:
                continue
            if isinstance(due, str):
                due = date.fromisoformat(due)
            if due > cutoff:
                continue   # not overdue enough yet

            # Only remind once per calendar day per task
            if task.get("last_reminded_date") == today_str:
                continue

            days_overdue = (today - due).days
            remind_tasks.append((task, days_overdue))
            task["last_reminded_date"] = today_str
            changed = True

        if not remind_tasks:
            if changed:
                await self._save()
            return

        # Sort worst-overdue first
        remind_tasks.sort(key=lambda x: -x[1])

        # ── HA persistent notification (shows in the bell icon) ──────────────
        lines = []
        for task, days_overdue in remind_tasks:
            cat  = task.get("category", "")
            asgn = ", ".join(task.get("assigned_to") or [])
            line = f"**{task['name']}**"
            if cat:
                line += f" ({cat})"
            line += f" — {days_overdue} day{'s' if days_overdue != 1 else ''} overdue"
            if asgn:
                line += f" · {asgn}"
            lines.append(f"- {line}")

        n    = len(remind_tasks)
        msg  = (
            f"⚠️ **{n} chore{'s' if n > 1 else ''} "
            f"need{'s' if n == 1 else ''} attention:**\n\n"
            + "\n".join(lines)
        )

        from homeassistant.components.persistent_notification import async_create as _pn
        _pn(
            self.hass,
            message         = msg,
            title           = "🧹 Chore Tracker Reminder",
            notification_id = f"{DOMAIN}_reminder",  # replaces previous — no inbox spam
        )

        # ── iPhone push notification ─────────────────────────────────────────
        if mobile_service:
            # Build a concise push message
            if n == 1:
                task0, d0 = remind_tasks[0]
                push_title   = f"🧹 Chore overdue: {task0['name']}"
                push_message = (
                    f"{task0['name']} has been overdue for {d0} day{'s' if d0 != 1 else ''}."
                    f" Open the Chore Tracker to complete it."
                )
            else:
                names = ", ".join(t['name'] for t, _ in remind_tasks[:3])
                extra = f" +{n - 3} more" if n > 3 else ""
                push_title   = f"🧹 {n} chores overdue"
                push_message = f"{names}{extra} — all overdue by {threshold_days}+ days."

            # Split "domain.service_name" → domain + service
            parts = mobile_service.split(".", 1)
            if len(parts) == 2:
                notify_domain, notify_service = parts
            else:
                notify_domain, notify_service = "notify", mobile_service

            try:
                await self.hass.services.async_call(
                    notify_domain,
                    notify_service,
                    {
                        "title":   push_title,
                        "message": push_message,
                        "data": {
                            "push": {"sound": "default"},
                            "tag":  f"{DOMAIN}_reminder",  # replaces previous iOS notification
                        },
                    },
                    blocking=False,
                )
                _LOGGER.info(
                    "Chore Tracker: sent iPhone push to %s for %d overdue task(s)",
                    mobile_service, n,
                )
            except Exception as err:
                _LOGGER.warning(
                    "Chore Tracker: could not send push to %s: %s", mobile_service, err
                )

        # ── HA event (for custom automations) ────────────────────────────────
        self.hass.bus.async_fire(
            f"{DOMAIN}_reminder",
            {
                "overdue_count": n,
                "tasks": [
                    {"id": t["id"], "name": t["name"], "days_overdue": d}
                    for t, d in remind_tasks
                ],
            },
        )
        _LOGGER.info("Chore Tracker: reminder sent for %d overdue task(s)", n)

        if changed:
            await self._save()

    async def _save(self) -> None:
        """Persist tasks to storage."""
        # Serialize dates
        tasks_serializable = {}
        for tid, task in self._tasks.items():
            t = dict(task)
            for key in ("due_date", "created_at", "completed_at", "snoozed_until"):
                if key in t and t[key] is not None:
                    t[key] = str(t[key])
            tasks_serializable[tid] = t
        await self._store.async_save({
            "tasks": tasks_serializable,
            "categories": self._categories,
        })

    # ── Task CRUD ──────────────────────────────────────────────────────────────

    async def async_add_task(self, data: dict) -> str:
        """Add a new task and return its ID."""
        task_id = str(uuid.uuid4())
        now = dt_util.now().isoformat()
        task = {
            "id": task_id,
            "name": data["name"],
            "description": data.get("description", ""),
            "category": data.get("category", "other"),
            "priority": data.get("priority", PRIORITY_MEDIUM),
            "status": STATUS_PENDING,
            "assigned_to": data.get("assigned_to", []),
            "due_date": data.get("due_date"),
            "recurrence": data.get("recurrence", RECURRENCE_NONE),
            "recurrence_day": data.get("recurrence_day"),
            "recurrence_week_position": data.get("recurrence_week_position"),
            "nfc_tag_id": data.get("nfc_tag_id"),
            "m365_task_id": data.get("m365_task_id"),
            "notes": data.get("notes", ""),
            "created_at": now,
            "completed_at": None,
            "snoozed_until": None,
            "completion_history": [],
        }
        self._tasks[task_id] = task

        if self.backend == BACKEND_M365 and not data.get("m365_task_id"):
            await self._create_m365_task(task)

        await self._save()
        await self.async_refresh()
        return task_id

    async def async_update_task(self, task_id: str, data: dict) -> None:
        """Update an existing task."""
        if task_id not in self._tasks:
            raise ValueError(f"Task {task_id} not found")
        task = self._tasks[task_id]
        updatable = [
            "name", "description", "category", "priority", "assigned_to",
            "due_date", "recurrence", "recurrence_day", "recurrence_week_position",
            "nfc_tag_id", "notes", "status",
        ]
        for key in updatable:
            if key in data:
                task[key] = data[key]

        if self.backend == BACKEND_M365 and task.get("m365_task_id"):
            await self._update_m365_task(task)

        await self._save()
        await self.async_refresh()

    async def async_complete_task(self, task_id: str, completed_by: str | None = None) -> None:
        """Mark a task complete and schedule next recurrence."""
        if task_id not in self._tasks:
            raise ValueError(f"Task {task_id} not found")
        task = self._tasks[task_id]
        now = dt_util.now()

        # Record history
        task.setdefault("completion_history", []).append({
            "completed_at": now.isoformat(),
            "completed_by": completed_by,
        })

        self.hass.bus.async_fire(
            EVENT_TASK_COMPLETED,
            {"task_id": task_id, "name": task["name"], "completed_by": completed_by},
        )

        if task.get("recurrence", RECURRENCE_NONE) == RECURRENCE_NONE:
            task["status"] = STATUS_COMPLETED
            task["completed_at"] = now.isoformat()
        else:
            # Reschedule
            next_due = _compute_next_due(task)
            task["due_date"] = str(next_due) if next_due else None
            task["status"] = STATUS_PENDING
            task["completed_at"] = None
            task["snoozed_until"] = None

        if self.backend == BACKEND_M365 and task.get("m365_task_id"):
            await self._complete_m365_task(task)

        await self._save()
        await self.async_refresh()

    async def async_complete_by_nfc(self, nfc_tag_id: str, completed_by: str | None = None) -> None:
        """Complete task associated with an NFC tag."""
        for task_id, task in self._tasks.items():
            if task.get("nfc_tag_id") == nfc_tag_id:
                await self.async_complete_task(task_id, completed_by)
                return
        _LOGGER.warning("No task found for NFC tag: %s", nfc_tag_id)

    async def async_assign_nfc_tag(self, task_id: str, nfc_tag_id: str) -> None:
        """Assign an NFC tag to a task."""
        if task_id not in self._tasks:
            raise ValueError(f"Task {task_id} not found")
        # Remove tag from any existing task
        for task in self._tasks.values():
            if task.get("nfc_tag_id") == nfc_tag_id:
                task["nfc_tag_id"] = None
        self._tasks[task_id]["nfc_tag_id"] = nfc_tag_id
        await self._save()
        await self.async_refresh()

    async def async_delete_task(self, task_id: str) -> None:
        """Delete a task."""
        if task_id not in self._tasks:
            raise ValueError(f"Task {task_id} not found")
        task = self._tasks.pop(task_id)
        if self.backend == BACKEND_M365 and task.get("m365_task_id"):
            await self._delete_m365_task(task["m365_task_id"])
        await self._save()
        await self.async_refresh()

    async def async_skip_task(self, task_id: str) -> None:
        """Skip current occurrence and schedule next."""
        if task_id not in self._tasks:
            raise ValueError(f"Task {task_id} not found")
        task = self._tasks[task_id]
        if task.get("recurrence", RECURRENCE_NONE) != RECURRENCE_NONE:
            next_due = _compute_next_due(task)
            task["due_date"] = str(next_due) if next_due else None
            task["status"] = STATUS_PENDING
        await self._save()
        await self.async_refresh()

    async def async_snooze_task(self, task_id: str, until: date) -> None:
        """Snooze a task until a specific date."""
        if task_id not in self._tasks:
            raise ValueError(f"Task {task_id} not found")
        task = self._tasks[task_id]
        task["snoozed_until"] = str(until)
        task["due_date"] = str(until)
        task["status"] = STATUS_PENDING
        await self._save()
        await self.async_refresh()

    async def async_add_category(self, category: str) -> None:
        """Add a custom category."""
        if category not in self._categories:
            self._categories.append(category)
            await self._save()

    # ── Microsoft 365 Backend ──────────────────────────────────────────────────

    async def _get_m365_token(self) -> str | None:
        """Get M365 access token using client credentials."""
        import aiohttp

        client_id = self.config_entry.data.get(CONF_M365_CLIENT_ID)
        client_secret = self.config_entry.data.get(CONF_M365_CLIENT_SECRET)
        tenant_id = self.config_entry.data.get(CONF_M365_TENANT_ID)

        if not all([client_id, client_secret, tenant_id]):
            return None

        token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
        async with aiohttp.ClientSession() as session:
            async with session.post(token_url, data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
                "scope": "https://graph.microsoft.com/.default",
            }) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get("access_token")
                _LOGGER.error("M365 token error: %s", await resp.text())
                return None

    async def _m365_request(self, method: str, path: str, body: dict | None = None) -> dict | None:
        """Make a Microsoft Graph API request."""
        import aiohttp

        token = await self._get_m365_token()
        if not token:
            return None

        url = f"{M365_GRAPH_BASE}{path}"
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        async with aiohttp.ClientSession() as session:
            async with session.request(method, url, headers=headers, json=body) as resp:
                if resp.status in (200, 201):
                    return await resp.json()
                if resp.status == 204:
                    return {}
                _LOGGER.error("M365 API error %s: %s", resp.status, await resp.text())
                return None

    async def _sync_m365(self) -> None:
        """Sync tasks from Microsoft To Do."""
        list_id = self.config_entry.data.get(CONF_M365_LIST_ID)
        if not list_id:
            return

        result = await self._m365_request("GET", f"/me/todo/lists/{list_id}/tasks")
        if not result:
            return

        m365_tasks = result.get("value", [])
        existing_m365_ids = {
            t.get("m365_task_id"): tid
            for tid, t in self._tasks.items()
            if t.get("m365_task_id")
        }

        for m365_task in m365_tasks:
            m365_id = m365_task["id"]
            due_datetime = m365_task.get("dueDateTime", {})
            due_date = None
            if due_datetime and due_datetime.get("dateTime"):
                due_date = due_datetime["dateTime"][:10]

            task_data = {
                "name": m365_task.get("title", "Untitled"),
                "description": m365_task.get("body", {}).get("content", ""),
                "status": STATUS_COMPLETED if m365_task.get("status") == "completed" else STATUS_PENDING,
                "due_date": due_date,
                "m365_task_id": m365_id,
                "priority": self._map_m365_priority(m365_task.get("importance", "normal")),
            }

            if m365_id in existing_m365_ids:
                # Update existing
                existing_id = existing_m365_ids[m365_id]
                task = self._tasks[existing_id]
                task.update({k: v for k, v in task_data.items() if v is not None})
            else:
                # New task from M365
                await self.async_add_task(task_data)

        await self._save()

    def _map_m365_priority(self, importance: str) -> str:
        """Map M365 importance to local priority."""
        mapping = {"low": "low", "normal": "medium", "high": "high"}
        return mapping.get(importance, "medium")

    async def _create_m365_task(self, task: dict) -> None:
        """Create task in M365 To Do."""
        list_id = self.config_entry.data.get(CONF_M365_LIST_ID)
        if not list_id:
            return

        body = {
            "title": task["name"],
            "body": {"contentType": "text", "content": task.get("description", "")},
            "importance": {"low": "low", "medium": "normal", "high": "high", "urgent": "high"}.get(
                task.get("priority", "medium"), "normal"
            ),
        }
        if task.get("due_date"):
            body["dueDateTime"] = {"dateTime": f"{task['due_date']}T00:00:00", "timeZone": "UTC"}

        result = await self._m365_request("POST", f"/me/todo/lists/{list_id}/tasks", body)
        if result:
            task["m365_task_id"] = result["id"]

    async def _update_m365_task(self, task: dict) -> None:
        """Update task in M365."""
        list_id = self.config_entry.data.get(CONF_M365_LIST_ID)
        if not list_id or not task.get("m365_task_id"):
            return

        body = {
            "title": task["name"],
            "body": {"contentType": "text", "content": task.get("description", "")},
        }
        await self._m365_request(
            "PATCH",
            f"/me/todo/lists/{list_id}/tasks/{task['m365_task_id']}",
            body,
        )

    async def _complete_m365_task(self, task: dict) -> None:
        """Mark task complete in M365."""
        list_id = self.config_entry.data.get(CONF_M365_LIST_ID)
        if not list_id or not task.get("m365_task_id"):
            return
        await self._m365_request(
            "PATCH",
            f"/me/todo/lists/{list_id}/tasks/{task['m365_task_id']}",
            {"status": "completed"},
        )

    async def _delete_m365_task(self, m365_task_id: str) -> None:
        """Delete task from M365."""
        list_id = self.config_entry.data.get(CONF_M365_LIST_ID)
        if not list_id:
            return
        await self._m365_request("DELETE", f"/me/todo/lists/{list_id}/tasks/{m365_task_id}")

    async def async_get_m365_lists(self) -> list[dict]:
        """Fetch available M365 To Do lists."""
        result = await self._m365_request("GET", "/me/todo/lists")
        if result:
            return result.get("value", [])
        return []
