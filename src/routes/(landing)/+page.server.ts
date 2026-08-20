// ponytail: landing is static — no DB round-trip, no SSR cost. Prerendered to one HTML file.
// The prisma `configurations` query that lived here was starter scaffolding; move it to
// whatever route actually reads config.
export const prerender = true;
