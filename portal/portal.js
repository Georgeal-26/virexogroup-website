"use strict";
/* Virexo Portal: Freelancer · Auftraggeber · Admin */

const cfg = window.VIREXO_PORTAL || {};
const app = document.getElementById("app");
const who = document.getElementById("who");
const toastEl = document.getElementById("toast");

/* ---------- kleine Helfer ---------- */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "html") throw new Error("kein html");
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}
function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove("show"), 3200);
}
const datum = (d) => d ? new Date(d).toLocaleDateString("de-DE") : "–";
const skillsArr = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 30);
const tags = (arr) => (arr && arr.length) ? h("div", { class: "tags" }, arr.map((s) => h("span", {}, s))) : null;
const badge = (s) => h("span", { class: "badge s-" + s }, s);
const safeUrl = (u) => /^https:\/\//i.test(u || "") ? u : null;
function field(label, input) { return h("label", {}, label, input); }
function fehler(e) {
  const m = (e && e.message) || String(e);
  if (/Invalid login/i.test(m)) return "E-Mail oder Passwort ist falsch.";
  if (/Email not confirmed/i.test(m)) return "Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse (Link in der Bestätigungsmail).";
  if (/already registered/i.test(m)) return "Für diese E-Mail gibt es bereits ein Konto.";
  if (/Password should be/i.test(m)) return "Das Passwort ist zu kurz (mindestens 8 Zeichen).";
  if (/rate limit/i.test(m)) return "Zu viele Versuche. Bitte kurz warten.";
  return "Fehler: " + m;
}
async function q(promise) {
  const { data, error } = await promise;
  if (error) { toast(fehler(error)); throw error; }
  return data;
}

/* ---------- Start ---------- */
if (!window.supabase || !/^https:\/\/.+/.test(cfg.url || "")) {
  app.replaceChildren(h("div", { class: "card-note" },
    h("h1", {}, "Portal noch nicht verbunden"),
    h("p", { class: "muted" }, "In ", h("code", {}, "portal/config.js"), " fehlen noch die Supabase-Zugangsdaten (Project URL und anon key).")));
  throw new Error("Supabase nicht konfiguriert");
}
const sb = window.supabase.createClient(cfg.url, cfg.key);
let profil = null;
let recovery = false;

sb.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") { recovery = true; zeigeNeuesPasswort(); }
  else if (event === "SIGNED_IN" || event === "SIGNED_OUT") { if (!recovery) start(); }
});
start();

async function start() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { profil = null; who.replaceChildren(); return zeigeLogin(); }
  const { data, error } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
  if (error || !data) {
    app.replaceChildren(h("div", { class: "card-note" }, h("h1", {}, "Profil nicht gefunden"),
      h("p", { class: "muted" }, "Bitte melden Sie sich ab und erneut an. Wenn das Problem bleibt, kontaktieren Sie info@virexogroup.com."),
      h("button", { class: "btn", onclick: abmelden }, "Abmelden")));
    return;
  }
  profil = data;
  who.replaceChildren(h("span", {}, h("b", {}, profil.name || profil.email), " · ", rolleName(profil.rolle)),
    h("button", { class: "btn btn-ghost btn-xs", onclick: abmelden }, "Abmelden"));
  if (profil.status === "gesperrt") {
    app.replaceChildren(h("div", { class: "card-note" }, h("h1", {}, "Konto gesperrt"),
      h("p", { class: "muted" }, "Ihr Konto wurde gesperrt. Bei Fragen: info@virexogroup.com")));
    return;
  }
  dashboard();
}
async function abmelden() { await sb.auth.signOut(); toast("Sie sind abgemeldet."); }
const rolleName = (r) => ({ freelancer: "Freelancer", auftraggeber: "Auftraggeber", admin: "Admin" }[r] || r);

