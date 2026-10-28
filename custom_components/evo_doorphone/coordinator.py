"""Device polling and a reconnecting long-poll subscription to incoming calls."""

import asyncio
import logging
from collections.abc import Callable
from datetime import timedelta

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import BridgeError, CallEvent, Doorphone, EvoApi
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


class EvoCoordinator(DataUpdateCoordinator[dict[int, Doorphone]]):
    """Keep one device list and one event connection for all entities."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, api: EvoApi) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            config_entry=entry,
            update_interval=timedelta(seconds=60),
        )
        self.api = api
        self.instance_id = entry.unique_id
        self._call_listeners: set[Callable[[CallEvent], None]] = set()
        self._cursor: str | None = None
        self.events_connected = False

    async def _async_update_data(self) -> dict[int, Doorphone]:
        try:
            return await self.api.devices()
        except BridgeError as error:
            raise UpdateFailed(str(error)) from error

    async def async_initialize_events(self) -> None:
        batch = await self.api.events(None)
        self._cursor = batch.cursor
        self.events_connected = True

    @callback
    def _set_events_connected(self, connected: bool) -> None:
        if self.events_connected != connected:
            self.events_connected = connected
            self.async_update_listeners()

    @callback
    def async_listen_calls(
        self, listener: Callable[[CallEvent], None]
    ) -> Callable[[], None]:
        self._call_listeners.add(listener)
        return lambda: self._call_listeners.discard(listener)

    async def async_run_events(self) -> None:
        """Resume from the last acknowledged cursor; cancellation stops the HTTP request."""
        disconnected = False
        while True:
            try:
                batch = await self.api.events(self._cursor)
                self._set_events_connected(True)
                for event in batch.events:
                    for listener in tuple(self._call_listeners):
                        listener(event)
                self._cursor = batch.cursor
                if disconnected:
                    _LOGGER.info("EVO call connection restored")
                disconnected = False
            except BridgeError:
                self._set_events_connected(False)
                if not disconnected:
                    _LOGGER.warning("EVO call connection lost; reconnecting")
                disconnected = True
                await asyncio.sleep(5)
