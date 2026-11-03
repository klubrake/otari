"""``policy_names_in``: the policy names a write in one workspace can collide with or chain through."""

import time
import uuid
from collections.abc import Iterator

import pytest

from gateway.core.config import GatewayConfig
from gateway.models.routing import PolicySpec, RoutingConfig
from gateway.services import policy_store
from gateway.services.policy_store import all_policy_names, policy_names_in, reset_policy_cache

_SPEC = PolicySpec.model_validate({"select": [{"default": "anthropic:claude-haiku-4"}]})
_WORKSPACE = uuid.UUID("00000000-0000-4000-8000-00000000d3fa")
_OTHER = uuid.UUID("00000000-0000-4000-8000-0000000007e5")


def _config(*, enabled: bool = True) -> GatewayConfig:
    return GatewayConfig(
        providers={"anthropic": {"api_key": "sk-ant"}},
        routing=RoutingConfig.model_validate(
            {"enabled": enabled, "policies": {"configured": {"select": [{"default": "anthropic:claude-opus-4"}]}}}
        ),
    )


@pytest.fixture(autouse=True)
def _clean_cache() -> Iterator[None]:
    reset_policy_cache()
    yield
    reset_policy_cache()


def _prime(workspace_id: uuid.UUID, names: list[str], per_user: dict[str, list[str]]) -> None:
    """Stand in for a database load: one workspace's stored policies, workspace-wide and per user."""
    policy_store._cache.setdefault(workspace_id, {}).update(dict.fromkeys(names, _SPEC))
    for user_id, scoped in per_user.items():
        policy_store._user_cache.setdefault(workspace_id, {}).setdefault(user_id, {}).update(
            dict.fromkeys(scoped, _SPEC)
        )
    policy_store._cached_at = time.monotonic()


def test_a_workspaces_names_are_its_own_and_its_users_plus_the_configured_ones() -> None:
    _prime(_WORKSPACE, ["shared"], {"u-sam": ["sams"]})
    _prime(_OTHER, ["elsewhere"], {"u-kim": ["kims"]})
    config = _config()

    assert policy_names_in(config, _WORKSPACE) == {"configured", "shared", "sams"}
    # Another workspace's names, user-scoped or not, never count here.
    assert policy_names_in(config, _OTHER) == {"configured", "elsewhere", "kims"}
    assert all_policy_names(config) == {"configured", "shared", "sams", "elsewhere", "kims"}


def test_with_routing_off_no_name_is_a_policy() -> None:
    """Resolution is off, so no policy claims a name, as ``all_policy_names`` already says."""
    _prime(_WORKSPACE, ["shared"], {"u-sam": ["sams"]})
    config = _config(enabled=False)

    assert policy_names_in(config, _WORKSPACE) == set()
    assert all_policy_names(config) == set()