/* ---------- Anmelden / Registrieren / Passwort ---------- */
function zeigeLogin(modus = "login") {
  const err = h("p", { class: "err" });
  const seg = h("div", { class: "seg", role: "group", "aria-label": "Modus" },
    h("button", { type: "button", "aria-pressed": String(modus === "login"), onclick: () => zeigeLogin("login") }, "Anmelden"),
    h("button", { type: "button", "aria-pressed": String(modus === "reg"), onclick: () => zeigeLogin("reg") }, "Registrieren"));

  let form;
  if (modus === "login") {
    form = h("form", { class: "form", onsubmit: async (e) => {
      e.preventDefault(); err.textContent = "";
      const f = new FormData(form);
      const { error } = await sb.auth.signInWithPassword({ email: f.get("email"), password: f.get("pw") });
      if (error) err.textContent = fehler(error);
    } }, seg,
      field("E-Mail", h("input", { name: "email", type: "email", required: true, autocomplete: "email" })),
      field("Passwort", h("input", { name: "pw", type: "password", required: true, autocomplete: "current-password" })),
      err,
      h("button", { class: "btn", type: "submit" }, "Anmelden"),
      h("button", { type: "button", class: "linkbtn", onclick: () => zeigeLogin("reset") }, "Passwort vergessen?"));
  } else if (modus === "reg") {
    const firmaFeld = field("Firma", h("input", { name: "firma", autocomplete: "organization" }));
    form = h("form", { class: "form", onsubmit: async (e) => {
      e.preventDefault(); err.textContent = "";
      const f = new FormData(form);
      if (f.get("pw").length < 8) { err.textContent = "Das Passwort muss mindestens 8 Zeichen haben."; return; }
      if (f.get("rolle") === "auftraggeber" && !String(f.get("firma")).trim()) { err.textContent = "Bitte geben Sie Ihre Firma an."; return; }
      const { data, error } = await sb.auth.signUp({
        email: f.get("email"), password: f.get("pw"),
        options: { emailRedirectTo: location.origin + location.pathname, data: { rolle: f.get("rolle"), name: f.get("name"), firma: f.get("firma") } }
      });
      if (error) { err.textContent = fehler(error); return; }
      if (!data.session) {
        app.replaceChildren(h("div", { class: "card-note" }, h("h1", {}, "Fast geschafft"),
          h("p", { class: "muted" }, "Wir haben Ihnen eine E-Mail an ", h("b", {}, f.get("email")), " geschickt. Bitte klicken Sie auf den Bestätigungslink, danach können Sie sich anmelden."),
          h("button", { class: "btn", onclick: () => zeigeLogin("login") }, "Zur Anmeldung")));
      }
    } }, seg,
      h("div", { class: "seg", role: "radiogroup", "aria-label": "Ich bin" },
        h("label", {}, h("input", { type: "radio", name: "rolle", value: "freelancer", checked: true }), "Freelancer"),
        h("label", {}, h("input", { type: "radio", name: "rolle", value: "auftraggeber" }), "Auftraggeber")),
      field("Name", h("input", { name: "name", required: true, autocomplete: "name", maxlength: 120 })),
      firmaFeld,
      field("E-Mail", h("input", { name: "email", type: "email", required: true, autocomplete: "email" })),
      field("Passwort (mind. 8 Zeichen)", h("input", { name: "pw", type: "password", required: true, minlength: 8, autocomplete: "new-password" })),
      h("label", { class: "check" }, h("input", { type: "checkbox", required: true }), h("span", {}, "Ich habe die ", h("a", { href: "../datenschutz.html", target: "_blank" }, "Datenschutzerklärung"), " gelesen.")),
      err,
      h("button", { class: "btn", type: "submit" }, "Konto erstellen"));
  } else {
    form = h("form", { class: "form", onsubmit: async (e) => {
      e.preventDefault(); err.textContent = "";
      const f = new FormData(form);
      const { error } = await sb.auth.resetPasswordForEmail(f.get("email"), { redirectTo: location.origin + location.pathname });
      if (error) { err.textContent = fehler(error); return; }
      toast("Wenn ein Konto existiert, ist ein Link unterwegs.");
      zeigeLogin("login");
    } },
      h("h2", {}, "Passwort zurücksetzen"),
      h("p", { class: "hint" }, "Wir schicken Ihnen einen Link, mit dem Sie ein neues Passwort festlegen."),
      field("E-Mail", h("input", { name: "email", type: "email", required: true, autocomplete: "email" })),
      err,
      h("button", { class: "btn", type: "submit" }, "Link senden"),
      h("button", { type: "button", class: "linkbtn", onclick: () => zeigeLogin("login") }, "Zurück zur Anmeldung"));
  }

  app.replaceChildren(h("div", { class: "auth" },
    h("div", {},
      h("p", { class: "kicker grad-text" }, "Virexo Portal"),
      h("h1", {}, "Projekte. Techniker. ", h("span", { class: "grad-text" }, "Ein Ort.")),
      h("p", { class: "lead" }, "Für Auftraggeber und Freelancer im Bereich Netzwerk, Verkabelung und Rollouts."),
      h("ul", { class: "vorteile" },
        h("li", {}, h("b", {}, "Für Auftraggeber"), h("span", {}, "Projekte anfragen, Status verfolgen, Dokumentation, Rechnungen und Stunden einsehen.")),
        h("li", {}, h("b", {}, "Für Freelancer"), h("span", {}, "Profil mit Skills anlegen, auf Aufträge bewerben, Einsätze sehen und Zeiten erfassen.")))),
    form));
}

