"""The dispatch-path copy of which hosted provider names are not an implementation's own.

A request reaches a hosted provider named ``openai-eu`` as ``openai-eu:gpt-4o``,
and selector resolution is synchronous and holds no session
(``services/provider_kwargs``), so the names are held in a process-wide map to
the implementation serving each, refreshed on a TTL and right after a write, as
``_provider_endpoint_cache`` is. A write reaches its own worker at once and
every other worker within ``HOSTED_NAME_INDEX_TTL_SECONDS``. A name that is its
implementation's own needs no entry: any-llm already reads it.

Only the names live here, never a credential: the credential is resolved per
request through ``ModelProviderPort``, as for any hosted provider. Beside them
sit the names that opted into session affinity, read on the same path and kept
current the same way.
"""

import asyncio

from gateway.core.config import GatewayConfig
from gateway.core.database import DATABASE_ERRORS, describe_database_error
from gateway.core.unit_of_work import UnitOfWork, create_unit_of_work
from gateway.log_config import logger
from gateway.repositories.providers import HostedProviderRepository

HOSTED_NAME_INDEX_TTL_SECONDS = 30.0

# name -> any-llm implementation, for each hosted provider named otherwise than its implementation
_names: dict[str, str] = {}
# Writes this worker made, numbered, so a refresh whose read began before one
# replays it rather than overwriting it with an older snapshot. name ->
# (write number, implementation, or None for a name removed).
_write_count = 0
_recent_writes: dict[str, tuple[int, str | None]] = {}
# Each hosted provider that forwards the scoped prompt cache key as
# ``x-session-affinity``, with this worker's own writes kept as above.
_affinity: frozenset[str] = frozenset()
_recent_affinity: dict[str, tuple[int, bool]] = {}


def hosted_implementation(name: str) -> str | None:
    """The implementation serving the hosted provider ``name``, or None when ``name`` is no such provider."""
    return _names.get(name)


def hosted_session_affinity(name: str) -> bool:
    """Whether the hosted provider ``name`` forwards the scoped prompt cache key as ``x-session-affinity``."""
    return name in _affinity


def remember_session_affinity(name: str, enabled: bool) -> None:
    """Record a hosted provider's session affinity setting, as this worker just wrote it."""
    global _write_count, _affinity  # noqa: PLW0603

    _write_count += 1
    _recent_affinity[name] = (_write_count, enabled)
    _affinity = _affinity | {name} if enabled else _affinity - {name}


def _record_write(name: str, implementation: str | None) -> None:
    global _write_count  # noqa: PLW0603

    _write_count += 1
    _recent_writes[name] = (_write_count, implementation)
    if implementation is None:
        _names.pop(name, None)
    else:
        _names[name] = implementation


def remember_hosted_name(name: str, implementation: str) -> None:
    """Record a hosted provider this worker just created."""
    _record_write(name, implementation if name != implementation else None)


def forget_hosted_name(name: str) -> None:
    """Drop a hosted provider this worker just removed."""
    _record_write(name, None)
    remember_session_affinity(name, False)


async def refresh_hosted_name_index(uow: UnitOfWork, config: GatewayConfig) -> None:
    """Reload the names from the rows and the ``hosted_providers:`` block, and swap the map in one step.

    A row wins over an entry of the same name, as everywhere else. A write
    this worker made while the read was in flight is newer than what the read
    saw, so it is replayed over the snapshot rather than lost.
    """
    global _names, _recent_writes, _affinity, _recent_affinity  # noqa: PLW0603

    read_from = _write_count
    async with uow:
        rows = await HostedProviderRepository(uow).list_all()
    names = {name: entry.provider for name, entry in config.hosted_provider_entries().items()}
    names.update({row.name: row.provider for row in rows})
    fresh = {name: implementation for name, implementation in names.items() if name != implementation}
    newer = {name: write for name, write in _recent_writes.items() if write[0] > read_from}
    for name, (_, implementation) in newer.items():
        if implementation is None:
            fresh.pop(name, None)
        else:
            fresh[name] = implementation
    _names, _recent_writes = fresh, newer
    affinity = {row.name for row in rows if row.session_affinity}
    newer_affinity = {name: write for name, write in _recent_affinity.items() if write[0] > read_from}
    for name, (_, enabled) in newer_affinity.items():
        if enabled:
            affinity.add(name)
        else:
            affinity.discard(name)
    _affinity, _recent_affinity = frozenset(affinity), newer_affinity


def reset_hosted_name_index() -> None:
    """Drop the map so the next load starts clean (startup and tests)."""
    global _names, _recent_writes, _affinity, _recent_affinity  # noqa: PLW0603

    _names, _recent_writes = {}, {}
    _affinity, _recent_affinity = frozenset(), {}


async def _refresh_on_a_session_of_its_own(config: GatewayConfig) -> None:
    async with create_unit_of_work() as uow:
        await refresh_hosted_name_index(uow, config)


async def load_hosted_names_at_startup(config: GatewayConfig) -> None:
    """Prime the map before the first request. A failure is logged, not raised."""
    reset_hosted_name_index()
    try:
        await _refresh_on_a_session_of_its_own(config)
    except DATABASE_ERRORS as exc:
        # By class only: a database error's message can carry the row it read.
        logger.error(
            "Failed to load hosted provider names (%s); a named hosted provider is unreachable until the next refresh",
            describe_database_error(exc),
        )
    except Exception:
        logger.exception("Failed to load hosted provider names; a named hosted provider is unreachable until then")


async def run_hosted_name_refresher(config: GatewayConfig, interval: float = HOSTED_NAME_INDEX_TTL_SECONDS) -> None:
    """Reload the map forever, so another worker's writes arrive. Every error is retried next tick."""
    while True:
        await asyncio.sleep(interval)
        try:
            await _refresh_on_a_session_of_its_own(config)
        except asyncio.CancelledError:
            raise
        except DATABASE_ERRORS as exc:
            logger.warning(
                "Hosted provider name refresh failed (%s); retrying in %ss", describe_database_error(exc), interval
            )
        except Exception:
            logger.warning("Hosted provider name refresh failed; retrying in %ss", interval, exc_info=True)
