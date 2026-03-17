"""Config flow for Chore Tracker — Microsoft OAuth2 (Authorization Code) + Local."""
from __future__ import annotations

import logging
import secrets
import urllib.parse
from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.network import get_url, NoURLAvailableError

from .const import (
    BACKEND_LOCAL,
    BACKEND_M365,
    BACKENDS,
    CONF_BACKEND,
    CONF_M365_CLIENT_ID,
    CONF_M365_CLIENT_SECRET,
    CONF_M365_LIST_ID,
    CONF_M365_TENANT_ID,
    CONF_REMINDER_DAYS,
    CONF_REMINDER_ENABLED,
    CONF_SCAN_INTERVAL,
    DEFAULT_REMINDER_DAYS,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)

M365_SCOPES   = "Tasks.ReadWrite offline_access User.Read"
CALLBACK_PATH = "/api/chore_tracker/oauth_callback"
HA_EXTERNAL   = "https://homeassistant.peterborough.madasc.com:8123"

# ─── OAuth callback HTTP view ─────────────────────────────────────────────────

class M365OAuthCallbackView(HomeAssistantView):
    """
    Receives GET /api/chore_tracker/oauth_callback?code=…&state=…
    from Microsoft after the user signs in, then resumes the config flow.
    """
    url           = CALLBACK_PATH
    name          = "api:chore_tracker:oauth_callback"
    requires_auth = False   # Microsoft redirects without HA auth headers

    async def get(self, request):
        from aiohttp.web import Response

        hass   = request.app["hass"]
        params = dict(request.rel_url.query)
        state  = params.get("state", "")
        code   = params.get("code", "")
        error  = params.get("error", "")

        _LOGGER.debug("OAuth callback received state=%s code=%s error=%s",
                      state, bool(code), error)

        # Find the config flow that owns this state token
        flow = next(
            (f for f in hass.config_entries.flow.async_progress()
             if f["handler"] == DOMAIN
             and f.get("context", {}).get("oauth_state") == state),
            None,
        )

        if not flow:
            _LOGGER.error("OAuth callback: no flow found for state=%s", state)
            return Response(
                text="<html><body style='font-family:sans-serif;padding:40px'>"
                     "<h2>⚠️ Session expired</h2>"
                     "<p>Please return to Home Assistant and restart the integration setup.</p>"
                     "</body></html>",
                content_type="text/html", status=400,
            )

        # Pass code (or error) into the waiting flow step
        await hass.config_entries.flow.async_configure(
            flow["flow_id"],
            {"code": code, "error": error},
        )

        if error:
            return Response(
                text=f"<html><body style='font-family:sans-serif;padding:40px'>"
                     f"<h2>❌ Login failed: {error}</h2>"
                     f"<p>Return to Home Assistant and try again.</p>"
                     f"</body></html>",
                content_type="text/html",
            )

        return Response(
            text="<html><body style='font-family:sans-serif;padding:40px;text-align:center'>"
                 "<h2>✅ Microsoft account connected!</h2>"
                 "<p>You can close this tab and return to Home Assistant to finish setup.</p>"
                 "</body></html>",
            content_type="text/html",
        )


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _build_auth_url(client_id: str, tenant_id: str, redirect_uri: str, state: str) -> str:
    params = {
        "client_id":     client_id,
        "response_type": "code",
        "redirect_uri":  redirect_uri,
        "scope":         M365_SCOPES,
        "state":         state,
        "response_mode": "query",
        "prompt":        "select_account",
    }
    base = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/authorize"
    return f"{base}?{urllib.parse.urlencode(params)}"


async def _exchange_code(hass, client_id, client_secret, tenant_id, redirect_uri, code):
    """Exchange an auth code for access + refresh tokens using HA's HTTP session."""
    session  = async_get_clientsession(hass)
    url      = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    payload  = {
        "client_id":     client_id,
        "client_secret": client_secret,
        "grant_type":    "authorization_code",
        "code":          code,
        "redirect_uri":  redirect_uri,
        "scope":         M365_SCOPES,
    }
    try:
        async with session.post(url, data=payload) as resp:
            data = await resp.json(content_type=None)
            if resp.status == 200 and "access_token" in data:
                return data
            _LOGGER.error("Token exchange failed %s: %s", resp.status, data)
    except Exception as err:
        _LOGGER.exception("Token exchange error: %s", err)
    return None