function zeigeNeuesPasswort() {
  const err = h("p", { class: "err" });
  const form = h("form", { class: "form", onsubmit: async (e) => {
    e.preventDefault();
    const pw = new FormData(form).get("pw");
    if (pw.length < 8) { err.textContent = "Mindestens 8 Zeichen."; return; }
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) { err.textContent = fehler(error); return; }
    recovery = false; toast("Passwort geändert."); start();
  } },
    h("h2", {}, "Neues Passwort festlegen"),
    field("Neues Passwort", h("input", { name: "pw", type: "password", required: true, minlength: 8, autocomplete: "new-password" })),
    err, h("button", { class: "btn", type: "submit" }, "Speichern"));
  app.replaceChildren(h("div", { class: "auth" }, h("div", {}, h("h1", {}, "Passwort ändern")), form));
}

/* ---------- Dashboard ---------- */
const TABS = {
  freelancer: [["auftraege", "Aufträge"], ["einsaetze", "Meine Einsätze"], ["bewerbungen", "Meine Bewerbungen"], ["profil", "Profil"]],
  auftraggeber: [["projekte", "Meine Projekte"], ["neu", "Projekt anfragen"], ["profil", "Profil"]],
  admin: [["a_projekte", "Projekte"], ["a_bewerbungen", "Bewerbungen"], ["a_pool", "Freelancer-Pool"], ["a_konten", "Konten"], ["neu", "Projekt anlegen"], ["profil", "Profil"]]
};
let aktiverTab = null;

function dashboard() {
  const tabs = TABS[profil.rolle];
  if (!tabs.some((t) => t[0] === aktiverTab)) aktiverTab = tabs[0][0];
  const panel = h("div", {});
  const nav = h("div", { class: "tabs", role: "tablist" },
    tabs.map(([id, name]) => h("button", { role: "tab", "aria-selected": String(id === aktiverTab), onclick: () => { aktiverTab = id; dashboard(); } }, name)));
  const gruss = new Date().getHours() < 11 ? "Guten Morgen" : new Date().getHours() < 18 ? "Guten Tag" : "Guten Abend";
  app.replaceChildren(h("div", { class: "dash-head" },
    h("div", {}, h("p", { class: "kicker grad-text" }, rolleName(profil.rolle)), h("h1", {}, gruss + (profil.name ? ", " + profil.name.split(" ")[0] : "") + "."))),
    nav, panel);
  const fn = { auftraege, einsaetze, bewerbungen, profil: profilTab, projekte, neu: neuesProjekt,
    a_projekte: adminProjekte, a_bewerbungen: adminBewerbungen, a_pool: adminPool, a_konten: adminKonten }[aktiverTab];
  panel.append(h("p", { class: "muted" }, "Lädt …"));
  fn(panel).catch(() => { panel.replaceChildren(h("div", { class: "empty" }, "Daten konnten nicht geladen werden.")); });
}
const leer = (t) => h("div", { class: "empty" }, t);

