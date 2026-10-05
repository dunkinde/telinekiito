"use strict";
// Minimal SMTP client (built-in modules only): STARTTLS on 587/25, TLS on 465, AUTH PLAIN/LOGIN,
// one plain-text UTF-8 message per connection. Enough for transactional mail through any provider.
const net = require("node:net");
const tls = require("node:tls");
const os = require("node:os");
const crypto = require("node:crypto");

function encodeHeader(s) {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}

function buildMessage({ from, fromName, to, subject, text, replyTo }) {
  const domain = String(from).split("@")[1] || "localhost";
  const body = Buffer.from(String(text).replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");
  const headers = [
    `From: ${fromName ? `${encodeHeader(fromName)} <${from}>` : from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomBytes(12).toString("hex")}@${domain}>`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64"
  ];
  return headers.join("\r\n") + "\r\n\r\n" + body + "\r\n";
}

/** Line reader for SMTP replies ("250-..." continues, "250 ..." ends). */
function replies(socket) {
  let buf = "";
  const waiting = [];
  const ready = [];
  let lines = [];
  const onData = (chunk) => {
    buf += chunk.toString("utf8");
    let i;
    while ((i = buf.indexOf("\r\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      lines.push(line);
      if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
        const reply = { code: Number(line.slice(0, 3)), lines };
        lines = [];
        if (waiting.length) waiting.shift().resolve(reply);
        else ready.push(reply);
      }
    }
  };
  const onError = (e) => { while (waiting.length) waiting.shift().reject(e); };
  socket.on("data", onData);
  socket.on("error", onError);
  return {
    next() {
      if (ready.length) return Promise.resolve(ready.shift());
      return new Promise((resolve, reject) => waiting.push({ resolve, reject }));
    },
    detach() {
      socket.off("data", onData);
      socket.off("error", onError);
    }
  };
}

async function sendMail(cfg, msg, { timeoutMs = 20000 } = {}) {
  const port = Number(cfg.port) || 587;
  const host = cfg.host;
  let socket = port === 465
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port });
  socket.setTimeout(timeoutMs, () => socket.destroy(new Error("SMTP timeout")));
  let r = replies(socket);
  const expect = async (ok, what) => {
    const rep = await r.next();
    if (!ok.includes(rep.code)) throw new Error(`SMTP ${what}: ${rep.code} ${rep.lines.join(" ").slice(0, 200)}`);
    return rep;
  };
  const cmd = (line) => socket.write(line + "\r\n");
  try {
    await expect([220], "greeting");
    const name = os.hostname() || "localhost";
    cmd(`EHLO ${name}`);
    let ehlo = await expect([250], "EHLO");
    if (port !== 465 && ehlo.lines.some((l) => /STARTTLS/i.test(l))) {
      cmd("STARTTLS");
      await expect([220], "STARTTLS");
      r.detach();
      socket = tls.connect({ socket, servername: host });
      socket.setTimeout(timeoutMs, () => socket.destroy(new Error("SMTP timeout")));
      await new Promise((resolve, reject) => { socket.once("secureConnect", resolve); socket.once("error", reject); });
      r = replies(socket);
      cmd(`EHLO ${name}`);
      ehlo = await expect([250], "EHLO after TLS");
    } else if (port !== 465 && !cfg.allowPlain) {
      throw new Error("SMTP server offers no TLS; refusing to send the password in clear text.");
    }
    if (cfg.user) {
      const plain = ehlo.lines.some((l) => /AUTH[ =].*PLAIN/i.test(l));
      if (plain) {
        cmd(`AUTH PLAIN ${Buffer.from(`\0${cfg.user}\0${cfg.pass}`).toString("base64")}`);
        await expect([235], "AUTH PLAIN");
      } else {
        cmd("AUTH LOGIN");
        await expect([334], "AUTH LOGIN");
        cmd(Buffer.from(cfg.user).toString("base64"));
        await expect([334], "AUTH user");
        cmd(Buffer.from(cfg.pass).toString("base64"));
        await expect([235], "AUTH password");
      }
    }
    cmd(`MAIL FROM:<${msg.from}>`);
    await expect([250], "MAIL FROM");
    cmd(`RCPT TO:<${msg.to}>`);
    await expect([250, 251], "RCPT TO");
    cmd("DATA");
    await expect([354], "DATA");
    const data = buildMessage(msg).replace(/^\./gm, "..");
    socket.write(data + "\r\n.\r\n");
    await expect([250], "message");
    cmd("QUIT");
    socket.end();
    return true;
  } catch (e) {
    socket.destroy();
    throw e;
  }
}

module.exports = { sendMail, buildMessage };
