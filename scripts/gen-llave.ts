/**
 * A key for `AJUSTES_SECRET_KEY`. Run: npm run llave
 *
 * It encrypts the credentials stored in the `ajuste` table — the PAC's API key and secret today,
 * Stripe and the AI providers later. It lives in the environment and NOT in the database, which is
 * the whole point: a dump of the database is then not a set of credentials.
 *
 * **Rotating it makes every stored secret unreadable.** There is no re-encrypt step and there
 * deliberately is not one: a migration that decrypts with the old key needs the old key, which
 * means keeping it around, which is most of the way back to not having rotated. If you rotate,
 * re-enter the credentials on the settings screen — it takes a minute and it is honest.
 */
import { generarLlave } from "../src/lib/server/cifrado.js";

console.log(`
Llave para AJUSTES_SECRET_KEY. Guárdala en el .env del servidor:

AJUSTES_SECRET_KEY="${generarLlave()}"

Cámbiala y los secretos ya guardados dejan de poder leerse: hay que volver
a capturarlos en /panel/ajustes.
`);
