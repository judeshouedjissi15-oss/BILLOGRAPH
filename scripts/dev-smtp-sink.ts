// SINK SMTP DE TEST — mini serveur SMTP local (port 1025) qui CAPTURE les
// emails réellement envoyés par BILLOGRAPH pendant les vérifications E2E.
// Protocole SMTP minimal : EHLO/HELO, AUTH LOGIN, MAIL FROM, RCPT TO, DATA,
// RSET, NOOP, QUIT. Les emails capturés sont écrits dans /tmp/blg-smtp-*.json.
// Usage : bun scripts/dev-smtp-sink.ts   (Ctrl+C pour arrêter)

import { writeFileSync } from "fs";

const PORT = 1025;
const decoder = new TextDecoder();

const sessions = new Map<number, { from?: string; to: string[]; data: string; inData: boolean }>();
let sessionSeq = 0;

const server = Bun.listen({
  hostname: "0.0.0.0",
  port: PORT,
  socket: {
    open(socket) {
      const id = ++sessionSeq;
      sessions.set(id, { to: [], data: "", inData: false });
      (socket as typeof socket & { _sessionId?: number })._sessionId = id;
      socket.write("220 dev-smtp-sink BILLOGRAPH test server ready\r\n");
    },
    data(socket, raw) {
      const id = (socket as typeof socket & { _sessionId?: number })._sessionId ?? 0;
      const session = sessions.get(id);
      if (!session) return;
      const lines = decoder.decode(raw).split("\r\n").filter((l) => l.length > 0);

      for (const line of lines) {
        if (session.inData) {
          if (line === ".") {
            // Fin du DATA → capturer l'email.
            const file = `/tmp/blg-smtp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
            writeFileSync(
              file,
              JSON.stringify({ from: session.from, to: session.to, data: session.data }, null, 2),
            );
            console.log(`[smtp-sink] email capturé → ${file} (to: ${session.to.join(", ")})`);
            session.inData = false;
            session.data = "";
            session.from = undefined;
            session.to = [];
            socket.write("250 2.0.0 OK: queued as TEST\r\n");
          } else {
            // Un- stuffing : ".." en début de ligne → "."
            session.data += (line.startsWith("..") ? line.slice(1) : line) + "\r\n";
          }
          continue;
        }

        const cmd = line.toUpperCase();
        if (cmd.startsWith("EHLO") || cmd.startsWith("HELO")) {
          socket.write("250-dev-smtp-sink greets you\r\n250-8BITMIME\r\n250-PIPELINING\r\n250 AUTH LOGIN PLAIN\r\n");
        } else if (cmd.startsWith("AUTH")) {
          socket.write("334 VXNlcm5hbWU6\r\n"); // "Username:"
        } else if (cmd.startsWith("MAIL FROM")) {
          session.from = line.slice(line.indexOf("<") + 1, line.indexOf(">")) || line;
          socket.write("250 2.1.0 OK\r\n");
        } else if (cmd.startsWith("RCPT TO")) {
          const addr = line.slice(line.indexOf("<") + 1, line.indexOf(">")) || line;
          session.to.push(addr);
          socket.write("250 2.1.5 OK\r\n");
        } else if (cmd.startsWith("DATA")) {
          session.inData = true;
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        } else if (cmd.startsWith("RSET")) {
          session.from = undefined;
          session.to = [];
          socket.write("250 2.0.0 OK\r\n");
        } else if (cmd.startsWith("NOOP")) {
          socket.write("250 2.0.0 OK\r\n");
        } else if (cmd.startsWith("QUIT")) {
          socket.write("221 2.0.0 Bye\r\n");
          socket.end();
        } else {
          // Réponses à AUTH (username/password base64) ou commande inconnue.
          if (/^[A-Za-z0-9+/=]+$/.test(line)) {
            socket.write("235 2.7.0 Authentication successful\r\n");
          } else {
            socket.write("502 5.5.2 Command not implemented\r\n");
          }
        }
      }
    },
    close(socket) {
      const id = (socket as typeof socket & { _sessionId?: number })._sessionId ?? 0;
      sessions.delete(id);
    },
    error(socket, err) {
      console.error("[smtp-sink] erreur socket :", err.message);
      try {
        socket.end();
      } catch {}
    },
  },
});

console.log(`[smtp-sink] serveur SMTP de test en écoute sur le port ${server.port} — les emails sont capturés dans /tmp/blg-smtp-*.json`);
