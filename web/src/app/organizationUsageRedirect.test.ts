import { isRedirect } from "@tanstack/react-router"
import { describe, expect, it } from "vitest"

import { Route } from "@/routes/organization.usage"

describe("/organization/usage", () => {
  it("lands on the Usage page with the organization scope picked", () => {
    let thrown: unknown
    try {
      Route.options.beforeLoad?.({} as never)
    } catch (error) {
      thrown = error
    }
    expect(isRedirect(thrown)).toBe(true)
    expect((thrown as { options: unknown }).options).toMatchObject({
      to: "/usage",
      search: { scope: "organization" },
      replace: true,
    })
  })
})