function projektKarte(p, extra) {
  return h("article", { class: "item" },
    h("div", { class: "item-head" }, h("h3", {}, p.titel), badge(p.status)),
    h("div", { class: "meta" },
      p.ort && h("span", {}, "📍 " + p.ort), p.start && h("span", {}, "Start: " + datum(p.start)),
      p.dauer && h("span", {}, "Dauer: " + p.dauer), h("span", {}, p.techniker + " Techniker")),
    p.beschreibung && h("p", {}, p.beschreibung),
    tags(p.skills), extra);
}

/* ---- Freelancer ---- */
async function auftraege(panel) {
  const [offen, meine] = await Promise.all([
    q(sb.from("projekte").select("*").eq("status", "offen").order("erstellt", { ascending: false })),
    q(sb.from("bewerbungen").select("projekt_id").eq("freelancer_id", profil.id))]);
  const beworben = new Set(meine.map((b) => b.projekt_id));
  panel.replaceChildren(h("h2", {}, "Offene Aufträge"),
    offen.length ? h("div", { class: "list" }, offen.map((p) => {
      if (beworben.has(p.id)) return projektKarte(p, h("div", { class: "actions" }, badge("beworben")));
      const box = h("div", {});
      const btn = h("button", { class: "btn btn-xs", onclick: () => {
        const ta = h("textarea", { rows: 3, placeholder: "Kurze Nachricht: Verfügbarkeit, Erfahrung …", maxlength: 1500, style: "width:100%" });
        box.replaceChildren(h("div", { class: "inline-form" }, ta,
          h("button", { class: "btn btn-xs", onclick: async () => {
            await q(sb.from("bewerbungen").insert({ projekt_id: p.id, nachricht: ta.value }));
            toast("Bewerbung gesendet."); dashboard();
          } }, "Bewerbung senden")));
      } }, "Bewerben");
      box.append(btn);
      return projektKarte(p, box);
    })) : leer("Im Moment gibt es keine offenen Aufträge. Schauen Sie bald wieder vorbei."));
}

async function bewerbungen(panel) {
  const rows = await q(sb.from("bewerbungen").select("*, projekte(titel, ort, start, status)").eq("freelancer_id", profil.id).order("erstellt", { ascending: false }));
  panel.replaceChildren(h("h2", {}, "Meine Bewerbungen"),
    rows.length ? h("div", { class: "list" }, rows.map((b) => h("div", { class: "sub-row" },
      h("span", {}, h("b", {}, b.projekte ? b.projekte.titel : "Projekt"), b.projekte && b.projekte.ort ? " · " + b.projekte.ort : "", " · ", datum(b.erstellt)),
      h("div", { class: "actions" }, badge(b.status),
        b.status === "offen" && h("button", { class: "btn btn-ghost btn-xs", onclick: async () => {
          if (!confirm("Bewerbung zurückziehen?")) return;
          await q(sb.from("bewerbungen").delete().eq("id", b.id)); toast("Zurückgezogen."); dashboard();
        } }, "Zurückziehen"))))) : leer("Sie haben sich noch auf keinen Auftrag beworben."));
}

