import { createFileRoute, redirect } from "@tanstack/react-router"

// Kept for links to the old organization-wide page: the organization as a
// whole is a scope of the Usage page, which this lands on with it picked. No
// sidebar row points here (a rail entry never points at a redirect).
export const Route = createFileRoute("/organization/usage")({
  beforeLoad: () => {
    throw redirect({
      to: "/usage",
      search: { scope: "organization" },
      replace: true,
    })
  },
})
