"""Run with the official Home Assistant image; all EVO traffic stays on localhost."""

import asyncio
import shutil
import tempfile
import unittest
from pathlib import Path

from aiohttp import web
from homeassistant import bootstrap, loader
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry, entity_platform, entity_registry

from custom_components.evo_doorphone.api import BridgeError, EvoApi, NotAuthorized

DOMAIN = "evo_doorphone"


class IntegrationTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.config = tempfile.TemporaryDirectory(prefix="evo-ha-")
        shutil.copytree(
            Path("custom_components"), Path(self.config.name) / "custom_components"
        )
        self.devices = [{"id": 123, "address": "Test entrance", "apartment": 42}]
        self.authorized = True
        self.status = 200
        self.device_status = 200
        self.calls = []
        self.event_requests = 0
        self.event_failures = 0
        self.commands = []
        self.instance_id = "test-addon-instance"
        self.event_signal = asyncio.Event()
        self.runner = web.AppRunner(self._app(), shutdown_timeout=0.1)
        await self.runner.setup()
        self.site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await self.site.start()
        port = self.site._server.sockets[0].getsockname()[1]
        self.url = f"http://127.0.0.1:{port}"
        self.hass = HomeAssistant(self.config.name)
        loader.async_setup(self.hass)
        await bootstrap.async_from_config_dict(
            {"http": {"server_port": 8123}}, self.hass
        )

    async def asyncTearDown(self) -> None:
        await self.hass.async_stop(force=True)
        await self.runner.cleanup()
        self.config.cleanup()

    def _app(self) -> web.Application:
        app = web.Application()
        app.router.add_route("*", "/ha/{path}", self._handle)
        return app

    async def _handle(self, request: web.Request) -> web.Response:
        if not self.authorized:
            return web.json_response({}, status=401)
        if self.status != 200:
            if request.match_info["path"] == "events":
                self.event_failures += 1
            return web.json_response({}, status=self.status)
        match request.match_info["path"]:
            case "info":
                return web.json_response(
                    {"instanceId": self.instance_id, "apiVersion": 1}
                )
            case "devices":
                return web.json_response(
                    {"devices": self.devices}, status=self.device_status
                )
            case "open":
                self.commands.append(await request.json())
                return web.json_response({"status": True})
            case "snapshot":
                return web.Response(body=b"\xff\xd8\xff", content_type="image/jpeg")
            case "stream":
                return web.json_response(
                    {"url": "https://camera.invalid/live?token=preserved"}
                )
            case "events":
                self.event_requests += 1
                cursor = request.query.get("cursor")
                if cursor is not None and int(cursor) == len(self.calls):
                    self.event_signal.clear()
                    try:
                        await asyncio.wait_for(self.event_signal.wait(), 0.1)
                    except TimeoutError:
                        pass
                events = self.calls[int(cursor) :] if cursor is not None else []
                return web.json_response(
                    {"cursor": str(len(self.calls)), "events": events}
                )
        return web.json_response({}, status=404)

    async def _connect(self):
        flow = await self.hass.config_entries.flow.async_init(
            DOMAIN, context={"source": "user"}
        )
        result = await self.hass.config_entries.flow.async_configure(
            flow["flow_id"], {"url": self.url}
        )
        self.assertEqual(result["type"], "create_entry", result)
        entry = result["result"]
        await self.hass.async_block_till_done()
        if entry.state == ConfigEntryState.NOT_LOADED:
            await self.hass.config_entries.async_setup(entry.entry_id)
            await self.hass.async_block_till_done()
        self.assertEqual(entry.state, ConfigEntryState.LOADED)
        return entry

    def _entities(self, domain: str):
        platforms = entity_platform.async_get_platforms(self.hass, DOMAIN)
        return {
            entity_id: entity
            for platform in platforms
            if platform.domain == domain
            for entity_id, entity in platform.entities.items()
        }

    async def _wait(self, predicate) -> None:
        async with asyncio.timeout(10):
            while not predicate():
                await asyncio.sleep(0.01)

    async def test_setup_commands_camera_and_dynamic_devices(self) -> None:
        entry = await self._connect()
        registry = entity_registry.async_get(self.hass)
        entities = entity_registry.async_entries_for_config_entry(
            registry, entry.entry_id
        )
        self.assertEqual(len(entities), 3)
        devices = device_registry.async_entries_for_config_entry(
            device_registry.async_get(self.hass), entry.entry_id
        )
        self.assertEqual(len(devices), 1)
        button_id = next(iter(self._entities("button")))
        await self.hass.services.async_call(
            "button", "press", {"entity_id": button_id}, blocking=True
        )
        self.assertEqual(self.commands, [{"deviceId": 123, "doorNum": 1}])
        camera = next(iter(self._entities("camera").values()))
        self.assertEqual(await camera.async_camera_image(), b"\xff\xd8\xff")
        self.assertEqual(
            await camera.stream_source(), "https://camera.invalid/live?token=preserved"
        )
        self.devices.append({"id": 456, "address": "Another entrance"})
        await entry.runtime_data.async_refresh()
        await self.hass.async_block_till_done()
        self.assertEqual(
            len(
                entity_registry.async_entries_for_config_entry(registry, entry.entry_id)
            ),
            6,
        )
        self.devices = [self.devices[1]]
        await entry.runtime_data.async_refresh()
        await self.hass.async_block_till_done()
        self.assertFalse(camera.available)
        self.assertEqual(len(self.commands), 1)

    async def test_calls_are_deduplicated_and_unload_cancels_subscription(self) -> None:
        entry = await self._connect()
        event = next(iter(self._entities("event").values()))
        await self._wait(lambda: self.event_requests >= 2)
        call = {"id": "call-1", "deviceId": 123, "timestamp": "2026-10-28T12:00:00Z"}
        self.calls.append(call)
        self.event_signal.set()
        await self._wait(lambda: event.state is not None)
        previous = event.state
        self.assertEqual(event.state_attributes["event_type"], "ring")
        self.calls.append(call)
        self.event_signal.set()
        await asyncio.sleep(0.15)
        self.assertEqual(event.state, previous)
        self.calls.append({**call, "id": "call-2"})
        self.event_signal.set()
        await self._wait(lambda: event.state != previous)
        coordinator = entry.runtime_data
        self.assertTrue(await self.hass.config_entries.async_unload(entry.entry_id))
        await self.hass.async_block_till_done()
        requests = self.event_requests
        await asyncio.sleep(0.2)
        self.assertEqual(self.event_requests, requests)
        self.assertFalse(coordinator._call_listeners)

    async def test_flow_errors_duplicate_instance_and_reconfiguration(self) -> None:
        flow = await self.hass.config_entries.flow.async_init(
            DOMAIN, context={"source": "user"}
        )
        result = await self.hass.config_entries.flow.async_configure(
            flow["flow_id"], {"url": "ftp://invalid"}
        )
        self.assertEqual(result["errors"], {"base": "invalid_url"})
        self.authorized = False
        result = await self.hass.config_entries.flow.async_configure(
            flow["flow_id"], {"url": self.url}
        )
        self.assertEqual(result["errors"], {"base": "not_authorized"})
        self.authorized = True
        self.status = 503
        result = await self.hass.config_entries.flow.async_configure(
            flow["flow_id"], {"url": self.url}
        )
        self.assertEqual(result["errors"], {"base": "cannot_connect"})
        self.status = 200
        result = await self.hass.config_entries.flow.async_configure(
            flow["flow_id"], {"url": self.url}
        )
        entry = result["result"]
        await self.hass.async_block_till_done()
        duplicate = await self.hass.config_entries.flow.async_init(
            DOMAIN, context={"source": "user"}, data={"url": self.url + "/"}
        )
        self.assertEqual(duplicate["reason"], "already_configured")
        reconfigure = await self.hass.config_entries.flow.async_init(
            DOMAIN, context={"source": "reconfigure", "entry_id": entry.entry_id}
        )
        self.instance_id = "different-addon"
        wrong = await self.hass.config_entries.flow.async_configure(
            reconfigure["flow_id"], {"url": self.url}
        )
        self.assertEqual(wrong["reason"], "unique_id_mismatch")
        self.instance_id = "test-addon-instance"
        reconfigure = await self.hass.config_entries.flow.async_init(
            DOMAIN, context={"source": "reconfigure", "entry_id": entry.entry_id}
        )
        changed = await self.hass.config_entries.flow.async_configure(
            reconfigure["flow_id"], {"url": self.url + "/"}
        )
        self.assertEqual(changed["reason"], "reconfigure_successful")
        await self.hass.async_block_till_done()
        self.assertEqual(len(self.hass.config_entries.async_entries(DOMAIN)), 1)
        self.assertEqual(entry.data["url"], self.url)

    async def test_outage_recovery_preserves_call_cursor_and_entity_availability(
        self,
    ) -> None:
        entry = await self._connect()
        camera = next(iter(self._entities("camera").values()))
        event = next(iter(self._entities("event").values()))
        await self._wait(lambda: self.event_requests >= 2)
        self.status = 503
        await entry.runtime_data.async_refresh()
        self.assertFalse(camera.available)
        await self._wait(lambda: self.event_failures >= 1)
        self.calls.append(
            {
                "id": "during-outage",
                "deviceId": 123,
                "timestamp": "2026-10-28T12:00:00Z",
            }
        )
        self.status = 200
        self.event_signal.set()
        await entry.runtime_data.async_refresh()
        self.assertTrue(camera.available)
        await self._wait(lambda: event.state is not None)
        self.assertEqual(event.state_attributes["call_id"], "during-outage")

    async def test_device_poll_failure_does_not_silence_sip_calls(self) -> None:
        entry = await self._connect()
        event = next(iter(self._entities("event").values()))
        self.device_status = 503
        await entry.runtime_data.async_refresh()
        self.assertFalse(entry.runtime_data.last_update_success)
        self.assertTrue(event.available)
        self.calls.append(
            {
                "id": "sip-during-api-outage",
                "deviceId": 123,
                "timestamp": "2026-10-28T12:00:00Z",
            }
        )
        self.event_signal.set()
        await self._wait(lambda: event.state is not None)
        self.assertNotIn(
            self.hass.states.get(event.entity_id).state, {"unknown", "unavailable"}
        )

    async def test_api_validation_and_authorization_failures(self) -> None:
        from homeassistant.helpers.aiohttp_client import async_get_clientsession

        api = EvoApi(async_get_clientsession(self.hass), self.url)
        self.devices = [{"id": True, "address": "Invalid"}]
        with self.assertRaises(BridgeError):
            await api.devices()
        self.authorized = False
        with self.assertRaises(NotAuthorized):
            await api.info()


if __name__ == "__main__":
    unittest.main()
