// SERVEUR SMTP DE TEST — outil de vérification de la chaîne d'envoi email
// (développement uniquement, non lancé en production).
// - Écoute SMTP sur le port 2525 : accepte tout message et l'archive.
// - Expose HTTP GET http://127.0.0.1:2526/messages : liste les emails capturés
//   (permet de vérifier le contenu réel envoyé par la plateforme, y compris
//   l'extraction du lien de confirmation pour les tests de bout en bout).
import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";

type Captured = {
  id: number;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  receivedAt: string;
};

const captured: Captured[] = [];
let nextId = 1;

const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ["STARTTLS"],
  onMailFrom(address, session, cb) {
    void session;
    cb();
  },
  onRcptTo(address, session, cb) {
    void session;
    cb();
  },
  onData(stream, session, cb) {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", async () => {
      try {
        const mailFrom = session.envelope.mailFrom; // false | SMTPServerAddress
        const parsed = await simpleParser(Buffer.concat(chunks));
        captured.push({
          id: nextId++,
          from: String(parsed.from?.text ?? (mailFrom ? mailFrom.address : "") ?? ""),
          to: String(parsed.to?.text ?? session.envelope.rcptTo?.[0]?.address ?? ""),
          subject: String(parsed.subject ?? ""),
          html: typeof parsed.html === "string" ? parsed.html : "",
          text: parsed.text ?? "",
          receivedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error("[smtp-test] parse error:", err);
      }
      cb();
    });
  },
});

smtp.listen(2525, "127.0.0.1", () => {
  console.log("[smtp-test] SMTP prêt sur 127.0.0.1:2525");
});

// Mini serveur HTTP de lecture des messages capturés.
Bun.serve({
  port: 2526,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/messages") {
      const last = url.searchParams.get("last");
      const list = last ? captured.slice(-Number(last)) : captured;
      return Response.json({ messages: list });
    }
    if (url.pathname === "/reset") {
      captured.length = 0;
      return Response.json({ ok: true });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log("[smtp-test] HTTP de lecture sur http://127.0.0.1:2526/messages");
