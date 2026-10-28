"""Home Assistant integration for the EVO add-on."""

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_URL, Platform
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import BridgeError, EvoApi
from .const import DOMAIN
from .coordinator import EvoCoordinator

PLATFORMS = [Platform.BUTTON, Platform.CAMERA, Platform.EVENT]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
type EvoConfigEntry = ConfigEntry[EvoCoordinator]


async def async_setup_entry(hass: HomeAssistant, entry: EvoConfigEntry) -> bool:
    """Load entities only after the add-on has supplied its device list."""
    api = EvoApi(async_get_clientsession(hass), entry.data[CONF_URL])
    try:
        info = await api.info()
    except BridgeError as error:
        raise ConfigEntryNotReady(str(error)) from error
    if entry.unique_id != info.instance_id:
        raise ConfigEntryNotReady(
            "The address points to a different EVO add-on instance"
        )
    coordinator = EvoCoordinator(hass, entry, api)
    await coordinator.async_config_entry_first_refresh()
    try:
        await coordinator.async_initialize_events()
    except BridgeError as error:
        raise ConfigEntryNotReady(str(error)) from error
    entry.runtime_data = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_create_background_task(
        hass, coordinator.async_run_events(), "EVO incoming calls"
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: EvoConfigEntry) -> bool:
    """Unload entities and cancel the entry's background event subscription."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
