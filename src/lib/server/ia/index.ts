/**
 * AI provider dispatch. One entry point, `generarNarrativa`, picks the configured provider
 * (`ia.proveedor`) and calls its SDK directly — no abstraction beyond that, there is exactly
 * one caller (the nota report) and exactly one thing it asks the model to do.
 *
 * Every call is time-boxed well under the route's `maxDuration` so a hung provider fails fast
 * instead of exhausting the whole Vercel function budget, and every call reports normalized
 * token usage so the caller can log it to `ia_uso` regardless of which provider answered.
 */

import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import prisma from "$lib/prisma";
import { ClienteError } from "$lib/server/clientes";
import { valorAjuste } from "$lib/server/ajustes";

const TIMEOUT_MS = 45_000;

export type ProveedorIA = "anthropic" | "openai" | "gemini";

export type ResultadoIA = {
	texto: string;
	proveedor: ProveedorIA;
	modelo: string;
	tokensEntrada: number;
	tokensSalida: number;
};

function esProveedorIA(v: string): v is ProveedorIA {
	return v === "anthropic" || v === "openai" || v === "gemini";
}

async function llamarAnthropic(prompt: string, apiKey: string, signal: AbortSignal): Promise<Omit<ResultadoIA, "proveedor">> {
	const client = new Anthropic({ apiKey });
	const modelo = "claude-sonnet-4-5";
	const respuesta = await client.messages.create(
		{ model: modelo, max_tokens: 2048, messages: [{ role: "user", content: prompt }] },
		{ signal },
	);
	const texto = respuesta.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
	return {
		texto,
		modelo,
		tokensEntrada: respuesta.usage.input_tokens,
		tokensSalida: respuesta.usage.output_tokens,
	};
}

async function llamarOpenAI(prompt: string, apiKey: string, signal: AbortSignal): Promise<Omit<ResultadoIA, "proveedor">> {
	const client = new OpenAI({ apiKey });
	const modelo = "gpt-4.1-mini";
	const respuesta = await client.chat.completions.create(
		{ model: modelo, messages: [{ role: "user", content: prompt }] },
		{ signal },
	);
	return {
		texto: respuesta.choices[0]?.message?.content ?? "",
		modelo,
		tokensEntrada: respuesta.usage?.prompt_tokens ?? 0,
		tokensSalida: respuesta.usage?.completion_tokens ?? 0,
	};
}

async function llamarGemini(prompt: string, apiKey: string, signal: AbortSignal): Promise<Omit<ResultadoIA, "proveedor">> {
	const client = new GoogleGenAI({ apiKey });
	const modelo = "gemini-3.6-flash";
	const respuesta = await client.models.generateContent({
		model: modelo,
		contents: prompt,
		config: { abortSignal: signal },
	});
	return {
		texto: respuesta.text ?? "",
		modelo,
		tokensEntrada: respuesta.usageMetadata?.promptTokenCount ?? 0,
		tokensSalida: respuesta.usageMetadata?.candidatesTokenCount ?? 0,
	};
}

/**
 * Calls whichever provider `ia.proveedor` selects, using that provider's stored key.
 * Fails closed (503) if the provider is unset, its key is missing, or the call itself fails —
 * same "degrade loudly, never silently no-op a security/config-relevant check" rule the
 * WhatsApp/Telegram and PAC credentials follow.
 */
export async function generarNarrativa(prompt: string): Promise<ResultadoIA> {
	const proveedor = await valorAjuste("ia.proveedor");
	if (!esProveedorIA(proveedor)) {
		throw new ClienteError(503, "No hay proveedor de IA configurado. Ajústalo en Ajustes → Inteligencia artificial.");
	}

	const clave =
		proveedor === "anthropic"
			? "ia.anthropic_apiKey"
			: proveedor === "openai"
				? "ia.openai_apiKey"
				: "ia.gemini_apiKey";
	const apiKey = await valorAjuste(clave);
	if (!apiKey) {
		throw new ClienteError(503, "Falta la API key del proveedor de IA activo. Captúrala en Ajustes.");
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const llamar = proveedor === "anthropic" ? llamarAnthropic : proveedor === "openai" ? llamarOpenAI : llamarGemini;
		const resultado = await llamar(prompt, apiKey, controller.signal);
		return { ...resultado, proveedor };
	} catch (err) {
		if (controller.signal.aborted) {
			throw new ClienteError(504, "El proveedor de IA tardó demasiado en responder. Intenta de nuevo.");
		}
		console.error(`[ia] fallo llamando a ${proveedor}`, err);
		throw new ClienteError(502, "El proveedor de IA no pudo generar el reporte. Intenta de nuevo.");
	} finally {
		clearTimeout(timeout);
	}
}

/** Usage visibility only — no spending cap, no billing. Route gates the permission, same as `queryAuditLogs`. */
export async function resumenUsoIA() {
	const [porProveedor, recientes] = await Promise.all([
		prisma.ia_uso.groupBy({
			by: ["proveedor"],
			_count: { _all: true },
			_sum: { tokensEntrada: true, tokensSalida: true },
		}),
		prisma.ia_uso.findMany({
			orderBy: { createdAt: "desc" },
			take: 50,
			include: {
				actor: { select: { name: true } },
				nota: { select: { folio: true } },
			},
		}),
	]);
	return { porProveedor, recientes };
}

/** One row per call, always — usage visibility only, no billing/credits. */
export async function registrarUsoIA(input: {
	proveedor: string;
	modelo: string;
	notaId?: string;
	actorId?: string;
	tokensEntrada: number;
	tokensSalida: number;
}): Promise<void> {
	await prisma.ia_uso.create({
		data: {
			id: randomUUID(),
			proveedor: input.proveedor,
			modelo: input.modelo,
			notaId: input.notaId,
			actorId: input.actorId,
			tokensEntrada: input.tokensEntrada,
			tokensSalida: input.tokensSalida,
		},
	});
}
