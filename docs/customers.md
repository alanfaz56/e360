## Rule 7 — Speed and compatibility

- Prerender anything static (`export const prerender = true`). The landing page is one
  static HTML file with zero client JS.
- Forms are real `<form method="POST">` + SvelteKit actions, so they work with JavaScript
  disabled and on old phones in the shop. Add JS enhancement on top, never as a requirement.
- No new runtime dependency for something a few lines of stdlib or a native platform
  feature already covers.
- Style with the Tailwind tokens in [src/routes/layout.css](src/routes/layout.css). Do not
  introduce raw hex values in components — the palette comes from the customer's brand.

---