async function einsaetze(panel) {
  const rows = await q(sb.from("einsaetze").select("*, projekte(*)").eq("freelancer_id", profil.id).order("erstellt", { ascending: false }));
  const ids = rows.map((r) => r.id);
  const zeiten = ids.length ? await q(sb.from("zeiten").select("*").in("einsatz_id", ids).order("datum", { ascending: false })) : [];
  panel.replaceChildren(h("h2", {}, "Meine Einsätze"),
    rows.length ? h("div", { class: "list" }, rows.map((e) => {
      const z = zeiten.filter((x) => x.einsatz_id === e.id);
      const summe = z.reduce((s, x) => s + Number(x.stunden), 0);
      const d = h("input", { type: "date", value: new Date().toISOString().slice(0, 10), required: true });
      const st = h("input", { type: "number", min: "0.25", max: "24", step: "0.25", placeholder: "8", required: true, style: "width:90px" });
      const no = h("input", { type: "text", placeholder: "Notiz (optional)", maxlength: 300 });
      const fertig = e.projekte && e.projekte.status === "abgeschlossen";
      return projektKarte(e.projekte || { titel: "Projekt", status: "", techniker: "" }, h("div", { class: "sub-list" },
        h("div", { class: "item-head" }, h("b", {}, "Zeiten"), h("span", { class: "sum" }, summe.toLocaleString("de-DE") + " Std.")),
        !fertig && h("form", { class: "inline-form", onsubmit: async (ev) => {
          ev.preventDefault();
          await q(sb.from("zeiten").insert({ einsatz_id: e.id, datum: d.value, stunden: Number(st.value), notiz: no.value }));
          toast("Zeit gespeichert."); dashboard();
        } }, field("Datum", d), field("Stunden", st), field("Notiz", no), h("button", { class: "btn btn-xs", type: "submit" }, "Eintragen")),
        z.map((x) => h("div", { class: "sub-row" }, h("span", {}, datum(x.datum) + " · " + Number(x.stunden).toLocaleString("de-DE") + " Std." + (x.notiz ? " · " + x.notiz : "")),
          !fertig && h("button", { class: "linkbtn", onclick: async () => { await q(sb.from("zeiten").delete().eq("id", x.id)); dashboard(); } }, "Löschen")))));
    })) : leer("Noch keine Einsätze. Sobald eine Bewerbung angenommen wird, erscheint der Einsatz hier."));
}

/* ---- Auftraggeber ---- */
async function projekte(panel) {
  const rows = await q(sb.from("projekte").select("*").eq("auftraggeber_id", profil.id).order("erstellt", { ascending: false }));
  panel.replaceChildren(h("h2", {}, "Meine Projekte"),
    rows.length ? h("div", { class: "list" }, rows.map((p) => {
      const links = h("div", { class: "actions" },
        safeUrl(p.doku_link) && h("a", { class: "btn btn-ghost btn-xs", href: p.doku_link, target: "_blank", rel: "noopener" }, "Dokumentation"),
        safeUrl(p.rechnung_link) && h("a", { class: "btn btn-ghost btn-xs", href: p.rechnung_link, target: "_blank", rel: "noopener" }, "Rechnung"));
      const stunden = h("span", { class: "meta" });
      sb.from("zeiten").select("stunden, einsaetze!inner(projekt_id)").eq("einsaetze.projekt_id", p.id).then(({ data }) => {
        if (data && data.length) stunden.textContent = "Erfasste Stunden: " + data.reduce((s, x) => s + Number(x.stunden), 0).toLocaleString("de-DE");
      });
      return projektKarte(p, [stunden, links]);
    })) : h("div", { class: "empty" }, "Noch keine Projekte. ", h("button", { class: "linkbtn", onclick: () => { aktiverTab = "neu"; dashboard(); } }, "Jetzt ein Projekt anfragen.")));
}

