"""One-shot courier access, executed in the add-on rather than Home Assistant."""

from dataclasses import replace

from homeassistant.components.switch import SwitchEntity
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
    async_setup_entities(entry, async_add_entities, EvoCourierSwitch)


class EvoCourierSwitch(EvoEntity, SwitchEntity):
    """Disable on the first real call, including a failed opening attempt."""

    _attr_translation_key = "courier"
    _attr_icon = "mdi:package-variant"

    def __init__(self, coordinator: EvoCoordinator, device_id: int) -> None:
        super().__init__(coordinator, device_id, "courier")

    @property
    def available(self) -> bool:
        return (
            super().available
            and self.coordinator.data[self.device_id].courier_waiting is not None
        )

    @property
    def is_on(self) -> bool:
        device = self.coordinator.data.get(self.device_id)
        return device is not None and device.courier_waiting is True

    async def _set_enabled(self, enabled: bool) -> None:
        state = await self.coordinator.api.set_courier(self.device_id, enabled)
        device = self.coordinator.data.get(self.device_id)
        if device is not None:
            self.coordinator.async_set_updated_data(
                {
                    **self.coordinator.data,
                    self.device_id: replace(device, courier_waiting=state),
                }
            )

    async def async_turn_on(self, **kwargs: object) -> None:
        await self._set_enabled(True)

    async def async_turn_off(self, **kwargs: object) -> None:
        await self._set_enabled(False)
