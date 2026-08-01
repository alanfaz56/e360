import { env } from "$env/dynamic/private";
import { getRequestEvent } from "$app/server";
import { sveltekitCookies } from "better-auth/svelte-kit";
import prisma from "./prisma";
import { createAuth } from "./server/bootstrap";

// `sveltekitCookies` writes better-auth's Set-Cookie headers onto SvelteKit's cookie jar,
// so form actions calling auth.api.* directly still establish a session. Must stay last.
export const auth = createAuth(prisma, env, [sveltekitCookies(getRequestEvent)]);
