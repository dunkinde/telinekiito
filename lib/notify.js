"use strict";
// Customer messages and office alerts.
// Every event writes the message into the outbox first (records kind "msg"). If email or SMS is connected
// (settings in .env), the outbox sends it; if not, it waits in the office's outbox until it is, so nothing is
// lost and the office can see exactly what customers would have received. Customers also see every update on
// the tracking page, which works without email.
const { sendMail } = require("./smtp");

/* ---------- Templates (editable in the office; these are the defaults) ---------- */
const DEFAULT_TEMPLATES = {
  order_received: {
    fi: {
      subject: "Tilaus {ref} vastaanotettu",
      body: "Hei {name},\n\nkiitos tilauksestasi. Tarkistamme tiedot ja vahvistamme hinnan ja aloituspäivän pian.\n\nTilausnumero: {ref}\nArvioitu hinta: {total} (sis. ALV)\nToivottu aloitus: {date}\n\nSeuraa tilausta: {link}\n\nTelineKiito",
      sms: "TelineKiito: tilaus {ref} vastaanotettu. Vahvistamme sen pian. Seuranta: {link}"
    },
    en: {
      subject: "Order {ref} received",
      body: "Hi {name},\n\nthank you for your order. We'll check the details and confirm the price and start date shortly.\n\nOrder number: {ref}\nEstimated price: {total} (incl. VAT)\nRequested start: {date}\n\nTrack your order: {link}\n\nTelineKiito",
      sms: "TelineKiito: order {ref} received. We'll confirm it shortly. Track: {link}"
    }
  },
  confirmed: {
    fi: {
      subject: "Tilaus {ref} vahvistettu – pystytys {date}",
      body: "Hei {name},\n\ntilauksesi on vahvistettu.\n\nPystytys: {date} {time}\nTiimi: {crew}\nHinta: {total} (sis. ALV)\n\nTiimi soittaa ennen saapumista. Varmista, että pääsy kohteeseen on vapaa.\n\nSeuraa tilausta: {link}\n\nTelineKiito",
      sms: "TelineKiito: tilaus {ref} vahvistettu. Pystytys {date} {time}. Seuranta: {link}"
    },
    en: {
      subject: "Order {ref} confirmed – installation {date}",
      body: "Hi {name},\n\nyour order is confirmed.\n\nInstallation: {date} {time}\nCrew: {crew}\nPrice: {total} (incl. VAT)\n\nThe crew calls before arriving. Please keep the access to the site clear.\n\nTrack your order: {link}\n\nTelineKiito",
      sms: "TelineKiito: order {ref} confirmed. Installation {date} {time}. Track: {link}"
    }
  },
  on_the_way: {
    fi: {
      subject: "Telineet ovat matkalla",
      body: "Hei {name},\n\n{crew} on matkalla kohteeseen {address}. Arvioitu saapuminen: {eta}.\n\nSeuraa tilausta: {link}\n\nTelineKiito",
      sms: "TelineKiito: {crew} on matkalla. Arvioitu saapuminen {eta}."
    },
    en: {
      subject: "Your scaffolding is on the way",
      body: "Hi {name},\n\n{crew} is driving to {address}. Estimated arrival: {eta}.\n\nTrack your order: {link}\n\nTelineKiito",
      sms: "TelineKiito: {crew} is on the way. Estimated arrival {eta}."
    }
  },
  ready: {
    fi: {
      subject: "Telineet ovat valmiina käyttöön",
      body: "Hei {name},\n\nteline on pystytetty, tarkastettu ja merkitty. Vuokrapäivät alkoivat {date}, ja vuokra-aika päättyy {endDate}.\n\nTarkastuspöytäkirja ja tilauksen tiedot: {link}\n\nVoit jatkaa vuokraa tai pyytää noutoa samasta linkistä.\n\nTelineKiito",
      sms: "TelineKiito: telineet ovat valmiina käyttöön. Vuokra päättyy {endDate}. {link}"
    },
    en: {
      subject: "Your scaffolding is ready to use",
      body: "Hi {name},\n\nthe scaffold is up, inspected and tagged. Rental days started on {date} and the rental ends on {endDate}.\n\nInspection record and order details: {link}\n\nYou can extend the rental or request pickup from the same link.\n\nTelineKiito",
      sms: "TelineKiito: your scaffolding is ready to use. Rental ends {endDate}. {link}"
    }
  },
  rental_ending: {
    fi: {
      subject: "Vuokra-aika päättyy {endDate}",
      body: "Hei {name},\n\ntilauksen {ref} vuokra-aika päättyy {endDate}. Jos tarvitset telineitä pidempään, jatka vuokraa – muuten pyydä nouto:\n\n{link}\n\nTelineKiito",
      sms: "TelineKiito: vuokra päättyy {endDate}. Jatka tai pyydä nouto: {link}"
    },
    en: {
      subject: "Your rental ends on {endDate}",
      body: "Hi {name},\n\nthe rental for order {ref} ends on {endDate}. If you need the scaffolding longer, extend the rental – otherwise request pickup:\n\n{link}\n\nTelineKiito",
      sms: "TelineKiito: rental ends {endDate}. Extend or request pickup: {link}"
    }
  },
  pickup_scheduled: {
    fi: {
      subject: "Nouto {date}",
      body: "Hei {name},\n\nnoudamme telineet {date} {time}. Telineiden edustalla on hyvä olla tilaa autolle.\n\n{link}\n\nTelineKiito",
      sms: "TelineKiito: nouto {date} {time}."
    },
    en: {
      subject: "Pickup on {date}",
      body: "Hi {name},\n\nwe'll collect the scaffolding on {date} {time}. Please leave room for the truck in front of the site.\n\n{link}\n\nTelineKiito",
      sms: "TelineKiito: pickup on {date} {time}."
    }
  },
  collected: {
    fi: {
      subject: "Telineet on noudettu – miten onnistuimme?",
      body: "Hei {name},\n\ntelineet on purettu ja noudettu. Kiitos, että valitsit TelineKiidon!\n\nKertoisitko, miten onnistuimme? Arvio vie minuutin:\n{link}\n\nTelineKiito",
      sms: "TelineKiito: telineet noudettu. Kiitos! Anna arvio: {link}"
    },
    en: {
      subject: "Scaffolding collected – how did we do?",
      body: "Hi {name},\n\nthe scaffolding has been dismantled and collected. Thank you for choosing TelineKiito!\n\nWould you tell us how we did? It takes a minute:\n{link}\n\nTelineKiito",
      sms: "TelineKiito: scaffolding collected. Thank you! Rate us: {link}"
    }
  },
  invoice: {
    fi: {
      subject: "Lasku {invoiceNo}",
      body: "Hei {name},\n\nlasku tilauksesta {ref}:\n\nSumma: {total} (sis. ALV)\nEräpäivä: {due}\nViitenumero: {reference}\n\nLasku ja kotitalousvähennykseen tarvittava työn osuus: {link}\n\nTelineKiito",
      sms: "TelineKiito: lasku {invoiceNo}, {total}, eräpäivä {due}. {link}"
    },
    en: {
      subject: "Invoice {invoiceNo}",
      body: "Hi {name},\n\nthe invoice for order {ref}:\n\nAmount: {total} (incl. VAT)\nDue date: {due}\nReference number: {reference}\n\nThe invoice and the labour share for the household tax credit: {link}\n\nTelineKiito",
      sms: "TelineKiito: invoice {invoiceNo}, {total}, due {due}. {link}"
    }
  },
  change_approved: {
    fi: {
      subject: "Muutos tilaukseen {ref} hyväksytty",
      body: "Hei {name},\n\nmuutos on hyväksytty: {change}\nUusi hinta: {total} (sis. ALV)\n\n{link}\n\nTelineKiito",
      sms: "TelineKiito: muutos hyväksytty ({change}). Uusi hinta {total}."
    },
    en: {
      subject: "Change to order {ref} approved",
      body: "Hi {name},\n\nthe change is approved: {change}\nNew price: {total} (incl. VAT)\n\n{link}\n\nTelineKiito",
      sms: "TelineKiito: change approved ({change}). New price {total}."
    }
  },
  change_rejected: {
    fi: {
      subject: "Muutos tilaukseen {ref}",
      body: "Hei {name},\n\nemme valitettavasti voi tehdä pyytämääsi muutosta ({change}).\n{reason}\n\nSoita tai vastaa tähän viestiin, niin etsitään toinen ratkaisu.\n\n{link}\n\nTelineKiito",
      sms: "TelineKiito: muutosta ({change}) ei voitu tehdä. {link}"
    },
    en: {
      subject: "About your change to order {ref}",
      body: "Hi {name},\n\nunfortunately we can't make the change you asked for ({change}).\n{reason}\n\nCall us or reply to this message and we'll find another way.\n\n{link}\n\nTelineKiito",
      sms: "TelineKiito: we couldn't make the change ({change}). {link}"
    }
  },
  price_change: {
    fi: {
      subject: "Tilauksen {ref} hinta muuttuu – hyväksy tai hylkää",
      body: "Hei {name},\n\nolemme tarkistaneet tilauksesi ja hinta muuttuu.\n\nNykyinen hinta: {total} (sis. ALV)\nUusi hinta: {newTotal} (sis. ALV)\nSyy: {reason}\n\nHyväksy tai hylkää muutos tilauksen sivulla. Nykyinen hinta on voimassa, kunnes hyväksyt uuden.\n\n{link}\n\nTelineKiito",
      sms: "TelineKiito: tilauksen {ref} hinta muuttuu {total} → {newTotal}. Hyväksy tai hylkää: {link}"
    },
    en: {
      subject: "The price of order {ref} changes – accept or decline",
      body: "Hi {name},\n\nwe've checked your order and the price changes.\n\nCurrent price: {total} (incl. VAT)\nNew price: {newTotal} (incl. VAT)\nReason: {reason}\n\nAccept or decline the change on the order page. The current price stays valid until you accept the new one.\n\n{link}\n\nTelineKiito",
      sms: "TelineKiito: the price of order {ref} changes {total} → {newTotal}. Accept or decline: {link}"
    }
  },
  office_reply: {
    fi: {
      subject: "Uusi viesti tilaukseesi {ref}",
      body: "Hei {name},\n\n{text}\n\nVastaa tilauksen sivulla: {link}\n\nTelineKiito",
      sms: "TelineKiito: {text}"
    },
    en: {
      subject: "New message about order {ref}",
      body: "Hi {name},\n\n{text}\n\nReply on the order page: {link}\n\nTelineKiito",
      sms: "TelineKiito: {text}"
    }
  }
};
const EVENTS = Object.keys(DEFAULT_TEMPLATES);
const DEFAULT_SMS_EVENTS = ["confirmed", "on_the_way", "ready", "rental_ending", "price_change"];