async def _fetch_todo_lists(hass, access_token: str) -> dict[str, str]:
    """Return {list_id: display_name} from Microsoft To Do."""
    session = async_get_clientsession(hass)
    try:
        async with session.get(
            "https://graph.microsoft.com/v1.0/me/todo/lists",
            headers={"Authorization": f"Bearer {access_token}"},
        ) as resp:
            if resp.status == 200:
                data = await resp.json(content_type=None)
                return {x["id"]: x["displayName"] for x in data.get("value", [])}
            _LOGGER.error("Fetch lists failed %s", resp.status)
    except Exception as err:
        _LOGGER.exception("Fetch lists error: %s", err)
    return {}


def _ha_external_url(hass) -> str:
    """Return the best available external URL for this HA instance."""
    for kwargs in [
        {"allow_internal": False, "allow_ip": False, "prefer_external": True},
        {"allow_internal": True,  "allow_ip": True,  "prefer_external": True},
        {"allow_internal": True,  "allow_ip": True,  "prefer_external": False},
    ]:
        try:
            url = get_url(hass, **kwargs)
            if url:
                return url
        except NoURLAvailableError:
            continue
    return (
        hass.config.external_url
        or hass.config.internal_url
        or HA_EXTERNAL
    )


# ─── Schemas ──────────────────────────────────────────────────────────────────

SCHEMA_USER = vol.Schema({
    vol.Required(CONF_BACKEND, default=BACKEND_LOCAL): vol.In(BACKENDS),
})

SCHEMA_M365 = vol.Schema({
    vol.Required(CONF_M365_CLIENT_ID):     str,
    vol.Required(CONF_M365_TENANT_ID):     str,
    vol.Required(CONF_M365_CLIENT_SECRET): str,
})


# ─── Config flow ──────────────────────────────────────────────────────────────

class ChoreTrackerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self):
        self._data:     dict[str, Any] = {}
        self._redirect: str = ""
        self._lists:    dict[str, str] = {}
        # _view_registered is a class-level flag so the view is only registered once
        # across all instances (it survives HA restarts because it's per-process)

    _view_registered: bool = False   # class variable — shared across instances

    def _ensure_view_registered(self) -> None:
        if not ChoreTrackerConfigFlow._view_registered:
            try:
                self.hass.http.register_view(M365OAuthCallbackView())
                ChoreTrackerConfigFlow._view_registered = True
                _LOGGER.debug("Registered OAuth callback view at %s", CALLBACK_PATH)
            except Exception as err:
                # View may already be registered from a previous setup attempt
                _LOGGER.debug("View registration note: %s", err)
                ChoreTrackerConfigFlow._view_registered = True

    # ── Step 1: backend choice ─────────────────────────────────────────────────

    async def async_step_user(self, user_input=None) -> FlowResult:
        if user_input is not None:
            self._data.update(user_input)
            if user_input[CONF_BACKEND] == BACKEND_M365:
                return await self.async_step_m365_creds()
            return self.async_create_entry(title="Chore Tracker", data=self._data)
        return self.async_show_form(step_id="user", data_schema=SCHEMA_USER)

    # ── Step 2: enter Azure app credentials ───────────────────────────────────

    async def async_step_m365_creds(self, user_input=None) -> FlowResult:
        errors: dict[str, str] = {}

        if user_input is not None:
            self._data.update(user_input)
            self._ensure_view_registered()

            # Build the redirect URI that Azure will send the code to
            ha_url         = _ha_external_url(self.hass)
            self._redirect = f"{ha_url.rstrip('/')}{CALLBACK_PATH}"

            # Generate a random CSRF state token and store it in the flow context
            # so the callback view can match the redirect back to this flow
            state = secrets.token_hex(16)
            self.context["oauth_state"] = state

            auth_url = _build_auth_url(
                client_id    = user_input[CONF_M365_CLIENT_ID],
                tenant_id    = user_input[CONF_M365_TENANT_ID],
                redirect_uri = self._redirect,
                state        = state,
            )
            _LOGGER.debug("Starting OAuth flow. Redirect URI: %s", self._redirect)

            # async_external_step opens a browser popup / "Open link" button in HA UI
            return self.async_external_step(step_id="m365_oauth", url=auth_url)

        redirect_uri = f"{HA_EXTERNAL}{CALLBACK_PATH}"
        return self.async_show_form(
            step_id="m365_creds",
            data_schema=SCHEMA_M365,
            errors=errors,
            description_placeholders={"redirect_uri": redirect_uri},
        )

    # ── Step 3: Microsoft redirects back → callback view calls async_configure ─

    async def async_step_m365_oauth(self, user_input=None) -> FlowResult:
        """
        HA calls this step in two situations:
          • user_input is None      → initial display of the "Open link" button
          • user_input has "code"   → the callback view has delivered the auth code
        """
        if user_input is None:
            # Still waiting — just keep showing the external step
            state    = self.context.get("oauth_state", "")
            auth_url = _build_auth_url(
                self._data[CONF_M365_CLIENT_ID],
                self._data[CONF_M365_TENANT_ID],
                self._redirect,
                state,
            )
            return self.async_external_step(step_id="m365_oauth", url=auth_url)

        # Microsoft returned an error (user cancelled, wrong account, etc.)
        if user_input.get("error"):
            return self.async_show_form(
                step_id="m365_creds",
                data_schema=SCHEMA_M365,
                errors={"base": "auth_failed"},
            )

        # *** Store the code in self.context NOW before external_step_done ***
        # external_step_done transitions to the next step with user_input=None,
        # so this is the only opportunity to pass data forward.
        self.context["oauth_code"] = user_input.get("code", "")

        return self.async_external_step_done(next_step_id="m365_token")

    # ── Step 4: exchange code for tokens, then fetch To Do lists ──────────────

    async def async_step_m365_token(self, user_input=None) -> FlowResult:
        """Called automatically by HA after external_step_done."""
        code = self.context.get("oauth_code", "")

        if not code:
            _LOGGER.error("async_step_m365_token: no code in context")
            return self.async_show_form(
                step_id="m365_creds",
                data_schema=SCHEMA_M365,
                errors={"base": "no_auth_code"},
            )

        tokens = await _exchange_code(
            self.hass,
            self._data[CONF_M365_CLIENT_ID],
            self._data[CONF_M365_CLIENT_SECRET],
            self._data[CONF_M365_TENANT_ID],
            self._redirect,
            code,
        )

        if not tokens:
            return self.async_show_form(
                step_id="m365_creds",
                data_schema=SCHEMA_M365,
                errors={"base": "token_failed"},
            )

        self._data["m365_access_token"]  = tokens.get("access_token",  "")
        self._data["m365_refresh_token"] = tokens.get("refresh_token", "")

        # Fetch available To Do lists so user can choose which one to sync
        self._lists = await _fetch_todo_lists(self.hass, tokens["access_token"])

        if self._lists:
            return await self.async_step_m365_list()

        # No lists returned — proceed with defaults
        self._data[CONF_M365_LIST_ID] = ""
        return self.async_create_entry(title="Chore Tracker (M365)", data=self._data)

    # ── Step 5: pick which To Do list to sync ─────────────────────────────────

    async def async_step_m365_list(self, user_input=None) -> FlowResult:
        if user_input is not None:
            self._data[CONF_M365_LIST_ID] = user_input[CONF_M365_LIST_ID]
            return self.async_create_entry(title="Chore Tracker (M365)", data=self._data)

        return self.async_show_form(
            step_id="m365_list",
            data_schema=vol.Schema({
                vol.Required(CONF_M365_LIST_ID): vol.In(self._lists)
            }),
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return ChoreTrackerOptionsFlow(config_entry)


# ─── Options flow ──────────────────────────────────────────────────────────────

class ChoreTrackerOptionsFlow(config_entries.OptionsFlow):

    def __init__(self, config_entry):
        self.config_entry = config_entry

    async def async_step_init(self, user_input=None) -> FlowResult:
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        opts = self.config_entry.options
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({
                vol.Required(
                    CONF_SCAN_INTERVAL,
                    default=opts.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
                ): vol.All(vol.Coerce(int), vol.Range(min=1, max=1440)),
                vol.Required(
                    CONF_REMINDER_ENABLED,
                    default=opts.get(CONF_REMINDER_ENABLED, True),
                ): bool,
                vol.Required(
                    CONF_REMINDER_DAYS,
                    default=opts.get(CONF_REMINDER_DAYS, DEFAULT_REMINDER_DAYS),
                ): vol.All(vol.Coerce(int), vol.Range(min=1, max=30)),
            }),
        )
