/**
 * Generate a VAPID keypair for Web Push. Run: npm run vapid
 *
 * The pair identifies THIS application server to the browsers' push services. Rotating it
 * invalidates every existing subscription — every device has to be re-registered — so generate
 * once per environment and keep the private key out of the repo.
 */
import { generarVapid } from "../src/lib/webpush.js";

const { publicKey, privateKey } = generarVapid();

console.log("\nAgrega esto a tu .env:\n");
console.log(`VAPID_PUBLIC_KEY="${publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${privateKey}"`);
console.log(`VAPID_SUBJECT="mailto:soporte@estacion360.mx"`);
console.log(
	"\nLa llave privada NO se comparte ni se sube al repositorio. Cambiarla invalida todas las\n" +
		"suscripciones existentes: cada dispositivo tendría que volver a activar los avisos.\n",
);
