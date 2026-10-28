"""Shared device identity and dynamic entity setup."""

from collections.abc import Callable
from typing import TYPE_CHECKING

from homeassistant.core import callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import EvoCoordinator

if TYPE_CHECKING:
    from . import EvoConfigEntry


class EvoEntity(CoordinatorEntity[EvoCoordinator]):
    """Group the button, camera and doorbell event under one physical device."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: EvoCoordinator, device_id: int, key: str) -> None:
        super().__init__(coordinator)
        self.device_id = device_id
        self._attr_unique_id = f"{coordinator.instance_id}_{device_id}_{key}"
        device = coordinator.data[device_id]
        name = device.address
        if device.entrance is not None:
            name += f", {device.entrance}"
        if device.apartment is not None:
            name += f", {device.apartment}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, f"{coordinator.instance_id}_{device_id}")},
            name=name,
            manufacturer="EVO",
            model="Doorphone",
            configuration_url=coordinator.api.url,
        )

    @property
    def available(self) -> bool:
        return super().available and self.device_id in self.coordinator.data


@callback
def async_setup_entities(
    entry: "EvoConfigEntry",
    async_add_entities: AddConfigEntryEntitiesCallback,
    factory: Callable[[EvoCoordinator, int], EvoEntity],
) -> None:
    """Add new devices after refresh without duplicating existing entities."""
    coordinator = entry.runtime_data
    known: set[int] = set()

    @callback
    def add_new_devices() -> None:
        new_ids = coordinator.data.keys() - known
        async_add_entities(
            [factory(coordinator, device_id) for device_id in sorted(new_ids)]
        )
        known.update(new_ids)

    add_new_devices()
    entry.async_on_unload(coordinator.async_add_listener(add_new_devices))
