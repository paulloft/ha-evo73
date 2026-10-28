"""Expose incoming SIP calls as Home Assistant doorbell events."""

from typing import ClassVar

from homeassistant.components.event import EventDeviceClass, EventEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import EvoConfigEntry
from .api import CallEvent
from .coordinator import EvoCoordinator
from .entity import EvoEntity, async_setup_entities


async def async_setup_entry(
    hass: HomeAssistant,
    entry: EvoConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_setup_entities(entry, async_add_entities, EvoDoorbellEvent)


class EvoDoorbellEvent(EvoEntity, EventEntity):
    """One state change per actual call, independent of the optional HTTP webhook."""

    _attr_translation_key = "doorbell"
    _attr_device_class = EventDeviceClass.DOORBELL
    _attr_event_types: ClassVar[list[str]] = ["ring"]

    def __init__(self, coordinator: EvoCoordinator, device_id: int) -> None:
        super().__init__(coordinator, device_id, "doorbell")
        self._last_event_id: str | None = None

    @property
    def available(self) -> bool:
        return (
            self.coordinator.events_connected
            and self.device_id in self.coordinator.data
        )

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(self.coordinator.async_listen_calls(self._handle_call))

    @callback
    def _handle_call(self, event: CallEvent) -> None:
        if event.device_id != self.device_id or event.id == self._last_event_id:
            return
        self._last_event_id = event.id
        self._trigger_event(
            "ring", {"call_id": event.id, "call_timestamp": event.timestamp}
        )
        self.async_write_ha_state()
