"""Doorphone snapshots and live streams."""

from homeassistant.components.camera import Camera, CameraEntityFeature
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
    async_setup_entities(entry, async_add_entities, EvoCamera)


class EvoCamera(EvoEntity, Camera):
    """Fetch fresh stream URLs instead of persisting expiring EVO links."""

    _attr_translation_key = "camera"
    _attr_supported_features = CameraEntityFeature.STREAM
    _attr_frame_interval = 20

    def __init__(self, coordinator: EvoCoordinator, device_id: int) -> None:
        Camera.__init__(self)
        EvoEntity.__init__(self, coordinator, device_id, "camera")

    async def async_camera_image(
        self, width: int | None = None, height: int | None = None
    ) -> bytes | None:
        return await self.coordinator.api.snapshot(self.device_id)

    async def stream_source(self) -> str | None:
        return await self.coordinator.api.stream(self.device_id)
