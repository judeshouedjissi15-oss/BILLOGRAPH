// Helpers de réponse et gestion d'erreurs homogènes pour les API routes.
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "@/lib/auth";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

// Convertit toute exception en réponse JSON propre sans fuiter de détails internes.
export function handleApiError(err: unknown) {
  if (err instanceof HttpError) return jsonError(err.status, err.message);
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return jsonError(422, first ? `${first.path.join(".")}: ${first.message}` : "Données invalides");
  }
  console.error("[api] erreur inattendue:", err);
  return jsonError(500, "Erreur interne du serveur");
}

// Body JSON sûr (retourne {} si absent).
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