function mergeTemplates(over) {
  const t = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES));
  if (!over || typeof over !== "object") return t;
  for (const ev of EVENTS) {
    for (const lang of ["fi", "en"]) {
      for (const part of ["subject", "body", "sms"]) {
        const v = over[ev] && over[ev][lang] && over[ev][lang][part];
        if (typeof v === "string" && v.trim()) t[ev][lang][part] = v.slice(0, part === "body" ? 4000 : 400);
      }
    }
  }
  return t;
}

const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null && vars[k] !== "" ? String(vars[k]) : "–"));

/** Finnish mobile numbers to international form (040 123 4567 → +358401234567). */
function toE164(phone) {
  let d = String(phone || "").replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (d.startsWith("+")) return /^\+\d{8,15}$/.test(d) ? d : null;
  if (d.startsWith("0")) d = "+358" + d.slice(1);
  else if (d.startsWith("358")) d = "+" + d;
  return /^\+\d{8,15}$/.test(d) ? d : null;
}

function createNotifier({ store, env = process.env, getOps, orderKey = () => null }) {
  const mail = env.SMTP_HOST && env.MAIL_FROM
    ? { host: env.SMTP_HOST, port: Number(env.SMTP_PORT) || 587, user: env.SMTP_USER || "", pass: env.SMTP_PASS || "", from: env.MAIL_FROM, fromName: env.MAIL_FROM_NAME || "TelineKiito" }
    : null;
  const smsProvider = String(env.SMS_PROVIDER || "").toLowerCase();
  const sms =
    smsProvider === "twilio" && env.TWILIO_SID && env.TWILIO_TOKEN && env.SMS_FROM
      ? { provider: "twilio", sid: env.TWILIO_SID, token: env.TWILIO_TOKEN, from: env.SMS_FROM }
      : smsProvider === "bulkgate" && env.BULKGATE_APP_ID && env.BULKGATE_APP_TOKEN
        ? { provider: "bulkgate", appId: env.BULKGATE_APP_ID, token: env.BULKGATE_APP_TOKEN, sender: env.SMS_FROM || "TelineKiito" }
        : null;

  const siteUrl = () => {
    const ops = getOps();
    if (ops.siteUrl) return ops.siteUrl.replace(/\/$/, "");
    const a = env.SITE_ADDRESS || "";
    return a && /[a-z]/i.test(a) && a !== "localhost" ? `https://${a}` : "";
  };
  const templates = () => mergeTemplates(store.getSetting("templates"));

  async function sendSms(to, text) {
    if (sms.provider === "twilio") {
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sms.sid)}/Messages.json`, {
        method: "POST",
        headers: { Authorization: "Basic " + Buffer.from(`${sms.sid}:${sms.token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: to, From: sms.from, Body: text }).toString(),
        signal: AbortSignal.timeout(15000)
      });
      if (!r.ok) throw new Error(`Twilio ${r.status}: ${(await r.text()).slice(0, 200)}`);
    } else {
      const r = await fetch("https://portal.bulkgate.com/api/1.0/simple/transactional", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: sms.appId, application_token: sms.token, number: to.replace(/^\+/, ""), text, unicode: true, sender_id: "gText", sender_id_value: sms.sender }),
        signal: AbortSignal.timeout(15000)
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || (j && j.error)) throw new Error(`BulkGate ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
    }
  }

  async function deliver(m) {
    if (m.channel === "email") {
      if (!mail) return false;
      await sendMail(mail, { from: mail.from, fromName: mail.fromName, to: m.to, subject: m.subject, text: m.body, replyTo: getOps().officeEmail || undefined });
    } else {
      if (!sms) return false;
      await sendSms(m.to, m.body);
    }
    return true;
  }

  let flushing = false;
  /** Send waiting messages on the channels that are connected. Messages older than 48 h are skipped, not sent late. */
  async function flush({ ids } = {}) {
    if (flushing) return;
    flushing = true;
    try {
      const waiting = ids ? ids.map((id) => store.get("msg", id)).filter(Boolean) : store.list("msg", { status: "waiting", limit: 200 }).concat(store.list("msg", { status: "failed", limit: 100 }));
      for (const m of waiting) {
        if (m.channel === "email" ? !mail : !sms) continue;
        if (!ids && m.status === "failed" && (m.attempts || 0) >= 3) continue;
        if (!ids && Date.now() - Date.parse(m.createdAt) > 48 * 3600e3) {
          m.status = "skipped";
          m.error = "Older than 48 hours when sending was switched on";
          store.put("msg", m);
          continue;
        }
        try {
          await deliver(m);
          m.status = "sent";
          m.sentAt = new Date().toISOString();
          m.error = "";
        } catch (e) {
          m.status = "failed";
          m.error = String(e.message || e).slice(0, 300);
          console.error("[notify]", m.channel, m.id, m.error);
        }
        m.attempts = (m.attempts || 0) + 1;
        store.put("msg", m);
      }
    } finally {
      flushing = false;
    }
  }

  /** Write the customer's messages for an event (email and, for chosen events, SMS) and try to send them. */
  function event(order, name, extra = {}) {
    if (!order || order.example || !DEFAULT_TEMPLATES[name]) return [];
    const ops = getOps();
    const lang = order.lang === "en" ? "en" : "fi";
    const t = templates()[name][lang];
    const a = order.assignment || {};
    const eur = (n) => (Number.isFinite(Number(n)) ? new Intl.NumberFormat(lang === "fi" ? "fi-FI" : "en-GB", { style: "currency", currency: "EUR" }).format(Number(n)) : "–");
    const day = (iso) => (iso ? new Date(iso + "T12:00:00Z").toLocaleDateString(lang === "fi" ? "fi-FI" : "en-GB", { weekday: "short", day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" }) : "");
    const base = siteUrl();
    const vars = {
      name: String(order.customer && order.customer.name || "").split(" ")[0],
      ref: order.ref,
      total: eur(order.quote && order.quote.total),
      newTotal: eur(extra.newTotal),
      date: day(extra.date || a.date || (order.schedule && order.schedule.start)),
      time: extra.time || a.time || "",
      crew: extra.crew || order.crew || "",
      eta: order.eta || a.time || "",
      address: order.site && order.site.address,
      endDate: day(extra.endDate),
      link: base ? `${base}/?track=${order.ref}${orderKey(order.ref) ? `&k=${orderKey(order.ref)}` : ""}` : `(${lang === "fi" ? "tilausnumero" : "order number"} ${order.ref})`,
      ...extra.vars
    };
    const out = [];
    const email = order.customer && order.customer.email;
    if (email) {
      out.push(store.put("msg", { ref: order.ref, event: name, channel: "email", to: email, lang, subject: fill(t.subject, vars), body: fill(t.body, vars), status: "waiting", attempts: 0, audience: "customer" }));
    }
    const smsEvents = Array.isArray(ops.smsEvents) ? ops.smsEvents : DEFAULT_SMS_EVENTS;
    const to = toE164(order.customer && order.customer.phone);
    if (to && smsEvents.includes(name)) {
      out.push(store.put("msg", { ref: order.ref, event: name, channel: "sms", to, lang, subject: "", body: fill(t.sms, vars).slice(0, 320), status: "waiting", attempts: 0, audience: "customer" }));
    }
    if (out.length) flush({ ids: out.map((m) => m.id) }).catch(() => {});
    return out;
  }

  /** Office alert: shown in the office (and the crew app for leaders) and, if an office email is set, emailed. */
  function alert(type, ref, text, data = {}) {
    const a = store.put("alert", { ref, type, text: String(text).slice(0, 500), data, status: "new", readBy: [] });
    const ops = getOps();
    if (ops.officeEmail && ["new_order", "change_request", "problem", "weather", "stock_short", "customer_message", "price_change_declined"].includes(type)) {
      const m = store.put("msg", { ref, event: `alert_${type}`, channel: "email", to: ops.officeEmail, lang: "fi", subject: `TelineKiito: ${text.slice(0, 80)}`, body: `${text}\n\n${siteUrl() ? siteUrl() + "/office" : ""}`, status: "waiting", attempts: 0, audience: "office" });
      flush({ ids: [m.id] }).catch(() => {});
    }
    return a;
  }

  function status() {
    return {
      email: mail ? { connected: true, host: mail.host, from: mail.from } : { connected: false },
      sms: sms ? { connected: true, provider: sms.provider } : { connected: false },
      siteUrl: siteUrl(),
      waiting: store.count("msg", "waiting"),
      failed: store.count("msg", "failed")
    };
  }

  return { event, alert, flush, status, templates, EVENTS, DEFAULT_SMS_EVENTS };
}

module.exports = { createNotifier, mergeTemplates, DEFAULT_TEMPLATES, EVENTS, toE164, fill };
