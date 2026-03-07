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
    CONF_SCAN_INTERVAL,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)

M365_SCOPES  = "Tasks.ReadWrite offline_access User.Read"
CALLBACK_PATH = "/api/chore_tracker/oauth_callback"

# ─── OAuth callback view (registered once, handles all flows) ─────────────────

class M365OAuthCallbackView(HomeAssistantView):
    """Receives the redirect from Microsoft and forwards code to the config flow."""

    url          = CALLBACK_PATH
    name         = "api:chore_tracker:oauth_callback"
    requires_auth = False   # Microsoft redirects without HA auth headers

    async def get(self, request):
        """Handle GET /api/chore_tracker/oauth_callback?code=…&state=…"""
        from aiohttp.web import Response

        hass    = request.app["hass"]
        params  = dict(request.rel_url.query)
        state   = params.get("state", "")
        code    = params.get("code")
        error   = params.get("error")

        # Find the config flow waiting for this state token
        flows = hass.config_entries.flow.async_progress()
        flow  = next(
            (f for f in flows
             if f["handler"] == DOMAIN
             and f.get("context", {}).get("oauth_state") == state),
            None,
        )

        if not flow:
            _LOGGER.error("OAuth callback: no matching flow for state %s", state)
            return Response(
                text="<html><body><h2>Error: session expired or not found."
                     " Please restart the integration setup.</h2></body></html>",
                content_type="text/html", status=400,
            )

        if error:
            await hass.config_entries.flow.async_configure(
                flow["flow_id"], {"error": error}
            )
            return Response(
                text=f"<html><body><h2>Microsoft login failed: {error}"
                     "</h2><p>Return to Home Assistant.</p></body></html>",
                content_type="text/html",
            )

        await hass.config_entries.flow.async_configure(
            flow["flow_id"], {"code": code}
        )
        return Response(
            text="<html><body><h2>✅ Microsoft account connected!</h2>"
                 "<p>You can close this window and return to Home Assistant.</p>"
                 "</body></html>",
            content_type="text/html",
        )


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _auth_url(client_id: str, tenant_id: str, redirect_uri: str, state: str) -> str:
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
    import aiohttp
    url  = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    data = {
        "client_id":     client_id,
        "client_secret": client_secret,
        "grant_type":    "authorization_code",
        "code":          code,
        "redirect_uri":  redirect_uri,
        "scope":         M365_SCOPES,
    }
    try:
        async with aiohttp.ClientSession() as s:
            async with s.post(url, data=data) as resp:
                j = await resp.json()
                if resp.status == 200 and "access_token" in j:
                    return j
                _LOGGER.error("Token exchange %s: %s", resp.status, j)
    except Exception as err:
        _LOGGER.exception("Token exchange error: %s", err)
    return None


async def _fetch_lists(access_token: str) -> dict[str, str]:
    import aiohttp
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(
                "https://graph.microsoft.com/v1.0/me/todo/lists",
                headers={"Authorization": f"Bearer {access_token}"},
            ) as resp:
                if resp.status == 200:
                    j = await resp.json()
                    return {x["id"]: x["displayName"] for x in j.get("value", [])}
    except Exception as err:
        _LOGGER.exception("Fetch lists error: %s", err)
    return {}


# ─── Config flow ──────────────────────────────────────────────────────────────

SCHEMA_USER = vol.Schema({
    vol.Required(CONF_BACKEND, default=BACKEND_LOCAL): vol.In(BACKENDS),
})

SCHEMA_M365 = vol.Schema({
    vol.Required(CONF_M365_CLIENT_ID):     str,
    vol.Required(CONF_M365_TENANT_ID):     str,
    vol.Required(CONF_M365_CLIENT_SECRET): str,
})


class ChoreTrackerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self):
        self._data:        dict[str, Any] = {}
        self._state:       str = ""          # CSRF token stored in flow context
        self._redirect:    str = ""
        self._lists:       dict[str, str] = {}
        self._view_registered = False

    def _ensure_view(self):
        """Register the OAuth callback view once."""
        if not self._view_registered:
            try:
                self.hass.http.register_view(M365OAuthCallbackView())
                self._view_registered = True
            except Exception:
                self._view_registered = True  # already registered is fine

    # Step 1 ── choose backend ──────────────────────────────────────────────────

    async def async_step_user(self, user_input=None) -> FlowResult:
        if user_input is not None:
            self._data.update(user_input)
            if user_input[CONF_BACKEND] == BACKEND_M365:
                return await self.async_step_m365_creds()
            return self.async_create_entry(title="Chore Tracker", data=self._data)

        return self.async_show_form(step_id="user", data_schema=SCHEMA_USER)

    # Step 2 ── M365 credentials ────────────────────────────────────────────────

    async def async_step_m365_creds(self, user_input=None) -> FlowResult:
        """User enters Client ID / Tenant ID / Client Secret."""
        errors: dict[str, str] = {}

        if user_input is not None:
            self._data.update(user_input)
            self._ensure_view()

            # Build HA's external URL for the redirect_uri
            try:
                ha_url = get_url(
                    self.hass,
                    allow_internal=True,
                    allow_ip=True,
                    prefer_external=False,
                )
            except NoURLAvailableError:
                ha_url = self.hass.config.internal_url or "http://homeassistant.local:8123"

            self._redirect = f"{ha_url.rstrip('/')}{CALLBACK_PATH}"
            self._state    = secrets.token_hex(12)

            # Store state in the flow context so the callback view can find this flow
            self.context["oauth_state"] = self._state

            auth_url = _auth_url(
                client_id    = user_input[CONF_M365_CLIENT_ID],
                tenant_id    = user_input[CONF_M365_TENANT_ID],
                redirect_uri = self._redirect,
                state        = self._state,
            )

            # Show the "Open link" button — HA opens Microsoft login in a new tab
            return self.async_external_step(
                step_id = "m365_oauth",
                url     = auth_url,
            )

        return self.async_show_form(
            step_id="m365_creds",
            data_schema=SCHEMA_M365,
            errors=errors,
            description_placeholders={"redirect_info": CALLBACK_PATH},
        )

    # Step 3 ── HA calls this again after the callback view sends the code ──────

    async def async_step_m365_oauth(self, user_input=None) -> FlowResult:
        """
        Called twice:
          1. user_input=None  → return async_external_step (shows the Open link button)
          2. user_input={code} → Microsoft redirected back; exchange code for tokens
        """
        if user_input is None:
            # Shouldn't normally reach here but handle gracefully
            return self.async_external_step(
                step_id="m365_oauth",
                url=_auth_url(
                    self._data[CONF_M365_CLIENT_ID],
                    self._data[CONF_M365_TENANT_ID],
                    self._redirect,
                    self._state,
                ),
            )

        if "error" in user_input:
            return self.async_show_form(
                step_id="m365_creds",
                data_schema=SCHEMA_M365,
                errors={"base": "auth_failed"},
            )

        # Mark the external step as done — required before we can show the next step
        return self.async_external_step_done(next_step_id="m365_token")

    # Step 4 ── exchange code, fetch lists ─────────────────────────────────────

    async def async_step_m365_token(self, user_input=None) -> FlowResult:
        # The code was stored in the flow context by the callback calling
        # async_configure, which put it in user_input of step m365_oauth.
        # HA passes it through via the context after external_step_done.
        # We retrieve it from the progress entry's context.
        progress = next(
            (f for f in self.hass.config_entries.flow.async_progress()
             if f["flow_id"] == self.flow_id),
            None,
        )
        # The code lives in the last user_input of m365_oauth, which HA stores
        # temporarily — we surfaced it through async_configure, so read from context
        code = self.context.get("oauth_code")

        if not code:
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

        self._data["m365_access_token"]  = tokens.get("access_token", "")
        self._data["m365_refresh_token"] = tokens.get("refresh_token", "")

        self._lists = await _fetch_lists(tokens["access_token"])
        if self._lists:
            return await self.async_step_m365_list()

        return self.async_create_entry(title="Chore Tracker (M365)", data=self._data)

    # Step 5 ── pick To Do list ────────────────────────────────────────────────

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


# ─── The callback view needs to store the code in the flow context ─────────────
# Override the get() method so we actually store the code before advancing

async def _patched_view_get(self_view, request):
    from aiohttp.web import Response

    hass   = request.app["hass"]
    params = dict(request.rel_url.query)
    state  = params.get("state", "")
    code   = params.get("code")
    error  = params.get("error")

    flows = hass.config_entries.flow.async_progress()
    flow  = next(
        (f for f in flows
         if f["handler"] == DOMAIN
         and f.get("context", {}).get("oauth_state") == state),
        None,
    )

    if not flow:
        _LOGGER.error("OAuth callback: no flow found for state=%s", state)
        return Response(
            text="<html><body><h2>Session expired — please restart setup.</h2></body></html>",
            content_type="text/html", status=400,
        )

    # Stash code in context so async_step_m365_token can read it
    flow["context"]["oauth_code"] = code or ""

    await hass.config_entries.flow.async_configure(
        flow["flow_id"],
        {"code": code, "error": error} if (code or error) else {},
    )

    if error:
        return Response(
            text=f"<html><body><h2>Microsoft login failed: {error}</h2>"
                 "<p>Return to Home Assistant and try again.</p></body></html>",
            content_type="text/html",
        )
    return Response(
        text="<html><body>"
             "<h2>✅ Microsoft account connected!</h2>"
             "<p>You can close this tab and return to Home Assistant.</p>"
             "</body></html>",
        content_type="text/html",
    )

M365OAuthCallbackView.get = _patched_view_get


# ─── Options flow ──────────────────────────────────────────────────────────────

class ChoreTrackerOptionsFlow(config_entries.OptionsFlow):

    def __init__(self, config_entry):
        self.config_entry = config_entry

    async def async_step_init(self, user_input=None) -> FlowResult:
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({
                vol.Required(
                    CONF_SCAN_INTERVAL,
                    default=self.config_entry.options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
                ): vol.All(vol.Coerce(int), vol.Range(min=1, max=1440)),
            }),
        )