async function neuesProjekt(panel) {
  const err = h("p", { class: "err" });
  const form = h("form", { class: "form", style: "max-width:720px", onsubmit: async (e) => {
    e.preventDefault(); err.textContent = "";
    const f = new FormData(form);
    const row = { titel: f.get("titel"), beschreibung: f.get("beschreibung"), ort: f.get("ort"), start: f.get("start") || null,
      dauer: f.get("dauer"), techniker: Number(f.get("techniker") || 1), skills: skillsArr(f.get("skills")) };
    if (profil.rolle === "admin") row.status = f.get("status");
    await q(sb.from("projekte").insert(row));
    toast(profil.rolle === "admin" ? "Projekt angelegt." : "Anfrage gesendet. Wir melden uns.");
    aktiverTab = profil.rolle === "admin" ? "a_projekte" : "projekte"; dashboard();
  } },
    field("Titel", h("input", { name: "titel", required: true, maxlength: 140, placeholder: "z. B. Windows-11-Rollout, 3 Filialen" })),
    field("Beschreibung", h("textarea", { name: "beschreibung", rows: 5, maxlength: 4000, placeholder: "Was soll gemacht werden? Umfang, Besonderheiten, Ansprechpartner vor Ort …" })),
    h("div", { class: "row2" },
      field("Ort", h("input", { name: "ort", maxlength: 120, placeholder: "Stadt / Region" })),
      field("Gewünschter Start", h("input", { name: "start", type: "date" }))),
    h("div", { class: "row2" },
      field("Dauer", h("input", { name: "dauer", maxlength: 60, placeholder: "z. B. 2 Wochen" })),
      field("Anzahl Techniker", h("input", { name: "techniker", type: "number", min: 1, max: 500, value: 1 }))),
    field("Benötigte Skills (mit Komma trennen)", h("input", { name: "skills", maxlength: 400, placeholder: "Netzwerk, LWL, Windows 11, Access Points" })),
    profil.rolle === "admin" && field("Status", h("select", { name: "status" }, ["offen", "angefragt", "vergeben", "laufend"].map((s) => h("option", { value: s }, s)))),
    err, h("button", { class: "btn", type: "submit" }, profil.rolle === "admin" ? "Projekt anlegen" : "Anfrage senden"));
  panel.replaceChildren(h("h2", {}, profil.rolle === "admin" ? "Projekt anlegen" : "Projekt anfragen"), form);
}

/* ---- Profil (alle) ---- */
async function profilTab(panel) {
  const p = profil;
  const istFL = p.rolle === "freelancer";
  const form = h("form", { class: "form", style: "max-width:720px", onsubmit: async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const upd = { name: f.get("name"), firma: f.get("firma"), telefon: f.get("telefon"), region: f.get("region") };
    if (istFL) Object.assign(upd, { skills: skillsArr(f.get("skills")), verfuegbar_ab: f.get("verfuegbar_ab") || null,
      tagessatz: f.get("tagessatz") ? Number(f.get("tagessatz")) : null, ueber_mich: f.get("ueber_mich") });
    const [neu] = await q(sb.from("profiles").update(upd).eq("id", p.id).select());
    profil = neu; toast("Profil gespeichert."); dashboard();
  } },
    h("p", { class: "hint" }, "Angemeldet als ", h("b", {}, p.email)),
    h("div", { class: "row2" },
      field("Name", h("input", { name: "name", value: p.name, required: true, maxlength: 120 })),
      field("Firma", h("input", { name: "firma", value: p.firma, maxlength: 160 }))),
    h("div", { class: "row2" },
      field("Telefon", h("input", { name: "telefon", value: p.telefon, maxlength: 40, autocomplete: "tel" })),
      field(istFL ? "Region / Einsatzgebiet" : "Standort", h("input", { name: "region", value: p.region, maxlength: 120 }))),
    istFL && field("Skills (mit Komma trennen)", h("input", { name: "skills", value: (p.skills || []).join(", "), maxlength: 600, placeholder: "Netzwerk, LWL-Spleißen, Windows 11, Access Points, Rack" })),
    istFL && h("div", { class: "row2" },
      field("Verfügbar ab", h("input", { name: "verfuegbar_ab", type: "date", value: p.verfuegbar_ab || "" })),
      field("Tagessatz (€, optional)", h("input", { name: "tagessatz", type: "number", min: 0, step: "1", value: p.tagessatz ?? "" }))),
    istFL && field("Über mich", h("textarea", { name: "ueber_mich", rows: 4, maxlength: 2000 }, p.ueber_mich || "")),
    h("button", { class: "btn", type: "submit" }, "Speichern"),
    h("button", { type: "button", class: "linkbtn", onclick: zeigeNeuesPasswort }, "Passwort ändern"));
  panel.replaceChildren(h("h2", {}, "Mein Profil"), form);
}

