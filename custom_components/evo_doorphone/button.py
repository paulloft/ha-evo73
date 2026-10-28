"""Open a door through the EVO add-on."""

from homeassistant.components.button import ButtonEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import EvoConfigEntry
from .coordinator import EvoCoordinator
from .entity import EvoEntity, async_setup_entities


async def async_setup_entry(
    hass: HomeAssistant,
    entry: EvoConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_setup_entities(entry, async_add_entities, EvoOpenDoorButton)


class EvoOpenDoorButton(EvoEntity, ButtonEntity):
    """A momentary action, not a lock with an invented open/closed state."""

    _attr_translation_key = "open_door"
    _attr_icon = "mdi:door-open"

    def __init__(self, coordinator: EvoCoordinator, device_id: int) -> None:
        super().__init__(coordinator, device_id, "open_door")

    async def async_press(self) -> None:
        await self.coordinator.api.open_door(self.device_id)
