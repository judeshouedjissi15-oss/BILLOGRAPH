export type StoreFaq = { question: string; answer: string };

export function parseStoreFaqs(value: string | null): StoreFaq[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is StoreFaq =>
        !!item &&
        typeof item === "object" &&
        "question" in item &&
        "answer" in item &&
        typeof item.question === "string" &&
        typeof item.answer === "string",
    );
  } catch {
    return [];
  }
}