/* ---- Admin ---- */
const PSTATUS = ["angefragt", "offen", "vergeben", "laufend", "abgeschlossen", "abgelehnt"];

async function adminProjekte(panel) {
  const rows = await q(sb.from("projekte").select("*, profiles(name, firma, email)").order("erstellt", { ascending: false }));
  const fi = h("input", { type: "search", placeholder: "Suchen: Titel, Ort, Kunde …" });
  const list = h("div", { class: "list" });
  const render = () => {
    const s = fi.value.toLowerCase();
    const r = rows.filter((p) => !s || JSON.stringify([p.titel, p.ort, p.profiles, p.status]).toLowerCase().includes(s));
    list.replaceChildren(...(r.length ? r.map((p) => {
      const sel = h("select", {}, PSTATUS.map((s2) => h("option", { value: s2, selected: s2 === p.status }, s2)));
      const doku = h("input", { type: "url", value: p.doku_link, placeholder: "https://… (Doku-Link)" });
      const re = h("input", { type: "url", value: p.rechnung_link, placeholder: "https://… (Rechnungs-Link)" });
      return projektKarte(p, [
        h("div", { class: "meta" }, p.profiles ? h("span", {}, "Kunde: " + [p.profiles.firma, p.profiles.name].filter(Boolean).join(" · ") + " · " + p.profiles.email) : h("span", {}, "Intern angelegt"),
          h("span", {}, "Eingang: " + datum(p.erstellt))),
        h("form", { class: "inline-form", onsubmit: async (e) => {
          e.preventDefault();
          if ((doku.value && !safeUrl(doku.value)) || (re.value && !safeUrl(re.value))) { toast("Links müssen mit https:// beginnen."); return; }
          await q(sb.from("projekte").update({ status: sel.value, doku_link: doku.value, rechnung_link: re.value }).eq("id", p.id));
          toast("Gespeichert.");
        } }, field("Status", sel), field("Dokumentation", doku), field("Rechnung", re),
          h("button", { class: "btn btn-xs", type: "submit" }, "Speichern"),
          h("button", { class: "btn btn-ghost btn-xs", type: "button", onclick: async () => {
            if (!confirm("Projekt „" + p.titel + "“ endgültig löschen? Bewerbungen, Einsätze und Zeiten werden mitgelöscht.")) return;
            await q(sb.from("projekte").delete().eq("id", p.id)); toast("Gelöscht."); dashboard();
          } }, "Löschen"))]);
    }) : [leer("Keine Projekte gefunden.")]));
  };
  fi.addEventListener("input", render); render();
  panel.replaceChildren(h("h2", {}, "Alle Projekte (" + rows.length + ")"),
    h("p", { class: "hint", style: "margin-bottom:14px" }, "Neue Anfragen kommen mit Status „angefragt“. Auf „offen“ setzen, damit Freelancer sich bewerben können."),
    h("div", { class: "filter" }, fi), list);
}

