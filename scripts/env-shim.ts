// Stand-in for SvelteKit's `$env/dynamic/private` virtual module, used ONLY by scripts run
// through `scripts/tsconfig.json` under tsx. It is never loaded by the real app — Vite resolves
// `$env/dynamic/private` through its own plugin and never consults tsconfig `paths`, so this file
// has zero effect on `npm run dev`/`build`/`check`.
export const env: Record<string, string | undefined> = process.env;
