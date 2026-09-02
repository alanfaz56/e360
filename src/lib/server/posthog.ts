import { PostHog } from "posthog-node";
import { PUBLIC_POSTHOG_PROJECT_TOKEN, PUBLIC_POSTHOG_HOST } from "$env/static/public";

let posthogClient: PostHog | null = null;

/**
 * Returns the shared PostHog Node.js client, creating it on first call.
 *
 * flushAt 1 + flushInterval 0 ensure each capture is sent immediately. This is required
 * for server-side SvelteKit handlers, which are short-lived per request and cannot rely on
 * the default batching to flush before the process ends.
 */
export function getPostHogClient(): PostHog {
	if (!posthogClient) {
		if (!PUBLIC_POSTHOG_PROJECT_TOKEN) {
			if (process.env.NODE_ENV !== "production") {
				throw new Error(
					"PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, " +
						"this causes events to be silently missed. This error stops appearing once " +
						"PUBLIC_POSTHOG_PROJECT_TOKEN is configured",
				);
			}
			// In production, return a no-op stub so the app never crashes.
			return {
				capture: () => {},
				identify: () => {},
				flush: async () => {},
				shutdown: async () => {},
			} as unknown as PostHog;
		}

		posthogClient = new PostHog(PUBLIC_POSTHOG_PROJECT_TOKEN, {
			host: PUBLIC_POSTHOG_HOST,
			flushAt: 1,
			flushInterval: 0,
		});
	}
	return posthogClient;
}
