"""Typed client for the local EVO add-on API."""

from dataclasses import dataclass
from typing import cast

import aiohttp
from homeassistant.exceptions import HomeAssistantError
from yarl import URL

from .const import API_VERSION


class BridgeError(HomeAssistantError):
    """The add-on could not complete a request."""


class NotAuthorized(BridgeError):
    """EVO authorization must be completed in the add-on."""


@dataclass(frozen=True, slots=True)
class BridgeInfo:
    instance_id: str


@dataclass(frozen=True, slots=True)
class Doorphone:
    id: int
    address: str
    apartment: str | int | None
    entrance: str | int | None


@dataclass(frozen=True, slots=True)
class CallEvent:
    id: str
    device_id: int
    timestamp: str


@dataclass(frozen=True, slots=True)
class EventBatch:
    cursor: str
    events: tuple[CallEvent, ...]


def normalize_url(value: str) -> str:
    """Require a direct HTTP address, without credentials or query parameters."""
    url = URL(value.strip())
    if (
        url.scheme not in {"http", "https"}
        or not url.host
        or url.user
        or url.query
        or url.fragment
    ):
        raise ValueError("Invalid add-on URL")
    _ = url.port
    return str(url).rstrip("/")


def _record(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        raise BridgeError("Unexpected response from the EVO add-on")
    return cast(dict[str, object], value)


def _string(value: object) -> str:
    if not isinstance(value, str) or not value:
        raise BridgeError("Missing string in the EVO add-on response")
    return value


def _identifier(value: object) -> int:
    if type(value) is not int or value <= 0:
        raise BridgeError("Invalid device ID in the EVO add-on response")
    return value


def _attribute(value: object) -> str | int | None:
    return value if type(value) in {str, int} else None


class EvoApi:
    """Use Home Assistant's shared HTTP session; keep EVO tokens in the add-on."""

    def __init__(self, session: aiohttp.ClientSession, url: str) -> None:
        self.session = session
        self.url = normalize_url(url)

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        payload: dict[str, object] | None = None,
        binary: bool = False,
        timeout: int = 40,
    ) -> object:
        try:
            async with self.session.request(
                method,
                f"{self.url}/ha/{path}",
                params=params,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=timeout),
                allow_redirects=False,
            ) as response:
                if response.status in {401, 403}:
                    raise NotAuthorized("Authorize EVO in the add-on web interface")
                if response.status != 200:
                    raise BridgeError(f"EVO add-on returned HTTP {response.status}")
                if binary:
                    return await response.read()
                return await response.json()
        except (aiohttp.ClientError, TimeoutError, ValueError) as error:
            raise BridgeError("Cannot communicate with the EVO add-on") from error

    async def info(self) -> BridgeInfo:
        body = _record(await self._request("GET", "info"))
        if body.get("apiVersion") != API_VERSION:
            raise BridgeError("Update the EVO add-on: incompatible API version")
        return BridgeInfo(_string(body.get("instanceId")))

    async def devices(self) -> dict[int, Doorphone]:
        body = _record(await self._request("GET", "devices"))
        items = body.get("devices")
        if not isinstance(items, list):
            raise BridgeError("Missing devices in the EVO add-on response")
        devices: dict[int, Doorphone] = {}
        for item in items:
            data = _record(item)
            device = Doorphone(
                _identifier(data.get("id")),
                _string(data.get("address")),
                _attribute(data.get("apartment")),
                _attribute(data.get("entrance")),
            )
            devices[device.id] = device
        return devices

    async def open_door(self, device_id: int) -> None:
        await self._request(
            "POST", "open", payload={"deviceId": device_id, "doorNum": 1}
        )

    async def snapshot(self, device_id: int) -> bytes:
        image = await self._request(
            "GET", "snapshot", params={"deviceId": str(device_id)}, binary=True
        )
        if not isinstance(image, bytes):
            raise BridgeError("Invalid camera image")
        return image

    async def stream(self, device_id: int) -> str:
        body = _record(
            await self._request("GET", "stream", params={"deviceId": str(device_id)})
        )
        source = _string(body.get("url"))
        url = URL(source)
        if url.scheme not in {"http", "https"} or not url.host:
            raise BridgeError("Invalid camera stream URL")
        return source

    async def events(self, cursor: str | None) -> EventBatch:
        params = {"cursor": cursor} if cursor else None
        body = _record(await self._request("GET", "events", params=params))
        items = body.get("events")
        if not isinstance(items, list):
            raise BridgeError("Missing call events in the EVO add-on response")
        events = []
        for item in items:
            event = _record(item)
            events.append(
                CallEvent(
                    _string(event.get("id")),
                    _identifier(event.get("deviceId")),
                    _string(event.get("timestamp")),
                )
            )
        return EventBatch(_string(body.get("cursor")), tuple(events))
