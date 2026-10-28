"""Configure the local EVO add-on through the Home Assistant UI."""

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.config_entries import ConfigFlowResult
from homeassistant.const import CONF_URL
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import BridgeError, EvoApi, NotAuthorized
from .const import DEFAULT_URL, DOMAIN


class EvoConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Connect to one add-on instance, using its persistent ID to avoid duplicates."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, str] | None = None
    ) -> ConfigFlowResult:
        return await self._configure(user_input, reconfigure=False)

    async def async_step_reconfigure(
        self, user_input: dict[str, str] | None = None
    ) -> ConfigFlowResult:
        return await self._configure(user_input, reconfigure=True)

    async def _configure(
        self, user_input: dict[str, str] | None, *, reconfigure: bool
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        entry = self._get_reconfigure_entry() if reconfigure else None
        default_url = entry.data[CONF_URL] if entry else DEFAULT_URL
        if user_input is not None:
            default_url = user_input[CONF_URL]
            try:
                api = EvoApi(async_get_clientsession(self.hass), default_url)
                info = await api.info()
                await api.devices()
            except ValueError:
                errors["base"] = "invalid_url"
            except NotAuthorized:
                errors["base"] = "not_authorized"
            except BridgeError:
                errors["base"] = "cannot_connect"
            else:
                await self.async_set_unique_id(info.instance_id)
                if entry:
                    self._abort_if_unique_id_mismatch()
                    return self.async_update_reload_and_abort(
                        entry, data_updates={CONF_URL: api.url}
                    )
                self._abort_if_unique_id_configured()
                return self.async_create_entry(
                    title="EVO Doorphone", data={CONF_URL: api.url}
                )

        return self.async_show_form(
            step_id="reconfigure" if reconfigure else "user",
            data_schema=vol.Schema({vol.Required(CONF_URL, default=default_url): str}),
            errors=errors,
        )
