import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		// Vite blocks unrecognized Host headers by default (DNS-rebinding protection). Needed so an
		// ngrok tunnel can reach dev — for webhooks (Telegram, WhatsApp) that require a real public
		// HTTPS URL. The leading dot matches any subdomain, so a fresh free-tier ngrok URL (it
		// rotates on every restart) keeps working without editing this file again.
		allowedHosts: [".ngrok-free.app"],
	},
});
