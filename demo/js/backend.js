/**
 * Faux backend Workspace (version actuelle du client).
 * Persistance localStorage, latence simulée. Aucun serveur.
 */
(function () {
  const KEY = "workspace_demo_current_v3";
  const MONTHS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

  function uid(p) { return p + "_" + Math.random().toString(36).slice(2, 9); }
  function now() { return new Date().toISOString(); }
  function pad(n) { return String(n).padStart(2, "0"); }
  function dateStr(d) {
    const x = d instanceof Date ? d : new Date(d);
    return x.getFullYear() + "-" + pad(x.getMonth() + 1) + "-" + pad(x.getDate());
  }
  function timeStr(d) {
    const x = d instanceof Date ? d : new Date(d);
    return pad(x.getHours()) + ":" + pad(x.getMinutes());
  }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function delay(ms) { return new Promise((r) => setTimeout(r, ms != null ? ms : 70 + Math.random() * 110)); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  const holidays = {
    "2026-01-01": "Jour de l'an", "2026-04-06": "Lundi de Pâques", "2026-05-01": "Fête du Travail",
    "2026-05-08": "Victoire 1945", "2026-05-14": "Ascension", "2026-05-25": "Lundi de Pentecôte",
    "2026-07-14": "Fête nationale", "2026-08-15": "Assomption", "2026-11-01": "Toussaint",
    "2026-11-11": "Armistice", "2026-12-25": "Noël"
  };

  function seed() {
    const today = new Date();
    const t0 = addDays(today, -2);
    const t1 = addDays(today, -12);
    const start = new Date(today); start.setHours(10, 0, 0, 0);
    const end = new Date(today); end.setHours(12, 0, 0, 0);
    const start2 = new Date(today); start2.setHours(14, 30, 0, 0);
    const end2 = new Date(today); end2.setHours(16, 0, 0, 0);

    return {
      pcBrands: [
        { id: "b1", name: "Dell" }, { id: "b2", name: "HP" }, { id: "b3", name: "Lenovo" },
        { id: "b4", name: "Apple" }, { id: "b5", name: "Asus" }
      ],
      pcModels: [
        { id: "m1", brandId: "b1", name: "Latitude 5410" }, { id: "m2", brandId: "b1", name: "OptiPlex 7080" },
        { id: "m3", brandId: "b2", name: "EliteBook 840 G7" }, { id: "m4", brandId: "b2", name: "ProDesk 400 G6" },
        { id: "m5", brandId: "b3", name: "ThinkPad T14" }, { id: "m6", brandId: "b3", name: "ThinkCentre M720" },
        { id: "m7", brandId: "b4", name: "MacBook Air M1" }, { id: "m8", brandId: "b5", name: "VivoBook 15" }
      ],
      diskBrands: [
        { id: "db1", name: "Samsung" }, { id: "db2", name: "Western Digital" },
        { id: "db3", name: "Seagate" }, { id: "db4", name: "Kingston" }
      ],
      diskModels: [
        { id: "dm1", brandId: "db1", name: "870 EVO" }, { id: "dm2", brandId: "db1", name: "980 PRO" },
        { id: "dm3", brandId: "db2", name: "Blue 1TB" }, { id: "dm4", brandId: "db3", name: "Barracuda 2TB" },
        { id: "dm5", brandId: "db4", name: "A400 480Go" }
      ],
      products: ["Câble HDMI 2 m", "Souris USB", "Clavier AZERTY", "SSD 500 Go", "Alimentation 90W"],
      categories: ["Consommables", "Outillage", "Informatique", "Mobilier"],
      lots: [
        {
          id: "12",
          name: "Lot NEXA-092",
          status: "active",
          createdAt: t0.toISOString(),
          finishedAt: null,
          recoveredAt: null,
          items: [
            { id: "pc1", sn: "NX-A4F2-9183", type: "portable", brand: "Dell", model: "Latitude 5410", enteredAt: t0.toISOString(), mode: "SCAN", state: "", technician: "", os: "linux" },
            { id: "pc2", sn: "NX-B81C-4402", type: "portable", brand: "HP", model: "EliteBook 840 G7", enteredAt: t0.toISOString(), mode: "SCAN", state: "Reconditionnés", technician: "Mila Riven", os: "linux" },
            { id: "pc3", sn: "NX-C22E-1094", type: "portable", brand: "Lenovo", model: "ThinkPad T14", enteredAt: t0.toISOString(), mode: "MANUEL", state: "", technician: "", os: "linux" },
            { id: "pc4", sn: "NX-D90A-7711", type: "fixe", brand: "Dell", model: "OptiPlex 7080", enteredAt: t0.toISOString(), mode: "SCAN", state: "HS", technician: "Noah Hale", os: "windows" }
          ]
        },
        {
          id: "8",
          name: "Lot ORION-081",
          status: "finished",
          createdAt: t1.toISOString(),
          finishedAt: addDays(t1, 3).toISOString(),
          recoveredAt: null,
          items: [
            { id: "pc5", sn: "NX-E14B-2201", type: "portable", brand: "Apple", model: "MacBook Air M1", enteredAt: t1.toISOString(), mode: "SCAN", state: "Reconditionnés", technician: "Eden Quill", os: "apple" },
            { id: "pc6", sn: "NX-F55D-9912", type: "portable", brand: "Asus", model: "VivoBook 15", enteredAt: t1.toISOString(), mode: "SCAN", state: "Pour pièces", technician: "Mila Riven", os: "windows" },
            { id: "pc7", sn: "NX-G03F-3321", type: "fixe", brand: "HP", model: "ProDesk 400 G6", enteredAt: t1.toISOString(), mode: "MANUEL", state: "Reconditionnés", technician: "Noah Hale", os: "linux" }
          ]
        }
      ],
      diskSessions: [{
        id: "ds1",
        name: "Session shred Vega",
        createdAt: addDays(today, -5).toISOString(),
        recoveredAt: null,
        items: [
          { id: "d1", sn: "DSK-NEXA-104", type: "SSD", brand: "Samsung", model: "870 EVO", size: "500 Go", iface: "SATA", destroy: false, shred: "Secure E. + Sanitize" },
          { id: "d2", sn: "DSK-NEXA-218", type: "HDD", brand: "Western Digital", model: "Blue 1TB", size: "1 To", iface: "SATA", destroy: true, shred: "Destruction physique" }
        ]
      }],
      commandes: [{
        id: "cmd1", name: "Commande atelier NEXA", category: "Consommables", createdAt: addDays(today, -8).toISOString(),
        items: [
          { id: "ci1", product: "Câble HDMI 2 m", qty: 12, price: 6.9, shipping: 0, url: "https://boutique.nexa.demo/hdmi" },
          { id: "ci2", product: "Souris USB", qty: 8, price: 9.5, shipping: 4.9, url: "" }
        ]
      }],
      dons: [{
        id: "don1", name: "Don promo Helios", createdAt: addDays(today, -40).toISOString(),
        items: [
          { id: "dn1", type: "portable", brand: "Dell", model: "Latitude 5410", sn: "NX-GIFT-01", date: dateStr(addDays(today, -40)), stagiaire: "Kian Soler" },
          { id: "dn2", type: "écran", brand: "HP", model: "EliteDisplay E24", sn: "NX-GIFT-44", date: dateStr(addDays(today, -40)), stagiaire: "Nova Elric" }
        ]
      }],
      prets: [{
        id: "pr1", name: "Prêt atelier Lyra", reference: "PRET-NEXA-014", borrowerType: "societe",
        borrowerName: "Lyra Formation", contact: "pret@nexa.demo",
        startDate: dateStr(addDays(today, -10)), endDate: dateStr(addDays(today, 20)),
        paid: false, amount: 0, createdAt: addDays(today, -10).toISOString(),
        items: [
          { id: "pi1", type: "PC", brand: "Lenovo", model: "ThinkPad T14", sn: "NX-PRET-01", qty: 1 },
          { id: "pi2", type: "souris", brand: "Logitech", model: "M185", sn: "", qty: 2 }
        ]
      }],
      events: [
        { id: "ev1", title: "Point équipe NEXA", allDay: false, start: start.toISOString(), end: end.toISOString(), description: "Suivi des lots en cours", color: "#5b7cfa" },
        { id: "ev2", title: "Réception lot ORION", allDay: false, start: start2.toISOString(), end: end2.toISOString(), description: "Quai atelier", color: "#F28241" },
        { id: "ev3", title: "Session formation Helios", allDay: true, start: addDays(today, 3).toISOString().slice(0, 10) + "T00:00:00", end: addDays(today, 3).toISOString().slice(0, 10) + "T23:59:00", description: "Salle Nord", color: "#4caf50" }
      ],
      pdfs: {}
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) { const d = seed(); save(d); return d; }
      return JSON.parse(raw);
    } catch (e) {
      const d = seed(); save(d); return d;
    }
  }
  function save(db) { localStorage.setItem(KEY, JSON.stringify(db)); }

  let db = load();
  function persist() { save(db); }

  function stats(lot) {
    const items = lot.items || [];
    const todo = items.filter((i) => !i.state || !i.technician).length;
    return {
      total: items.length, todo,
      recond: items.filter((i) => i.state === "Reconditionnés").length,
      hs: items.filter((i) => i.state === "HS").length,
      pieces: items.filter((i) => i.state === "Pour pièces").length,
      done: items.length - todo,
      progress: items.length ? Math.round(((items.length - todo) / items.length) * 100) : 0
    };
  }

  function storePdf(kind, entity) {
    const created = entity.finishedAt || entity.createdAt || now();
    const d = new Date(created);
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const slug = String(entity.name || entity.borrowerName || "document")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "document";
    const file = slug + "_" + dateStr(d) + ".pdf";
    const folders = {
      lot: "lots/" + y + "/" + m + "/",
      disque: "disques/" + y + "/" + m + "/",
      commande: "commandes/" + String(entity.category || "divers").toLowerCase().replace(/\s+/g, "-") + "/",
      don: "dons/" + y + "/" + m + "/",
      pret: "prets/" + y + "/" + m + "/"
    };
    const pdf = { id: uid("pdf"), kind, entityId: entity.id, path: "/archives/nexa/" + (folders[kind] || "") + file, file, createdAt: created };
    db.pdfs[pdf.id] = pdf;
    persist();
    return pdf;
  }

  const maps = () => ({ lot: db.lots, disque: db.diskSessions, commande: db.commandes, don: db.dons, pret: db.prets });

  const api = {
    MONTHS, holidays, delay, dateStr, timeStr, uid,
    reset() { db = seed(); persist(); return delay(40).then(() => true); },
    async getCatalog() {
      await delay(40);
      return clone({ pcBrands: db.pcBrands, pcModels: db.pcModels, diskBrands: db.diskBrands, diskModels: db.diskModels, products: db.products, categories: db.categories });
    },
    async addBrand(kind, name) {
      await delay();
      const n = String(name || "").trim(); if (!n) throw new Error("Nom requis");
      const list = kind === "disk" ? db.diskBrands : db.pcBrands;
      if (list.some((b) => b.name.toLowerCase() === n.toLowerCase())) throw new Error("Marque déjà existante");
      const item = { id: uid("b"), name: n }; list.push(item); persist(); return clone(item);
    },
    async addModel(kind, brandId, name) {
      await delay();
      const n = String(name || "").trim(); if (!n) throw new Error("Nom requis");
      const models = kind === "disk" ? db.diskModels : db.pcModels;
      const item = { id: uid("m"), brandId, name: n }; models.push(item); persist(); return clone(item);
    },
    async addProduct(name) { await delay(); const n = String(name || "").trim(); if (n && !db.products.includes(n)) db.products.push(n); persist(); return n; },
    async addCategory(name) { await delay(); const n = String(name || "").trim(); if (n && !db.categories.includes(n)) db.categories.push(n); persist(); return n; },
    async listEvents() { await delay(40); return clone(db.events); },
    async upsertEvent(payload) {
      await delay();
      if (!payload.title) throw new Error("Titre requis");
      if (payload.id) {
        const i = db.events.findIndex((e) => e.id === payload.id);
        if (i < 0) throw new Error("Événement introuvable");
        db.events[i] = Object.assign({}, db.events[i], payload); persist(); return clone(db.events[i]);
      }
      const ev = { id: uid("ev"), title: payload.title, allDay: !!payload.allDay, start: payload.start, end: payload.end, description: payload.description || "", color: payload.color || "#5b7cfa" };
      db.events.push(ev); persist(); return clone(ev);
    },
    async deleteEvent(id) { await delay(); db.events = db.events.filter((e) => e.id !== id); persist(); return true; },
    async listLots(status) {
      await delay();
      let list = db.lots;
      if (status) list = list.filter((l) => l.status === status);
      return clone(list.map((l) => Object.assign({}, l, { stats: stats(l) })));
    },
    async getLot(id) {
      await delay(30);
      const lot = db.lots.find((l) => l.id === id);
      if (!lot) throw new Error("Lot introuvable");
      return clone(Object.assign({}, lot, { stats: stats(lot) }));
    },
    async createLot(payload) {
      await delay(140);
      const items = payload.items || [];
      if (!items.length) throw new Error("Ajoutez au moins une ligne");
      const sns = items.map((i) => (i.sn || "").trim().toLowerCase()).filter(Boolean);
      if (sns.length !== new Set(sns).size) throw new Error("Numéros de série en double dans le lot");
      const existing = db.lots.flatMap((l) => l.items.map((i) => i.sn.toLowerCase()));
      const clash = sns.find((s) => existing.includes(s));
      if (clash) throw new Error("S/N déjà enregistré : " + clash);
      for (const it of items) { if (!it.sn || !it.type || !it.brand || !it.model) throw new Error("Tous les champs sont obligatoires"); }
      const lot = {
        id: String(Math.max(0, ...db.lots.map((l) => Number(l.id) || 0)) + 1),
        name: (payload.name || "").trim() || "Lot " + dateStr(new Date()),
        status: "active", createdAt: now(), finishedAt: null, recoveredAt: null,
        items: items.map((it) => ({ id: uid("pc"), sn: it.sn.trim(), type: it.type, brand: it.brand, model: it.model, enteredAt: it.enteredAt || now(), mode: it.mode || "MANUEL", state: "", technician: "", os: "linux" }))
      };
      db.lots.unshift(lot); storePdf("lot", lot); persist();
      return clone(Object.assign({}, lot, { stats: stats(lot) }));
    },
    async deleteLot(id) { await delay(); db.lots = db.lots.filter((l) => l.id !== id); persist(); return true; },
    async addLotItem(lotId, item) {
      await delay();
      const lot = db.lots.find((l) => l.id === lotId); if (!lot) throw new Error("Lot introuvable");
      lot.items.push({ id: uid("pc"), sn: item.sn, type: item.type || "portable", brand: item.brand, model: item.model, enteredAt: now(), mode: "MANUEL", state: "", technician: "", os: "linux" });
      persist(); return clone(Object.assign({}, lot, { stats: stats(lot) }));
    },
    async updateLotName(id, name) { await delay(); const lot = db.lots.find((l) => l.id === id); if (!lot) throw new Error("Lot introuvable"); lot.name = String(name || "").trim() || lot.name; persist(); return clone(lot); },
    async updateLotItem(lotId, itemId, patch) {
      await delay();
      const lot = db.lots.find((l) => l.id === lotId); if (!lot) throw new Error("Lot introuvable");
      const item = lot.items.find((i) => i.id === itemId); if (!item) throw new Error("Matériel introuvable");
      Object.assign(item, patch);
      let closed = false;
      if (lot.status === "active" && lot.items.every((i) => i.state && i.technician)) {
        lot.status = "finished"; lot.finishedAt = now(); storePdf("lot", lot); closed = true;
      }
      persist(); return clone({ lot: Object.assign({}, lot, { stats: stats(lot) }), closed });
    },
    async recoverLot(id) { await delay(); const lot = db.lots.find((l) => l.id === id); if (!lot || lot.status !== "finished") throw new Error("Le lot doit être terminé"); lot.recoveredAt = now(); persist(); return clone(lot); },
    async createDiskSession(payload) {
      await delay(140);
      const items = payload.items || []; if (!items.length) throw new Error("Ajoutez au moins un disque");
      const sns = items.map((i) => (i.sn || "").trim().toLowerCase());
      if (sns.some((s) => !s)) throw new Error("S/N obligatoire");
      if (sns.length !== new Set(sns).size) throw new Error("S/N en double");
      const session = {
        id: uid("ds"), name: (payload.name || "").trim() || "Session " + dateStr(new Date()), createdAt: now(), recoveredAt: null,
        items: items.map((it) => ({ id: uid("d"), sn: it.sn.trim(), type: it.type, brand: it.brand, model: it.model, size: it.size, iface: it.iface, destroy: !!it.destroy, shred: it.destroy ? "Destruction physique" : it.type === "SSD" ? "Secure E. + Sanitize" : "DoD" }))
      };
      db.diskSessions.unshift(session); storePdf("disque", session); persist(); return clone(session);
    },
    async updateDiskSession(id, patch) { await delay(); const s = db.diskSessions.find((x) => x.id === id); if (!s) throw new Error("Session introuvable"); if (patch.name) s.name = patch.name; if (patch.items) s.items = patch.items; persist(); return clone(s); },
    async recoverDisk(id) { await delay(); const s = db.diskSessions.find((x) => x.id === id); if (!s) throw new Error("Session introuvable"); s.recoveredAt = now(); persist(); return clone(s); },
    detectDisks() {
      return [
        { sn: "DSK-NEXA-980", type: "SSD", brand: "Samsung", model: "980 PRO", size: "1 To", iface: "NVMe" },
        { sn: "DSK-NEXA-077", type: "HDD", brand: "Western Digital", model: "Blue 1TB", size: "1 To", iface: "SATA" },
        { sn: "DSK-NEXA-412", type: "SSD", brand: "Kingston", model: "A400 480Go", size: "480 Go", iface: "SATA" }
      ];
    },
    async createCommande(payload) {
      await delay(140);
      if (!payload.name || !payload.category) throw new Error("Nom et catégorie obligatoires");
      const cmd = { id: uid("cmd"), name: payload.name.trim(), category: payload.category, createdAt: now(), items: (payload.items || []).map((it) => ({ id: uid("ci"), product: it.product, qty: Number(it.qty) || 0, price: Number(it.price) || 0, shipping: Number(it.shipping) || 0, url: it.url || "" })) };
      db.commandes.unshift(cmd); storePdf("commande", cmd); persist(); return clone(cmd);
    },
    async updateCommande(id, patch) { await delay(); const c = db.commandes.find((x) => x.id === id); if (!c) throw new Error("Commande introuvable"); Object.assign(c, patch); persist(); return clone(c); },
    async createDon(payload) {
      await delay(140);
      const items = payload.items || []; if (!items.length) throw new Error("Ajoutez au moins une ligne");
      const don = { id: uid("don"), name: (payload.name || "").trim() || "Don " + dateStr(new Date()), createdAt: now(), items: items.map((it) => ({ id: uid("dn"), type: it.type, brand: it.brand, model: it.model, sn: it.sn, date: it.date || dateStr(new Date()), stagiaire: it.stagiaire })) };
      db.dons.unshift(don); storePdf("don", don); persist(); return clone(don);
    },
    async updateDon(id, patch) { await delay(); const d = db.dons.find((x) => x.id === id); if (!d) throw new Error("Don introuvable"); Object.assign(d, patch); persist(); return clone(d); },
    async createPret(payload) {
      await delay(140);
      if (!payload.borrowerName) throw new Error("Emprunteur obligatoire");
      if (!payload.startDate || !payload.endDate) throw new Error("Dates obligatoires");
      if (payload.paid && !(Number(payload.amount) > 0)) throw new Error("Montant obligatoire si payant");
      const pret = { id: uid("pr"), name: (payload.name || "").trim() || payload.borrowerName, reference: payload.reference || "PRET-" + Date.now().toString().slice(-6), borrowerType: payload.borrowerType || "personne", borrowerName: payload.borrowerName, contact: payload.contact || "", startDate: payload.startDate, endDate: payload.endDate, paid: !!payload.paid, amount: Number(payload.amount) || 0, createdAt: now(), items: (payload.items || []).map((it) => ({ id: uid("pi"), type: it.type, brand: it.brand, model: it.model, sn: it.sn || "", qty: Number(it.qty) || 1 })) };
      db.prets.unshift(pret); storePdf("pret", pret); persist(); return clone(pret);
    },
    async historique(filters) {
      await delay();
      const f = filters || {};
      const out = [];
      db.lots.filter((l) => l.status === "finished").forEach((l) => out.push({ kind: "lot", id: l.id, name: l.name, createdAt: l.finishedAt || l.createdAt, data: Object.assign({}, l, { stats: stats(l) }) }));
      db.diskSessions.forEach((s) => out.push({ kind: "disque", id: s.id, name: s.name, createdAt: s.createdAt, data: s }));
      db.commandes.forEach((c) => out.push({ kind: "commande", id: c.id, name: c.name, createdAt: c.createdAt, data: c }));
      db.dons.forEach((d) => out.push({ kind: "don", id: d.id, name: d.name, createdAt: d.createdAt, data: d }));
      db.prets.forEach((p) => out.push({ kind: "pret", id: p.id, name: p.name, createdAt: p.createdAt, data: p }));
      let list = out.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      if (f.type && f.type !== "tous") list = list.filter((x) => x.kind === f.type);
      if (f.year) list = list.filter((x) => new Date(x.createdAt).getFullYear() === Number(f.year));
      if (f.q) { const q = f.q.toLowerCase(); list = list.filter((x) => JSON.stringify(x).toLowerCase().includes(q)); }
      return clone(list);
    },
    async sendMail(to, message) {
      await delay(180);
      if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("Adresse e-mail invalide");
      return { ok: true, to, message: message || "" };
    },
    async regeneratePdf(entityId, kind) {
      await delay(160);
      const list = maps()[kind] || [];
      const entity = list.find((x) => x.id === entityId); if (!entity) throw new Error("Document introuvable");
      Object.keys(db.pdfs).forEach((k) => { if (db.pdfs[k].entityId === entityId) delete db.pdfs[k]; });
      return clone(storePdf(kind, entity));
    },
    getPdfFor(entityId) { return Object.values(db.pdfs).find((p) => p.entityId === entityId) || null; },
    getEntity(kind, id) { return clone((maps()[kind] || []).find((x) => x.id === id) || null); }
  };

  db.lots.concat(db.diskSessions, db.commandes, db.dons, db.prets).forEach(function (e) {
    if (!Object.values(db.pdfs).some((p) => p.entityId === e.id)) {
      const kind = db.lots.includes(e) ? "lot" : db.diskSessions.includes(e) ? "disque" : db.commandes.includes(e) ? "commande" : db.dons.includes(e) ? "don" : "pret";
      storePdf(kind, e);
    }
  });

  window.DemoAPI = api;
})();