async function adminBewerbungen(panel) {
  const rows = await q(sb.from("bewerbungen").select("*, projekte(titel, ort), profiles(name, email, telefon, region, skills, tagessatz)").order("erstellt", { ascending: false }));
  panel.replaceChildren(h("h2", {}, "Bewerbungen"),
    rows.length ? h("div", { class: "list" }, rows.map((b) => h("article", { class: "item" },
      h("div", { class: "item-head" }, h("h3", {}, (b.profiles ? b.profiles.name : "?") + " → " + (b.projekte ? b.projekte.titel : "?")), badge(b.status)),
      b.profiles && h("div", { class: "meta" }, h("span", {}, b.profiles.email), b.profiles.telefon && h("span", {}, b.profiles.telefon),
        b.profiles.region && h("span", {}, "📍 " + b.profiles.region), b.profiles.tagessatz && h("span", {}, b.profiles.tagessatz + " €/Tag"), h("span", {}, datum(b.erstellt))),
      b.nachricht && h("p", {}, b.nachricht),
      b.profiles && tags(b.profiles.skills),
      b.status === "offen" && h("div", { class: "actions" },
        h("button", { class: "btn btn-xs", onclick: async () => { await q(sb.rpc("bewerbung_annehmen", { b_id: b.id })); toast("Angenommen, Einsatz angelegt."); dashboard(); } }, "Annehmen"),
        h("button", { class: "btn btn-ghost btn-xs", onclick: async () => { await q(sb.from("bewerbungen").update({ status: "abgelehnt" }).eq("id", b.id)); toast("Abgelehnt."); dashboard(); } }, "Ablehnen"))))) : leer("Noch keine Bewerbungen."));
}

async function adminPool(panel) {
  const rows = await q(sb.from("profiles").select("*").eq("rolle", "freelancer").order("erstellt", { ascending: false }));
  const fi = h("input", { type: "search", placeholder: "Suchen: Skill, Region, Name … (z. B. LWL München)" });
  const list = h("div", { class: "list" });
  const render = () => {
    const words = fi.value.toLowerCase().split(/\s+/).filter(Boolean);
    const r = rows.filter((p) => { const t = JSON.stringify([p.name, p.region, p.skills, p.ueber_mich, p.firma]).toLowerCase(); return words.every((w) => t.includes(w)); });
    list.replaceChildren(...(r.length ? r.map((p) => h("article", { class: "item" },
      h("div", { class: "item-head" }, h("h3", {}, p.name || "(ohne Namen)"), badge(p.status)),
      h("div", { class: "meta" }, h("span", {}, p.email), p.telefon && h("span", {}, p.telefon), p.region && h("span", {}, "📍 " + p.region),
        p.verfuegbar_ab && h("span", {}, "verfügbar ab " + datum(p.verfuegbar_ab)), p.tagessatz && h("span", {}, p.tagessatz + " €/Tag")),
      p.ueber_mich && h("p", {}, p.ueber_mich), tags(p.skills))) : [leer("Keine Freelancer gefunden.")]));
  };
  fi.addEventListener("input", render); render();
  panel.replaceChildren(h("h2", {}, "Freelancer-Pool (" + rows.length + ")"), h("div", { class: "filter" }, fi), list);
}

async function adminKonten(panel) {
  const rows = await q(sb.from("profiles").select("*").order("erstellt", { ascending: false }));
  panel.replaceChildren(h("h2", {}, "Alle Konten (" + rows.length + ")"),
    h("div", { class: "list" }, rows.map((p) => h("div", { class: "sub-row" },
      h("span", {}, h("b", {}, p.name || p.email), " · " + rolleName(p.rolle) + (p.firma ? " · " + p.firma : "") + " · " + p.email + " · seit " + datum(p.erstellt)),
      h("div", { class: "actions" }, badge(p.status),
        p.id !== profil.id && (p.status === "gesperrt"
          ? h("button", { class: "btn btn-xs", onclick: async () => { await q(sb.from("profiles").update({ status: "freigegeben" }).eq("id", p.id)); toast("Entsperrt."); dashboard(); } }, "Entsperren")
          : h("button", { class: "btn btn-ghost btn-xs", onclick: async () => { if (!confirm(p.email + " sperren?")) return; await q(sb.from("profiles").update({ status: "gesperrt" }).eq("id", p.id)); toast("Gesperrt."); dashboard(); } }, "Sperren")))))));
}
