"""HTTP views to serve the Smart Shopping card JS."""
from __future__ import annotations

import os
from pathlib import Path

from homeassistant.components.http import HomeAssistantView


CARD_URL  = "/smart_shopping/smart-shopping-card.js"
CARD_FILE = Path(__file__).parent.parent.parent / "www" / "smart-shopping-card" / "smart-shopping-card.js"


class SmartShoppingCardView(HomeAssistantView):
    """Serve the Smart Shopping Lovelace card JavaScript."""

    url        = CARD_URL
    name       = "smart_shopping:card"
    requires_auth = False

    async def get(self, request):
        """Return the card JS file."""
        from aiohttp.web import FileResponse, Response
        if CARD_FILE.exists():
            return FileResponse(CARD_FILE)
        return Response(status=404, text="Smart Shopping card not found")
