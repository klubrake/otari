"""The routing domain's service: what callers get from routing, read for one organization."""

import uuid
from collections import Counter, defaultdict
from collections.abc import Collection
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from gateway.core.config import GatewayConfig
from gateway.services.catalog import catalog_models
from gateway.services.tools import provider_tools
from gateway.services.usage_and_telemetry import ServedTraffic, TrafficReach, UsageService

FALLBACK_WINDOW = timedelta(days=30)
"""How far back the automatic fallbacks look for traffic."""


@dataclass(frozen=True)
class FallbackOffering:
    """One offering a catalog ID tries, and who runs the built-in tools on it."""

    selector: str
    provider: str
    """The instance the selector names."""
    provider_type: str
    own_tools: tuple[str, ...]
    """Built-in tools the provider runs itself."""
    otari_tools: tuple[str, ...]
    """Built-in tools Otari runs in the provider's place."""


@dataclass(frozen=True)
class KeyRequests:
    """How many requests one key sent."""

    api_key_id: str
    requests: int


def _most_first(counts: Counter[str]) -> tuple[KeyRequests, ...]:
    return tuple(
        KeyRequests(api_key_id=key, requests=n) for key, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    )


@dataclass(frozen=True)
class StepOutcome:
    """What one step of a plan did: the requests it served, and the attempts on it that failed."""

    position: int
    served: int
    failed: int


@dataclass(frozen=True)
class NameTraffic:
    """The traffic one owner sent under one name in one workspace."""

    workspace_id: uuid.UUID
    name: str
    user_id: str | None
    """Whose requests these are; the owner of a policy of their own is matched on it."""
    requests: int
    sent_by: tuple[KeyRequests, ...]
    """The keys that sent them, most first."""
    steps: tuple[StepOutcome, ...]
    """By position in the plan, first first."""


@dataclass(frozen=True)
class AutomaticFallback:
    """One model callers used in the window, its offerings in the order a catalog ID tries them, and its traffic."""

    id: str
    name: str
    offerings: tuple[FallbackOffering, ...]
    requests: int
    fell_back: int
    """Of ``requests``, the successful ones a later offering served."""
    pinned: int
    """Of ``requests``, those that did not send the catalog ID and so had no automatic fallback."""
    pinned_provider: str | None
    """The instance most of the pinned requests reached."""
    sent_by: tuple[KeyRequests, ...] = ()
    """The keys the reader may see that sent ``requests``, most first."""


@dataclass
class _Tally:
    requests: int = 0
    fell_back: int = 0
    pinned: Counter[str] = field(default_factory=Counter)
    keys: Counter[str] = field(default_factory=Counter)


def _served_selectors(row: ServedTraffic) -> tuple[str, ...]:
    """The spellings of the offering a row reached: ``provider:model``, or the whole selector an older row carries."""
    return (f"{row.provider}:{row.model}", row.model) if row.provider else (row.model,)


