"""What the API key a request authenticates with has spent, and what it may still spend.

An application that gives each of its users a key of their own needs to show
that user where they stand without holding the master key, which a hosted
tenant does not have. These reads answer for the calling key alone: the key is
the credential, so no parameter names a user, a key or a workspace, and none
can widen what a key sees.

The aggregation is the usage service's and the caps are the budget gate's, so a
number read here is the number the operator's views and the gate work from.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from gateway.api.deps import BudgetServiceDep, CallingKey, UsageReadServiceDep, get_config, verify_api_key
from gateway.api.routes._usage_common import (
    DIMENSIONS_DESC,
    SERIES_GROUP_BY_DESC,
    SUMMARY_BUCKET_DESC,
    GroupByTag,
    UsageReadFilters,
    summary_window,
)
from gateway.core.config import GatewayConfig
from gateway.core.sql import UsageBucketGrain
from gateway.core.usage_filters import UsageCondition, key_rows
from gateway.models.api_keys import APIKey
from gateway.schemas.budgets import KeyBudgetPublic
from gateway.schemas.usage import Bucket, SeriesGroupBy, SummaryDimension, UsageGroupedSeries, UsageSummary

# An API key and nothing else, declared on the router so a route added here inherits it.
router = APIRouter(prefix="/key", tags=["key"], dependencies=[Depends(verify_api_key)])


def _own_rows(api_key: APIKey) -> UsageCondition:
    """The rows this key wrote, in the workspace it bills to."""
    return key_rows(api_key.id, api_key.workspace_id)


@router.get("/budget")
async def get_key_budget(
    api_key: CallingKey,
    budgets: BudgetServiceDep,
    config: Annotated[GatewayConfig, Depends(get_config)],
) -> KeyBudgetPublic:
    """What the calling key may still spend, and every cap that decides it.

    Lists the budget the key's user is on and each spend ceiling on a scope the
    key bills to (the key itself, its user's memberships, its workspace and its
    organization), as the budget gate counts them: recorded use plus the holds of
    requests in flight. A period that has ended reads as the fresh one the next
    request starts. ``remaining_usd`` is the least any cap on every provider
    leaves, which is what a request can still spend before a 403. Caps shared with
    the rest of the workspace or organization report only what they leave.
    """
    return await budgets.key_budget(api_key, strategy=config.budget_strategy)


@router.get("/usage/summary")
async def get_key_usage_summary(
    api_key: CallingKey,
    reads: UsageReadServiceDep,
    filters: Annotated[UsageReadFilters, Depends()],
    bucket: UsageBucketGrain = Query(default="day", description=SUMMARY_BUCKET_DESC),
    dimensions: list[SummaryDimension] | None = Query(default=None, description=DIMENSIONS_DESC),
    group_by_tag: GroupByTag = None,
) -> UsageSummary:
    """Spend, tokens and request volume of the calling key's own requests.

    The same summary as ``GET /api/v1/usage/summary``, over the rows this key
    wrote alone: the same bounded window (default last 30 days), breakdowns, tag
    filters and ``group_by_tag``. Tag a request with ``metadata`` and pass
    ``group_by_tag`` to read what each kind of request cost. A filter can narrow
    the key's rows and never reach another key's.
    """
    start, end = summary_window(filters, grid=bucket if bucket == "5min" else None)
    return await reads.summary(
        start=start,
        end=end,
        conditions=filters.conditions(start_date=start, end_date=end, scope=_own_rows(api_key)),
        status=filters.status,
        bucket=bucket,
        dimensions=dimensions,
        group_by_tag=group_by_tag,
    )


@router.get("/usage/series")
async def get_key_usage_series(
    api_key: CallingKey,
    reads: UsageReadServiceDep,
    filters: Annotated[UsageReadFilters, Depends()],
    group_by: SeriesGroupBy = Query(description=SERIES_GROUP_BY_DESC),
    bucket: Bucket = Query(default="day", description="Time-series granularity: 'hour' or 'day'"),
) -> UsageGroupedSeries:
    """The calling key's own requests over time, split by one dimension.

    The same series as ``GET /api/v1/usage/series``, over the rows this key wrote
    alone, kept in lockstep with the summary above.
    """
    start, end = summary_window(filters, grid=bucket)
    return await reads.grouped_series(
        start=start,
        end=end,
        conditions=filters.conditions(start_date=start, end_date=end, scope=_own_rows(api_key)),
        status=filters.status,
        bucket=bucket,
        group_by=group_by,
    )
