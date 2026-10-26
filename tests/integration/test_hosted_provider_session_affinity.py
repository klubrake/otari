"""``session_affinity`` on a hosted provider: set through the API, carried by the startup move, read at dispatch.

Upstream moves the Deployment providers rows onto hosted providers, and a row
could opt into session affinity, so the hosted provider holds the flag and the
dispatch path reads it there. Model discovery is stubbed; the provider call is
captured at the any-llm boundary.
"""

from collections.abc import Iterator
from typing import Any
from unittest.mock import patch

import pytest
from any_llm.types.messages import MessageResponse, MessageUsage, TextBlock
from any_llm.types.model import Model
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from gateway.core.config import API_ROOT, GatewayConfig
from gateway.models.providers import HostedProvider, ProviderCredential
from gateway.services.model_discovery_service import ProviderDiscovery
from gateway.services.provider_kwargs import SESSION_AFFINITY_HEADER
from gateway.services.secret_box import encrypt_secret, generate_secret_key

from .conftest import shared_test_config

BASETEN_BASE = "https://inference.baseten.co/v1"
PATH = f"{API_ROOT}/hosted-providers"


@pytest.fixture(scope="module")
def test_config(postgres_url: str) -> GatewayConfig:
    """The shared configuration declaring no provider, so nothing configured shadows a hosted one."""
    return shared_test_config(postgres_url, {})


@pytest.fixture(autouse=True)
def _environment(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("OTARI_SECRET_KEY", generate_secret_key())
    yield


@pytest.fixture(autouse=True)
def _discovery(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _stub(impl_name: str, **_: object) -> ProviderDiscovery:
        return ProviderDiscovery(
            provider=impl_name, models=[Model(id="zai-org/GLM-5.3", object="model", created=0, owned_by=impl_name)]
        )

    monkeypatch.setattr("gateway.services.providers._hosted_provider_service.test_provider_credentials", _stub)


def _create(client: TestClient, headers: dict[str, str], **body: Any) -> dict[str, Any]:
    created = client.post(
        PATH,
        json={
            "provider": "openai",
            "name": "baseten",
            "api_key": "sk-b-1234",
            "api_base": BASETEN_BASE,
            # So the stubbed listing's unpriced model is served without a price.
            "serves_unlisted_models": True,
            **body,
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    provider: dict[str, Any] = created.json()
    return provider


def _send(client: TestClient, headers: dict[str, str], model: str) -> dict[str, Any]:
    """POST /messages with the provider call captured, returning the kwargs it was given."""
    captured: dict[str, Any] = {}

    async def fake_amessages(**kwargs: Any) -> MessageResponse:
        captured.update(kwargs)
        return MessageResponse(
            id="msg_1",
            type="message",
            role="assistant",
            content=[TextBlock(type="text", text="ok")],
            model="glm",
            stop_reason="end_turn",
            usage=MessageUsage(input_tokens=3, output_tokens=1),
        )

    body = {
        "model": model,
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 16,
        "prompt_cache_key": "s-42",
    }
    with patch("gateway.api.routes.messages.amessages", new=fake_amessages):
        response = client.post(f"{API_ROOT}/messages", json=body, headers=headers)
    assert response.status_code == 200, response.text
    return captured


def _sent_header(captured: dict[str, Any]) -> str | None:
    headers = (captured.get("client_args") or {}).get("default_headers") or {}
    return headers.get(SESSION_AFFINITY_HEADER)


def test_a_hosted_provider_that_opts_in_sends_the_scoped_key(
    client: TestClient, master_key_header: dict[str, str], api_key_header: dict[str, str]
) -> None:
    created = _create(client, master_key_header, session_affinity=True)
    assert created["session_affinity"] is True

    captured = _send(client, api_key_header, "baseten:zai-org/GLM-5.3")

    assert len(captured["prompt_cache_key"]) == 64
    assert _sent_header(captured) == captured["prompt_cache_key"]


def test_the_setting_is_off_by_default_and_toggles(
    client: TestClient, master_key_header: dict[str, str], api_key_header: dict[str, str]
) -> None:
    assert _create(client, master_key_header)["session_affinity"] is False
    assert _sent_header(_send(client, api_key_header, "baseten:zai-org/GLM-5.3")) is None

    updated = client.patch(f"{PATH}/baseten", json={"session_affinity": True}, headers=master_key_header)
    assert updated.status_code == 200, updated.text
    assert updated.json()["session_affinity"] is True
    assert _sent_header(_send(client, api_key_header, "baseten:zai-org/GLM-5.3")) is not None

    updated = client.patch(f"{PATH}/baseten", json={"session_affinity": False}, headers=master_key_header)
    assert updated.status_code == 200, updated.text
    assert _sent_header(_send(client, api_key_header, "baseten:zai-org/GLM-5.3")) is None


def test_a_provider_whose_client_cannot_carry_the_header_is_refused(
    client: TestClient, master_key_header: dict[str, str]
) -> None:
    created = client.post(
        PATH,
        json={"provider": "mistral", "api_key": "sk-m-1234", "session_affinity": True},
        headers=master_key_header,
    )
    assert created.status_code == 400, created.text
    assert "session_affinity is supported only" in created.text

    _create(client, master_key_header)
    created = client.post(PATH, json={"provider": "mistral", "api_key": "sk-m-1234"}, headers=master_key_header)
    assert created.status_code == 201, created.text
    refused = client.patch(f"{PATH}/mistral", json={"session_affinity": True}, headers=master_key_header)
    assert refused.status_code == 400, refused.text


def test_the_startup_move_keeps_a_stored_providers_setting(
    client: TestClient, master_key_header: dict[str, str], db_session: Session
) -> None:
    for instance, flag in (("baseten", True), ("plain", False)):
        db_session.add(
            ProviderCredential(
                instance=instance,
                provider_type="openai",
                api_base=BASETEN_BASE,
                encrypted_api_key=encrypt_secret(f"sk-{instance}-1234"),
                last4="1234",
                session_affinity=flag,
            )
        )
    db_session.commit()

    moved = client.post(f"{PATH}/migration", headers=master_key_header)
    assert moved.status_code == 200, moved.text

    db_session.expire_all()
    rows = {row.name: row for row in db_session.execute(select(HostedProvider)).scalars()}
    assert (rows["baseten"].session_affinity, rows["plain"].session_affinity) == (True, False)
    assert db_session.execute(select(ProviderCredential)).scalars().all() == []
