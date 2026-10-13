import { describe, expect, it } from "vitest"
import {
  MEMBER_TOTALS_DIMENSIONS,
  MEMBER_TOTALS_FILTERS,
} from "@/features/workspaces/memberVisibility"
import { activitySearch, dimensionsFor, filterApplies } from "./usageQuery"

describe("dimensionsFor", () => {
  const manager = {
    isReadingWorkspaceTotals: false,
    totalsDimensions: MEMBER_TOTALS_DIMENSIONS,
  }
  const member = { ...manager, isReadingWorkspaceTotals: true }

  it("offers a manager every breakdown of the workspace", () => {
    expect(dimensionsFor("workspace", manager)).toEqual([
      "member",
      "model",
      "key",
      "session",
      "channel",
      "provider",
      "policy",
    ])
  })

  it("offers a member's Workspace only the splits its totals allow, in order", () => {
    expect(dimensionsFor("workspace", member)).toEqual(["model", "provider"])
    expect(
      dimensionsFor("workspace", {
        ...member,
        totalsDimensions: [...MEMBER_TOTALS_DIMENSIONS, "source_label"],
      }),
    ).toEqual(["model", "session", "provider"])
  })

  it("leaves a member's own usage whole", () => {
    expect(dimensionsFor("you", member)).toContain("key")
  })
})

describe("filterApplies", () => {
  const model = {
    dimension: "model" as const,
    mode: "exclude" as const,
    values: ["a"],
  }
  const channel = {
    dimension: "channel" as const,
    mode: "include" as const,
    values: ["api"],
  }

  it("applies a filter on an offered breakdown", () => {
    expect(filterApplies(channel, ["model", "channel"])).toBe(true)
    expect(filterApplies(channel, ["model"])).toBe(false)
  })

  it("keeps to the allowlist where there is one", () => {
    expect(
      filterApplies(model, ["model", "channel"], MEMBER_TOTALS_FILTERS),
    ).toBe(true)
    expect(
      filterApplies(channel, ["model", "channel"], MEMBER_TOTALS_FILTERS),
    ).toBe(false)
  })
})

describe("activitySearch", () => {
  const context = {
    scope: "workspace" as const,
    workspaceId: "ws-a",
    ownUserId: "u-me",
    isManager: true,
    canOpenWorkspaceActivity: true,
  }
  const window = { start: "2026-10-01T00:00:00Z" }

  it("opens a manager's Workspace rows in Activity", () => {
    expect(
      activitySearch({
        window,
        context,
        filters: [],
        row: { dimension: "model", key: "gpt-4o" },
      }),
    ).toMatchObject({ start_date: window.start })
  })

  it("opens nothing from a member's Workspace, whose rows Activity cannot list", () => {
    expect(
      activitySearch({
        window,
        context: {
          ...context,
          isManager: false,
          canOpenWorkspaceActivity: false,
        },
        filters: [],
        row: { dimension: "model", key: "gpt-4o" },
      }),
    ).toBeUndefined()
  })
})
