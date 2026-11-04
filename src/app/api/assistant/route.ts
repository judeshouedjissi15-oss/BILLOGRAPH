import { handleApiError, jsonError, jsonOk, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const SYSTEM_PROMPT = `Tu es HOUEDJISSI IA, l'assistant virtuel de BILLOGRAPH. Présente-toi sous ce nom si l'utilisateur te demande qui tu es. Tu aides les utilisateurs avec leurs questions générales et l'utilisation de BILLOGRAPH. Réponds dans la langue de l'utilisateur, de façon claire, utile et concise. Tu peux traiter des sujets variés, mais reconnais honnêtement tes incertitudes et ne présente pas une supposition comme un fait. Tu n'as pas accès aux comptes, commandes, paiements ou données privées des utilisateurs : ne prétends jamais les consulter ou les modifier et oriente l'utilisateur vers son espace personnel ou le support BILLOGRAPH pour ces demandes. Ne demande jamais de mot de passe, code de vérification, numéro complet de carte ou autre secret. Pour les sujets médicaux, juridiques ou financiers, donne des informations générales et rappelle qu'elles ne remplacent pas un professionnel.`;

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0 &&
    message.content.length <= 3000
  );
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return jsonError(503, "HOUEDJISSI IA n’est pas encore configurée.");
    }

    rateLimit(`assistant:${clientIp(req)}`, 12, 5 * 60_000);

    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > 20_000) {
      throw new HttpError(413, "La conversation est trop longue.");
    }

    const body = await readJson(req);
    if (!body || typeof body !== "object" || !Array.isArray((body as Record<string, unknown>).messages)) {
      throw new HttpError(422, "Le format de la conversation est invalide.");
    }
    const rawMessages = (body as { messages: unknown[] }).messages;
    if (
      rawMessages.length < 1 ||
      rawMessages.length > 12 ||
      !rawMessages.every(isChatMessage) ||
      rawMessages.at(-1)?.role !== "user" ||
      rawMessages.reduce((total, message) => total + (isChatMessage(message) ? message.content.length : 0), 0) > 12_000
    ) {
      throw new HttpError(422, "La conversation est invalide ou trop longue.");
    }

    const messages = rawMessages.map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
          max_completion_tokens: 800,
          temperature: 0.6,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      console.error("[assistant] OpenAI request failed:", error);
      return jsonError(502, "HOUEDJISSI IA ne répond pas pour le moment. Réessayez dans quelques instants.");
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      console.error(`[assistant] OpenAI returned HTTP ${response.status}`);
      return jsonError(502, "Une erreur est survenue pendant la réponse de l’assistant.");
    }

    const data: unknown = await response.json().catch(() => null);
    const answer =
      data &&
      typeof data === "object" &&
      "choices" in data &&
      Array.isArray(data.choices) &&
      data.choices[0] &&
      typeof data.choices[0] === "object" &&
      "message" in data.choices[0] &&
      data.choices[0].message &&
      typeof data.choices[0].message === "object" &&
      "content" in data.choices[0].message &&
      typeof data.choices[0].message.content === "string"
        ? data.choices[0].message.content.trim()
        : "";

    if (!answer) {
      console.error("[assistant] OpenAI response did not contain a text answer");
      return jsonError(502, "HOUEDJISSI IA n’a pas pu générer de réponse. Réessayez.");
    }

    return jsonOk({ answer });
  } catch (error) {
    return handleApiError(error);
  }
}
