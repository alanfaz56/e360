import { auth } from "$lib/auth";
import { toSvelteKitHandler } from "better-auth/svelte-kit";
import type { RequestHandler } from "./$types";

const handler = toSvelteKitHandler(auth) as RequestHandler;

export const GET = handler;
export const POST = handler;
