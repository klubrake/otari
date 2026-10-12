import type { ProviderHealth } from "@/client"
import { Dot } from "@/design-system/indicators/Dot"

/**
 * The deployment's providers and whether each answers, for its operator. A
 * provider that answers but lists no models is told apart from one that is
 * down, as the Providers page tells them apart.
 */
export function ProvidersPanel({
  providers,
  isError,
}: {
  providers: ProviderHealth[] | undefined
  isError: boolean
}) {
  return (
    <div className="mb-6 flex flex-col">
      <h2 className="text-title">Providers</h2>
      <span className="text-caption text-subtle">
        Reachability, checked every hour.
      </span>
      {isError ? (
        <p className="mt-2 text-caption">
          Provider health could not be loaded.
        </p>
      ) : providers && providers.length === 0 ? (
        <p className="mt-2 text-caption">No providers configured.</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {(providers ?? []).map((provider) => {
            const isDegraded = !provider.ok && provider.discovery_unsupported
            return (
              <li
                key={provider.instance}
                className="flex items-center gap-2 border-t border-border-subtle py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-mono-caption">
                  {provider.instance}
                </span>
                <Dot className={provider.ok ? "bg-success" : "bg-danger"} />
                <span
                  className={`text-mono-caption ${
                    provider.ok || isDegraded ? "text-muted" : "text-danger"
                  }`}
                >
                  {provider.ok
                    ? "OK"
                    : isDegraded
                      ? "NO MODEL LIST"
                      : "UNREACHABLE"}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
