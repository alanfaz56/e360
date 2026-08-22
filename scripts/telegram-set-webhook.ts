/**
 * One-off: register this app's Telegram webhook with Telegram's servers.
 *
 * Telegram never calls a URL nobody told it about — adding the bot token and webhook secret in
 * /panel/ajustes is not enough on its own, this is the missing step that actually points the bot
 * at us. Re-run it any time the public URL changes (new deploy, new ngrok tunnel).
 *
 * Uso:
 *   tsx --tsconfig scripts/tsconfig.json scripts/telegram-set-webhook.ts [URL]
 *
 * URL opcional — por defecto usa BETTER_AUTH_URL del entorno. DEBE ser https y alcanzable desde
 * internet: localhost no sirve ni en desarrollo (usa una tunnel, ej. ngrok, y pasa esa URL aquí).
 *
 * Requiere en el entorno: DATABASE_URL, AJUSTES_SECRET_KEY (para leer las credenciales guardadas
 * en /panel/ajustes).
 */
import "dotenv/config";
import { registrarWebhook } from "../src/lib/server/canales/telegram.js";

const base = process.argv[2] ?? process.env.BETTER_AUTH_URL;
if (!base) {
	console.error("Falta la URL pública. Pásala como argumento o define BETTER_AUTH_URL.");
	process.exit(1);
}
if (!base.startsWith("https://")) {
	console.error(`"${base}" no es https — Telegram rechaza cualquier otra cosa. Usa una URL pública real.`);
	process.exit(1);
}

const url = `${base.replace(/\/$/, "")}/api/telegram/webhook`;

await registrarWebhook(url);
console.log(`Webhook de Telegram registrado: ${url}`);
console.log("Prueba mandando /start al bot desde Telegram.");