class RoutingService:
    """What routing gives an organization's callers."""

    def __init__(self, config: GatewayConfig, usage: UsageService) -> None:
        self._config = config
        self._usage = usage

    async def name_traffic(
        self, *, reach: TrafficReach, names: Collection[str], api_key_ids: Collection[str] | None = None
    ) -> list[NameTraffic]:
        """The traffic sent under these names in the window, per workspace and owner, among the rows ``reach`` shows.

        A request counts once, on the row that ended it; each attempt before it
        that a later one recovered from counts as a failure of its step. A step
        served the requests whose final, successful attempt it made.
        """
        rows = await self._usage.name_attempts(
            reach=reach, since=datetime.now(UTC) - FALLBACK_WINDOW, names=names, api_key_ids=api_key_ids
        )
        requests: Counter[tuple[uuid.UUID, str, str | None]] = Counter()
        keys: defaultdict[tuple[uuid.UUID, str, str | None], Counter[str]] = defaultdict(Counter)
        steps: defaultdict[tuple[uuid.UUID, str, str | None], defaultdict[int, list[int]]] = defaultdict(
            lambda: defaultdict(lambda: [0, 0])
        )
        for row in rows:
            group = (row.workspace_id, row.name, row.user_id)
            step = steps[group][row.position]
            if row.status == "success":
                step[0] += row.attempts
            else:
                step[1] += row.attempts
            if row.status != "absorbed":
                requests[group] += row.attempts
                if row.api_key_id is not None:
                    keys[group][row.api_key_id] += row.attempts
        traffic = [
            NameTraffic(
                workspace_id=workspace_id,
                name=name,
                user_id=user_id,
                requests=requests[(workspace_id, name, user_id)],
                sent_by=_most_first(keys[(workspace_id, name, user_id)]),
                steps=tuple(
                    StepOutcome(position=position, served=served, failed=failed)
                    for position, (served, failed) in sorted(steps[(workspace_id, name, user_id)].items())
                ),
            )
            for workspace_id, name, user_id in steps
        ]
        return sorted(traffic, key=lambda item: (item.name, str(item.workspace_id), item.user_id or ""))

    async def automatic_fallbacks(
        self,
        *,
        organization_id: uuid.UUID,
        workspace_ids: Collection[uuid.UUID],
        reach: TrafficReach | None = None,
        api_key_ids: Collection[str] | None = None,
    ) -> list[AutomaticFallback]:
        """Every model these workspaces sent requests to in the window, most requested first.

        A request that sent the model's catalog ID tried its offerings in the
        catalog's order for this organization (``resolve_catalog_offerings``),
        moving to the next when one failed; one that named an offering itself
        (``bedrock:…``) or a routing policy is counted as pinned. A row is
        matched to a model by the catalog ID it sent, else by the offering it
        reached, so traffic on an offering the catalog no longer serves is left
        out. The order is the catalog's, before a key's allow-list or a missing
        credential drops an offering from a request's plan.

        Each model names the keys that sent it where ``reach`` lets the reader
        see whose requests they are, and ``api_key_ids`` narrows the traffic to
        those keys' requests among the same.
        """
        traffic = await self._usage.served_traffic(
            workspace_ids=workspace_ids,
            since=datetime.now(UTC) - FALLBACK_WINDOW,
            reach=reach,
            api_key_ids=api_key_ids,
        )
        models = {model.id: model for model in catalog_models(organization_id=organization_id)}
        model_of = {selector: model.id for model in models.values() for selector in model.offerings}
        tallies: dict[str, _Tally] = {}
        for row in traffic:
            sent = (row.policy_name or "").lower()
            reached = next((selector for selector in _served_selectors(row) if selector in model_of), None)
            model_id = sent if sent in models else model_of.get(reached or "")
            if model_id is None:
                continue
            tally = tallies.setdefault(model_id, _Tally())
            tally.requests += row.requests
            tally.fell_back += row.fell_back
            if row.api_key_id is not None:
                tally.keys[row.api_key_id] += row.requests
            if sent != model_id:
                tally.pinned[row.provider or (reached or row.model).partition(":")[0]] += row.requests

        tools: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {}

        def offering(selector: str) -> FallbackOffering:
            instance = selector.partition(":")[0]
            provider_type = self._config.provider_instance_type(instance)
            if provider_type not in tools:
                answer = provider_tools(self._config, provider_type)
                tools[provider_type] = (tuple(sorted(answer.native)), tuple(sorted(answer.claimed)))
            own, otari = tools[provider_type]
            return FallbackOffering(
                selector=selector, provider=instance, provider_type=provider_type, own_tools=own, otari_tools=otari
            )

        fallbacks = [
            AutomaticFallback(
                id=model_id,
                name=models[model_id].name,
                offerings=tuple(offering(selector) for selector in models[model_id].offerings),
                requests=tally.requests,
                fell_back=tally.fell_back,
                pinned=sum(tally.pinned.values()),
                pinned_provider=tally.pinned.most_common(1)[0][0] if tally.pinned else None,
                sent_by=_most_first(tally.keys),
            )
            for model_id, tally in tallies.items()
            if tally.requests > 0
        ]
        return sorted(fallbacks, key=lambda fallback: (-fallback.requests, fallback.id))
