import { describe, expect, it } from "vitest"
import {
  askableScopes,
  MEMBER_TOTALS_DIMENSIONS,
  MEMBER_TOTALS_FILTERS,
  type MemberTotalsVisibility,
  memberReach,
  readMemberTotalsVisibility,
  usageScopeFor,
} from "./memberVisibility"

const manager = {
  isManager: true,
  canReadOrganization: false,
  ownUserId: "u-me",
  isFindingOwnUserId: false,
  workspaceId: "ws-a",
}
const member = { ...manager, isManager: false, ownUserId: undefined }

const shown: MemberTotalsVisibility = {
  status: "known",
  visibility: { members_see_workspace_totals: true },
}
const hidden: MemberTotalsVisibility = {
  status: "known",
  visibility: { members_see_workspace_totals: false },
}

describe("the member totals allowlists", () => {
  // Pinned to the server's lists in src/gateway/services/organizations/_visibility.py:
  // a name added here alone is refused there, and drops the member to You.
  it("match the server's breakdowns", () => {
    expect([...MEMBER_TOTALS_DIMENSIONS]).toEqual([
      "model",
      "provider",
      "status_code",
    ])
  })

  it("match the server's filters", () => {
    expect([...MEMBER_TOTALS_FILTERS].sort()).toEqual(
      [
        "counts_toward_budget",
        "end_date",
        "endpoint",
        "exclude_model",
        "exclude_status",
        "model",
        "priced",
        "provider",
        "requested_model",
        "start_date",
        "status",
        "status_code",
        "workspace_id",
      ].sort(),
    )
  })
})

describe("readMemberTotalsVisibility", () => {
  it("reads a failed read as unavailable even over an answer cached earlier", () => {
    expect(
      readMemberTotalsVisibility({
        data: { members_see_workspace_totals: true },
        isError: true,
      }),
    ).toEqual({ status: "unavailable" })
  })

  it("waits while nothing has answered", () => {
    expect(
      readMemberTotalsVisibility({ data: undefined, isError: false }),
    ).toEqual({ status: "pending" })
  })
})

describe("memberReach for a member", () => {
  it("adds the workspace's totals while its managers share them", () => {
    const reach = memberReach(member, shown)
    expect(reach).toMatchObject({
      scopes: ["you", "workspace"],
      isPending: false,
      isHiddenByAdmin: false,
      canReadWorkspaceTotals: true,
      isReadingWorkspaceTotals: true,
      showsSpend: true,
      totalsDimensions: MEMBER_TOTALS_DIMENSIONS,
      canOpenWorkspaceActivity: false,
      canListWorkspaceKeys: false,
      isListingOwnWorkspaceFailures: true,
    })
    expect(reach.totalsFilters.has("model")).toBe(true)
    expect(reach.totalsFilters.has("user_id")).toBe(false)
    expect(usageScopeFor(reach, "workspace")).toBe("workspace_totals")
    expect(usageScopeFor(reach, "you")).toBe("caller")
  })

  it("keeps them to their own usage while the totals are hidden", () => {
    expect(memberReach(member, hidden)).toMatchObject({
      scopes: ["you"],
      isPending: false,
      isHiddenByAdmin: true,
      canReadWorkspaceTotals: false,
      showsSpend: false,
      totalsDimensions: [],
    })
  })

  it("reads nothing of the workspace while its answer is on its way", () => {
    expect(memberReach(member, { status: "pending" })).toMatchObject({
      scopes: ["you"],
      isPending: true,
      isHiddenByAdmin: false,
      canReadWorkspaceTotals: false,
    })
  })

  it("reads a failed answer as hidden, without blaming an admin", () => {
    expect(memberReach(member, { status: "unavailable" })).toMatchObject({
      scopes: ["you"],
      isPending: false,
      isHiddenByAdmin: false,
      canReadWorkspaceTotals: false,
    })
  })

  it("trusts no answer while no workspace is named, and waits on none", () => {
    for (const known of [shown, { status: "pending" } as const]) {
      expect(memberReach({ ...member, workspaceId: "" }, known)).toMatchObject({
        scopes: ["you"],
        isPending: false,
        canReadWorkspaceTotals: false,
      })
    }
  })

  it("asks the server as if the workspace shared its totals", () => {
    expect(askableScopes(member)).toEqual(["you", "workspace"])
  })
})

describe("memberReach for a manager", () => {
  it("reads everything, whatever the setting", () => {
    for (const known of [hidden, { status: "pending" } as const]) {
      expect(memberReach(manager, known)).toMatchObject({
        scopes: ["workspace", "you"],
        isPending: false,
        canReadWorkspaceTotals: true,
        isReadingWorkspaceTotals: false,
        canOpenWorkspaceActivity: true,
        canListWorkspaceKeys: true,
        isListingOwnWorkspaceFailures: false,
      })
    }
    expect(usageScopeFor(memberReach(manager, hidden), "workspace")).toBe(
      "caller",
    )
    expect(usageScopeFor(memberReach(manager, hidden), "organization")).toBe(
      "organization",
    )
  })

  it("adds the organization for someone who manages it", () => {
    expect(
      memberReach({ ...manager, canReadOrganization: true }, shown).scopes,
    ).toEqual(["workspace", "you", "organization"])
  })

  it("drops You for a manager whose own requests cannot be told apart", () => {
    expect(
      memberReach(
        { ...manager, canReadOrganization: true, ownUserId: undefined },
        shown,
      ).scopes,
    ).toEqual(["workspace", "organization"])
  })

  it("keeps You while the roster that names the caller loads", () => {
    expect(
      memberReach(
        { ...manager, ownUserId: undefined, isFindingOwnUserId: true },
        shown,
      ).scopes,
    ).toEqual(["workspace", "you"])
  })
})

describe("readMemberTotalsVisibility", () => {
  it("takes a failure over an answer, and an answer over waiting", () => {
    const visibility = { members_see_workspace_totals: false }
    expect(
      readMemberTotalsVisibility({ data: visibility, isError: false }),
    ).toEqual({ status: "known", visibility })
    expect(
      readMemberTotalsVisibility({ data: undefined, isError: true }),
    ).toEqual({ status: "unavailable" })
    expect(
      readMemberTotalsVisibility({ data: undefined, isError: false }),
    ).toEqual({ status: "pending" })
  })
})
