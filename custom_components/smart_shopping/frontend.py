"""Register Smart Shopping card as a Lovelace resource automatically."""
from pathlib import Path
from homeassistant.components.frontend import add_extra_js_url


def setup(hass, config):
    """Register the card JS with Lovelace."""
    add_extra_js_url(hass, "/smart_shopping/smart-shopping-card.js")
    return True
