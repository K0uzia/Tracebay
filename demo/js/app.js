/**
 * Démo Workspace : miroir de l’app actuelle (Agenda + Réception).
 * Faux backend : window.DemoAPI
 */
(function () {
  const API = window.DemoAPI;
  const content = document.getElementById("content");
  const dialog = document.getElementById("demo-modal");

  const RECEP_META = {
    entrer: { title: "Réception de Lots", desc: "Saisissez les numéros de série et les informations des machines." },
    disques: { title: "Réception de Disques", desc: "Saisissez les disques puis enregistrez en traçabilité." },
    commande: { title: "Réception de Commande", desc: "Constituer une liste de produits et générer le PDF." },
    dons: { title: "Réception de Dons", desc: "Enregistrez les dons de matériel et générez le certificat." },
    prets: { title: "Prêts de matériel", desc: "Enregistrez les prêts ou locations de matériel et générez la fiche PDF." },
    inventaire: { title: "Inventaire", desc: "Gérez l'état des PC et assignez les techniciens." },
    historique: { title: "Historique & traçabilité", desc: "Archives des lots, disques, commandes, dons et prêts : détails, édition, PDF et email." }
  };
  const PC_TYPES = ["portable", "fixe", "écran", "autres"];
  const PRET_TYPES = ["PC", "écran", "clavier", "souris", "autres"];
  const OS = [
    { value: "linux", label: "Linux" }, { value: "windows", label: "Windows" },
    { value: "chrome", label: "Chrome OS" }, { value: "apple", label: "Apple" },
    { value: "android", label: "Android" }, { value: "bsd", label: "BSD" }
  ];
  const STATES = ["Reconditionnés", "Pour pièces", "HS", "autres"];

  const App = {
    page: "agenda",
    recep: "entrer",
    themeDark: document.documentElement.getAttribute("data-theme-dark") !== "0",
    calView: "week",
    calCursor: new Date(),
    selectedEvent: null,
    catalog: null,
    lotDraft: null,
    diskDraft: null,
    cmdDraft: null,
    donDraft: null,
    pretDraft: null,
    invQ: "",
    invSt: "",
    histQ: "",
    histYear: "",
    histType: "tous"
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function fmtDate(iso) {
    if (!iso) return "-";
    return new Date(iso).toLocaleDateString("fr-FR");
  }
  function fmtDateTime(iso) {
    if (!iso) return "-";
    return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  function todayISO() { return API.dateStr(new Date()); }
  function typeLabel(t) {
    const v = String(t || "");
    if (v === "écran" || v === "ecran") return "Écran";
    if (v === "pc") return "PC";
    if (!v) return "-";
    return v.charAt(0).toUpperCase() + v.slice(1);
  }
  function osMeta(os) {
    const map = {
      linux: { icon: "linux", label: "Linux" },
      windows: { icon: "windows", label: "Windows" },
      chrome: { icon: "chrome", label: "Chrome OS" },
      apple: { icon: "apple", label: "Apple" },
      android: { icon: "android", label: "Android" },
      bsd: { icon: "freebsd", label: "BSD" }
    };
    return map[String(os || "linux").toLowerCase()] || map.linux;
  }
  function fmtDateLong(iso) {
    if (!iso) return "-";
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  }
  function money(n) {
    return Number(n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  }
  function recipientOf(it) { return it.stagiaire || it.recipient || ""; }
  function pdfBrand() {
    return "<div class=\"pdf-header-logo\"><span class=\"pdf-mark\">NX</span><h2 class=\"pdf-header-subtitle\">NEXA ATELIER</h2></div>";
  }

  function notify(msg, type) {
    const el = document.createElement("div");
    el.className = "notification " + (type || "info");
    const icon = type === "success" ? "check" : type === "error" ? "triangle-exclamation" : type === "warning" ? "bell" : "circle-info";
    el.innerHTML = "<i class=\"fa-solid fa-" + icon + "\"></i><span>" + esc(msg) + "</span>";
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("show"); });
    setTimeout(function () {
      el.classList.add("hide");
      setTimeout(function () { el.remove(); }, 300);
    }, 3600);
  }

  async function guard(fn) {
    try { return await fn(); }
    catch (e) { notify(e.message || "Erreur", "error"); return null; }
  }

  function closeModal() {
    if (dialog.open) dialog.close();
    dialog.innerHTML = "";
    dialog.className = "universal-modal";
  }

  function openModal(opts) {
    const isAgenda = opts.kind === "agenda" || (opts.kind == null && App.page === "agenda");
    dialog.className = "universal-modal" + (isAgenda ? " agenda-event-modal" : " lots-modal");
    const contentClass = "modal-content" + (opts.wide ? " modal-lg" : "") + (isAgenda ? "" : " lots-modal__content");
    const headerClass = isAgenda ? "modal-header" : "modal-header lots-modal__header";
    const bodyClass = isAgenda ? "modal-body" : "modal-body lots-modal__body";
    const footerClass = isAgenda ? "modal-footer" : "modal-footer lots-modal__footer";
    const body = isAgenda ? "<div class=\"agenda-event-form\">" + (opts.body || "") + "</div>" : (opts.body || "");
    dialog.innerHTML =
      "<div class=\"" + contentClass + "\">" +
        "<div class=\"" + headerClass + "\"><h2>" + (opts.icon ? "<i class=\"" + opts.icon + "\"></i> " : "") + esc(opts.title) + "</h2>" +
          "<button type=\"button\" class=\"modal-close-btn\" data-close-modal aria-label=\"Fermer\"><i class=\"fas fa-times\"></i></button></div>" +
        "<div class=\"" + bodyClass + "\">" + body + "</div>" +
        (opts.footer ? "<div class=\"" + footerClass + "\">" + opts.footer + "</div>" : "") +
      "</div>";
    if (!dialog.open) dialog.showModal();
    if (opts.onOpen) opts.onOpen(dialog);
  }

  function field(id, label, type, value, extra) {
    extra = extra || "";
    return "<div class=\"form-group lots-modal__field\"><label for=\"" + id + "\">" + label + "</label>" +
      (type === "textarea"
        ? "<textarea id=\"" + id + "\" class=\"lots-modal__input\" " + extra + ">" + esc(value || "") + "</textarea>"
        : "<input type=\"" + type + "\" id=\"" + id + "\" class=\"lots-modal__input\" value=\"" + esc(value || "") + "\" " + extra + ">") +
      "</div>";
  }

  function selectField(id, label, options, value) {
    return "<div class=\"form-group lots-modal__field\"><label for=\"" + id + "\">" + label + "</label><select id=\"" + id + "\" class=\"lots-modal__input\">" +
      options.map(function (o) {
        const v = typeof o === "string" ? o : o.value;
        const t = typeof o === "string" ? o : o.label;
        return "<option value=\"" + esc(v) + "\"" + (String(v) === String(value || "") ? " selected" : "") + ">" + esc(t) + "</option>";
      }).join("") + "</select></div>";
  }

  async function catalog() {
    if (!App.catalog) App.catalog = await API.getCatalog();
    return App.catalog;
  }

  function brandOptions(list, selected) {
    return "<option value=\"\">Marque...</option>" + list.map(function (b) {
      return "<option value=\"" + esc(b.name) + "\"" + (b.name === selected ? " selected" : "") + ">" + esc(b.name) + "</option>";
    }).join("");
  }

  function modelOptions(models, brandName, brands, selected) {
    const brand = brands.find(function (b) { return b.name === brandName; });
    const filtered = brand ? models.filter(function (m) { return m.brandId === brand.id; }) : [];
    return "<option value=\"\">Modèle...</option>" + filtered.map(function (m) {
      return "<option value=\"" + esc(m.name) + "\"" + (m.name === selected ? " selected" : "") + ">" + esc(m.name) + "</option>";
    }).join("");
  }

  /* ---------- thème / shell ---------- */
  function applyTheme() {
    document.documentElement.setAttribute("data-theme-dark", App.themeDark ? "1" : "0");
    localStorage.setItem("workspace_theme_dark", App.themeDark ? "1" : "0");
    document.getElementById("navThemeIcon").className = App.themeDark ? "fa-solid fa-moon" : "fa-solid fa-sun";
    document.getElementById("navThemeText").textContent = App.themeDark ? "Thème sombre" : "Thème clair";
  }

  function setShell() {
    const reception = App.page === "reception";
    const hist = reception && App.recep === "historique";
    document.body.classList.toggle("page-reception", reception);
    document.body.classList.toggle("reception-single-scroll", hist);
    document.documentElement.classList.toggle("reception-single-scroll", hist);
    document.getElementById("footer").style.display = reception ? "none" : "";
    document.querySelectorAll(".nav-btn[data-page]").forEach(function (btn) {
      const p = btn.getAttribute("data-page");
      btn.classList.toggle("active", p === App.page || (p === "reception" && App.page === "reception"));
    });
  }

  function parseHash() {
    const h = (location.hash || "#/agenda").replace(/^#\/?/, "");
    const parts = h.split("/");
    if (parts[0] === "reception") {
      App.page = "reception";
      App.recep = parts[1] && RECEP_META[parts[1]] ? parts[1] : "entrer";
    } else {
      App.page = "agenda";
    }
  }

  function go(hash) {
    if (location.hash === hash) { parseHash(); render(); }
    else location.hash = hash;
  }

  async function render() {
    parseHash();
    setShell();
    if (App.page === "reception") await renderReception();
    else await renderAgenda();
  }

  /* ---------- Agenda ---------- */
  function startOfWeek(d) {
    const x = new Date(d);
    const day = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - day);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function eventsOnDay(events, day) {
    const key = API.dateStr(day);
    return events.filter(function (e) { return API.dateStr(e.start) <= key && API.dateStr(e.end) >= key; });
  }

  function chip(ev) {
    return "<button type=\"button\" class=\"calendar-event-chip\" data-event=\"" + ev.id + "\" style=\"background:" + esc(ev.color) + "22;color:#fff;border:0;border-radius:8px;padding:4px 8px;text-align:left;cursor:pointer\">" +
      "<span>" + esc(ev.title) + "</span></button>";
  }

  async function renderAgenda() {
    const events = await API.listEvents();
    const view = App.calView;
    const cursor = App.calCursor;
    let label = "";
    let grid = "";

    if (view === "week") {
      const start = startOfWeek(cursor);
      const end = new Date(start); end.setDate(end.getDate() + 6);
      label = start.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) + " - " +
        end.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start); d.setDate(d.getDate() + i);
        const hol = API.holidays[API.dateStr(d)];
        const list = eventsOnDay(events, d);
        days.push(
          "<div class=\"calendar-day" + (API.dateStr(d) === todayISO() ? " is-today" : "") + "\" data-cal-day=\"" + API.dateStr(d) + "\">" +
            "<div class=\"calendar-day-header\"><span class=\"calendar-day-name\">" + d.toLocaleDateString("fr-FR", { weekday: "short" }) +
            "</span><span class=\"calendar-day-number\">" + d.getDate() + "</span></div>" +
            (hol ? "<span class=\"text-mute\" style=\"font-size:0.75rem\">" + esc(hol) + "</span>" : "") +
            "<div class=\"calendar-events\">" + list.map(chip).join("") + "</div></div>"
        );
      }
      grid = "<div class=\"calendar-grid calendar-grid--week\">" + days.join("") + "</div>";
    } else if (view === "month") {
      label = cursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const start = startOfWeek(first);
      const cells = [];
      for (let i = 0; i < 42; i++) {
        const d = new Date(start); d.setDate(d.getDate() + i);
        const other = d.getMonth() !== cursor.getMonth();
        const list = eventsOnDay(events, d);
        cells.push(
          "<div class=\"calendar-day" + (other ? " other-month" : "") + (API.dateStr(d) === todayISO() ? " is-today" : "") + "\" data-cal-day=\"" + API.dateStr(d) + "\">" +
            "<div class=\"calendar-day-header\"><span class=\"calendar-day-name\">" + d.toLocaleDateString("fr-FR", { weekday: "short" }) +
            "</span><span class=\"calendar-day-number\">" + d.getDate() + "</span></div>" +
            "<div class=\"calendar-events\">" + list.map(chip).join("") + "</div></div>"
        );
      }
      grid = "<div class=\"calendar-grid calendar-grid--month\">" + cells.join("") + "</div>";
    } else {
      label = String(cursor.getFullYear());
      const months = [];
      for (let m = 0; m < 12; m++) {
        const monthDate = new Date(cursor.getFullYear(), m, 1);
        const list = events.filter(function (e) { return new Date(e.start).getFullYear() === cursor.getFullYear() && new Date(e.start).getMonth() === m; });
        months.push(
          "<div class=\"calendar-day\"><div class=\"calendar-day-header\"><span class=\"calendar-day-name\">" +
          monthDate.toLocaleDateString("fr-FR", { month: "long" }) + "</span></div>" +
          "<div class=\"calendar-events\">" + list.slice(0, 4).map(chip).join("") +
          (list.length > 4 ? "<span class=\"text-mute\">+" + (list.length - 4) + "</span>" : "") + "</div></div>"
        );
      }
      grid = "<div class=\"calendar-grid calendar-grid--year\">" + months.join("") + "</div>";
    }

    const sel = App.selectedEvent ? events.find(function (e) { return e.id === App.selectedEvent; }) : null;
    content.innerHTML =
      "<section class=\"evenement section dash-section-page\" id=\"dashboard-calendar\">" +
        "<div class=\"agenda-contain\">" +
          "<div class=\"title\"><header class=\"section-title\"><h2>Mon Agenda</h2>" +
            "<div class=\"agenda-action\"><button type=\"button\" id=\"addEventBtn\" class=\"btn btn-primary\">+ Nouvel événement</button></div></header></div>" +
          "<div class=\"calendar-controls\">" +
            "<div class=\"calendar-view-switch\">" +
              "<button type=\"button\" class=\"calendar-view-btn" + (view === "week" ? " is-active" : "") + "\" data-calendar-view=\"week\">Semaine</button>" +
              "<button type=\"button\" class=\"calendar-view-btn" + (view === "month" ? " is-active" : "") + "\" data-calendar-view=\"month\">Mois</button>" +
              "<button type=\"button\" class=\"calendar-view-btn" + (view === "year" ? " is-active" : "") + "\" data-calendar-view=\"year\">Année</button>" +
            "</div>" +
            "<div class=\"calendar-nav\">" +
              "<button type=\"button\" class=\"calendar-nav-btn\" data-calendar-nav=\"-1\" aria-label=\"Précédent\"><i class=\"fas fa-chevron-left\"></i></button>" +
              "<div id=\"dashboard-calendar-label\">" + esc(label) + "</div>" +
              "<button type=\"button\" class=\"calendar-nav-btn\" data-calendar-nav=\"1\" aria-label=\"Suivant\"><i class=\"fas fa-chevron-right\"></i></button>" +
            "</div></div>" +
          "<div id=\"public-calendar-details\" class=\"calendar-details\">" +
            (sel
              ? "<div><h3>" + esc(sel.title) + "</h3><p>" + (sel.allDay ? "Toute la journée" : fmtDateTime(sel.start) + " → " + fmtDateTime(sel.end)) + "</p>" +
                (sel.description ? "<p>" + esc(sel.description) + "</p>" : "") + "</div>" +
                "<div class=\"agenda-action\"><button type=\"button\" class=\"btn btn-primary\" data-edit-event=\"" + sel.id + "\">Modifier</button>" +
                "<button type=\"button\" class=\"btn btn-danger\" data-del-event=\"" + sel.id + "\">Supprimer</button></div>"
              : "<p class=\"calendar-details-empty\">Sélectionner un événement pour voir les détails</p>") +
          "</div>" + grid +
        "</div></section>";
  }

  function eventForm(ev, presetDay) {
    const start = ev ? new Date(ev.start) : new Date();
    if (!ev && presetDay) {
      const p = presetDay.split("-");
      start.setFullYear(+p[0], +p[1] - 1, +p[2]);
      start.setHours(9, 0, 0, 0);
    }
    const end = ev ? new Date(ev.end) : new Date(start.getTime() + 3600000);
    openModal({
      kind: "agenda",
      title: ev ? "Modifier l'événement" : "Nouvel événement",
      icon: "fas fa-calendar-plus",
      body:
        field("ev-title", "Titre *", "text", ev ? ev.title : "") +
        "<div class=\"form-group checkbox-group\"><label class=\"checkbox-label\"><input type=\"checkbox\" id=\"ev-all\"" + (ev && ev.allDay ? " checked" : "") + "> <span>Toute la journée</span></label></div>" +
        "<div class=\"row-group\" style=\"display:grid;grid-template-columns:1fr 1fr;gap:12px\">" +
          field("ev-sd", "Date début *", "date", API.dateStr(start)) + field("ev-ed", "Date fin *", "date", API.dateStr(end)) +
        "</div>" +
        "<div class=\"row-group\" id=\"ev-times\" style=\"display:grid;grid-template-columns:1fr 1fr;gap:12px\">" +
          field("ev-st", "Heure début", "time", API.timeStr(start)) + field("ev-et", "Heure fin", "time", API.timeStr(end)) +
        "</div>" +
        field("ev-desc", ev ? "Lieu" : "Description", "text", ev ? ev.description : "") +
        "<div class=\"form-group\"><label for=\"ev-color\">Couleur</label><input type=\"color\" id=\"ev-color\" value=\"" + esc(ev && ev.color ? ev.color : "#5b7cfa") + "\"></div>",
      footer: (ev ? "<button type=\"button\" class=\"btn btn-danger-outline\" id=\"ev-del\"><i class=\"fas fa-trash-alt\"></i> Supprimer</button>" : "") +
        "<button type=\"button\" class=\"btn btn-annuler\" data-close-modal>Annuler</button>" +
        "<button type=\"button\" class=\"btn btn-primary\" id=\"ev-save\">Enregistrer</button>",
      onOpen: function (root) {
        const times = root.querySelector("#ev-times");
        const sync = function () { times.style.display = root.querySelector("#ev-all").checked ? "none" : "grid"; };
        sync();
        root.querySelector("#ev-all").addEventListener("change", sync);
        root.querySelector("#ev-save").addEventListener("click", async function () {
          const all = root.querySelector("#ev-all").checked;
          const sd = root.querySelector("#ev-sd").value;
          const ed = root.querySelector("#ev-ed").value;
          const saved = await guard(function () {
            return API.upsertEvent({
              id: ev ? ev.id : undefined,
              title: root.querySelector("#ev-title").value.trim(),
              allDay: all,
              start: all ? sd + "T00:00:00" : sd + "T" + (root.querySelector("#ev-st").value || "09:00") + ":00",
              end: all ? ed + "T23:59:00" : ed + "T" + (root.querySelector("#ev-et").value || "10:00") + ":00",
              description: root.querySelector("#ev-desc").value,
              color: root.querySelector("#ev-color").value
            });
          });
          if (saved) { closeModal(); App.selectedEvent = saved.id; notify("Événement enregistré", "success"); render(); }
        });
        const del = root.querySelector("#ev-del");
        if (del) del.addEventListener("click", async function () {
          const ok = await guard(function () { return API.deleteEvent(ev.id); });
          if (ok) { closeModal(); App.selectedEvent = null; notify("Événement supprimé", "success"); render(); }
        });
      }
    });
  }

  /* ---------- Réception ---------- */
  async function renderReception() {
    const meta = RECEP_META[App.recep] || RECEP_META.entrer;
    const iconMap = { entrer: "fa-boxes-stacked", disques: "fa-hard-drive", commande: "fa-file-invoice", dons: "fa-hand-holding-heart", prets: "fa-handshake", inventaire: "fa-clipboard-list", historique: "fa-clock-rotate-left" };
    content.innerHTML =
      "<div class=\"r-root\" role=\"application\" aria-label=\"Réception\">" +
        "<header class=\"r-header\">" +
          "<div class=\"r-brand\"><span class=\"r-brand-kicker\">Workspace</span><h1 class=\"r-brand-title\">Reception</h1><span class=\"r-brand-subtitle\">Flux, suivi et archives</span></div>" +
          "<nav class=\"r-nav\">" +
            "<div class=\"r-nav-group\"><div class=\"r-nav-group-title\">Flux</div>" +
              nav("entrer", "fa-boxes-stacked", "Lots") +
              nav("disques", "fa-hard-drive", "Disques") +
              nav("commande", "fa-file-invoice", "Commande") +
              nav("dons", "fa-hand-holding-heart", "Dons") +
              nav("prets", "fa-handshake", "Prêts matériel") +
            "</div>" +
            "<div class=\"r-nav-group\"><div class=\"r-nav-group-title\">Suivi</div>" +
              nav("inventaire", "fa-clipboard-list", "Inventaire") +
              nav("historique", "fa-clock-rotate-left", "Historique") +
            "</div>" +
          "</nav></header>" +
        "<main class=\"r-main\">" +
          "<header class=\"r-main-header\"><div class=\"r-main-header-text\">" +
            "<span class=\"r-main-kicker\">Module Reception</span>" +
            "<h2 class=\"r-main-title\"><i class=\"fa-solid " + (iconMap[App.recep] || "fa-folder-open") + " r-main-title-icon\"></i> <span id=\"reception-page-title\">" + esc(meta.title) + "</span></h2>" +
            "<p class=\"r-main-desc\"><i class=\"fa-solid fa-circle-info\"></i> <span>" + esc(meta.desc) + "</span></p>" +
          "</div></header>" +
          "<div class=\"recep-section\" id=\"reception-content\"></div>" +
        "</main></div>";

    function nav(id, icon, label) {
      return "<button type=\"button\" class=\"r-nav-item" + (App.recep === id ? " active" : "") + "\" data-page=\"" + id + "\" data-reception-page=\"true\">" +
        "<span class=\"r-nav-icon\"><i class=\"fa-solid " + icon + "\"></i></span><span class=\"r-nav-text\">" + label + "</span></button>";
    }

    const el = document.getElementById("reception-content");
    const pages = { entrer: renderLots, disques: renderDisques, commande: renderCommande, dons: renderDons, prets: renderPrets, inventaire: renderInventaire, historique: renderHistorique };
    await (pages[App.recep] || renderLots)(el);
  }

  function emptyRow(o) {
    return Object.assign({ id: API.uid("tmp"), sn: "", type: "portable", brand: "", model: "", enteredAt: new Date().toISOString(), mode: "MANUEL", selected: false }, o || {});
  }
  function emptyDisk() {
    return { id: API.uid("tmp"), sn: "", type: "SSD", brand: "", model: "", size: "", iface: "SATA", destroy: false };
  }
  function emptyCmd() { return { product: "", qty: 1, price: 0, shipping: 0, url: "" }; }
  function emptyDon() { return { type: "portable", brand: "", model: "", sn: "", date: todayISO(), stagiaire: "" }; }
  function emptyPret() { return { type: "PC", brand: "", model: "", sn: "", qty: 1 }; }

  function sampleLotDraft() {
    const t = new Date().toISOString();
    return {
      name: "Lot Vega (en cours)",
      rows: [
        emptyRow({ sn: "NX-SCAN-4410", type: "portable", brand: "Dell", model: "Latitude 5410", mode: "SCAN", enteredAt: t }),
        emptyRow({ sn: "NX-SCAN-4411", type: "portable", brand: "Lenovo", model: "ThinkPad T14", mode: "SCAN", enteredAt: t }),
        emptyRow({ mode: "SCAN" })
      ]
    };
  }
  function sampleDiskDraft() {
    return {
      name: "Session shred Vega (en cours)",
      rows: [
        Object.assign(emptyDisk(), { sn: "DSK-NEXA-551", type: "SSD", brand: "Samsung", model: "870 EVO", size: "500 Go", iface: "SATA" }),
        Object.assign(emptyDisk(), { sn: "DSK-NEXA-552", type: "HDD", brand: "Seagate", model: "Barracuda 2TB", size: "2 To", iface: "SATA", destroy: true }),
        emptyDisk()
      ]
    };
  }
  function sampleDonDraft() {
    return {
      name: "Don promo Helios (en cours)",
      rows: [
        Object.assign(emptyDon(), { type: "portable", brand: "HP", model: "EliteBook 840 G7", sn: "NX-DON-WIP-02", stagiaire: "Iris Vale" }),
        Object.assign(emptyDon(), { type: "portable", brand: "Asus", model: "VivoBook 15", sn: "NX-DON-WIP-03", stagiaire: "Remy Calder" }),
        emptyDon()
      ]
    };
  }
  function samplePretDraft() {
    const endD = new Date(); endD.setMonth(endD.getMonth() + 1);
    return {
      name: "Prêt Helios (en cours)",
      reference: "PRET-NEXA-WIP",
      borrowerType: "societe",
      borrowerName: "Helios Atelier",
      contact: "pret.helios@nexa.demo",
      startDate: todayISO(),
      endDate: API.dateStr(endD),
      paid: false,
      amount: "",
      rows: [
        Object.assign(emptyPret(), { type: "PC", brand: "Lenovo", model: "ThinkPad T14", sn: "NX-PRET-WIP-01", qty: 1 }),
        Object.assign(emptyPret(), { type: "souris", brand: "HP", model: "", sn: "", qty: 2 }),
        emptyPret()
      ]
    };
  }

  async function renderLots(el) {
    const cat = await catalog();
    if (!App.lotDraft) App.lotDraft = sampleLotDraft();
    const d = App.lotDraft;
    const selected = d.rows.filter(function (r) { return r.selected; }).length;
    el.innerHTML =
      "<section class=\"recep-page lot-page entrer-page lots-saisie-page\"><div class=\"lot-page__body\">" +
        "<div class=\"lot-toolbar\">" +
          "<input class=\"lot-toolbar__name\" type=\"text\" id=\"lot-name\" placeholder=\"Nom du lot (optionnel)\" value=\"" + esc(d.name) + "\">" +
          "<div class=\"lot-toolbar__actions\">" +
            "<button type=\"button\" class=\"lot-btn lot-btn--ghost\" id=\"lot-add\"><i class=\"fa-solid fa-plus\"></i> Ligne</button>" +
            "<button type=\"button\" class=\"lot-btn lot-btn--secondary\" id=\"lot-brand\"><i class=\"fa-solid fa-plus\"></i> Marque</button>" +
            "<button type=\"button\" class=\"lot-btn lot-btn--secondary\" id=\"lot-model\"><i class=\"fa-solid fa-plus\"></i> Modèle</button>" +
            "<span class=\"lot-toolbar__sep\"></span>" +
            "<span class=\"lot-toolbar__count\"><span>" + d.rows.length + "</span></span>" +
            "<button type=\"button\" class=\"lot-btn lot-btn--muted\" id=\"lot-reset\"><i class=\"fa-solid fa-arrow-rotate-right\"></i> Nouveau</button>" +
            "<button type=\"button\" class=\"lot-btn lot-btn--primary\" id=\"lot-save\"><i class=\"fa-solid fa-floppy-disk\"></i> Enregistrer</button>" +
          "</div></div>" +
        (selected ? "<div class=\"lot-selection-bar\"><span>" + selected + " sélectionnée(s)</span><button type=\"button\" class=\"lot-btn lot-btn--primary\" id=\"lot-mass\"><i class=\"fa-solid fa-check-double\"></i> Appliquer</button></div>" : "") +
        "<div class=\"lot-table-area\"><div class=\"lot-table-wrap\"><table class=\"lot-table\"><thead><tr>" +
          "<th class=\"lot-table__th--select\"><input type=\"checkbox\" id=\"lot-all\" class=\"lot-checkbox\" title=\"Tout sélectionner\"></th>" +
          "<th class=\"lot-table__th--num\">#</th><th class=\"lot-table__th--sn\">S/N</th><th class=\"lot-table__th--type\">Type</th>" +
          "<th class=\"lot-table__th--marque\">Marque</th><th class=\"lot-table__th--modele\">Modèle</th>" +
          "<th class=\"lot-table__th--date\">Date</th><th class=\"lot-table__th--entree\">Entrée</th><th class=\"lot-table__th--action\"></th>" +
        "</tr></thead><tbody>" +
        d.rows.map(function (r, i) {
          const entry = (r.mode || "MANUEL").toLowerCase() === "scan" ? "scan" : "manuel";
          return "<tr data-i=\"" + i + "\">" +
            "<td data-label=\"Sélection\"><input type=\"checkbox\" class=\"row-checkbox lot-sel\"" + (r.selected ? " checked" : "") + " title=\"Sélectionner cette ligne\"></td>" +
            "<td data-label=\"N°\"><span>" + (i + 1) + "</span></td>" +
            "<td data-label=\"S/N\"><input type=\"text\" name=\"serial_number\" class=\"lot-sn\" value=\"" + esc(r.sn) + "\" placeholder=\"S/N\" required></td>" +
            "<td data-label=\"Type\"><div class=\"type-cell-wrapper\"><select name=\"type\" class=\"lot-type\" required>" +
              "<option value=\"\">Type...</option>" +
              PC_TYPES.map(function (t) { return "<option value=\"" + t + "\"" + (r.type === t ? " selected" : "") + ">" + (t === "écran" ? "Écran" : t.charAt(0).toUpperCase() + t.slice(1)) + "</option>"; }).join("") +
            "</select></div></td>" +
            "<td data-label=\"Marque\"><select name=\"marque\" class=\"lot-brand\" required>" + brandOptions(cat.pcBrands, r.brand) + "</select></td>" +
            "<td data-label=\"Modèle\"><select name=\"modele\" class=\"lot-model\" required>" + modelOptions(cat.pcModels, r.brand, cat.pcBrands, r.model) + "</select></td>" +
            "<td data-label=\"Date / Heure\"><span class=\"row-date-display\">" + fmtDateTime(r.enteredAt) + "</span></td>" +
            "<td data-label=\"Entrée\"><span class=\"entry-badge " + entry + "\">" + esc(r.mode) + "</span></td>" +
            "<td data-label=\"Action\"><button type=\"button\" class=\"btn-delete-row lot-del\" title=\"Supprimer cette ligne\"><i class=\"fa-solid fa-trash\"></i></button></td></tr>";
        }).join("") +
        "</tbody></table></div></div></div></section>";

    function sync(tr) {
      const r = d.rows[+tr.getAttribute("data-i")];
      r.sn = tr.querySelector(".lot-sn").value;
      r.type = tr.querySelector(".lot-type").value;
      r.brand = tr.querySelector(".lot-brand").value;
      r.model = tr.querySelector(".lot-model").value;
      r.selected = tr.querySelector(".lot-sel").checked;
    }
    el.querySelector("#lot-name").addEventListener("input", function (e) { d.name = e.target.value; });
    el.querySelectorAll("tbody tr").forEach(function (tr) {
      tr.addEventListener("change", function (e) {
        const i = +tr.getAttribute("data-i");
        const prev = d.rows[i].brand;
        sync(tr);
        if (e.target.classList.contains("lot-brand") && d.rows[i].brand !== prev) {
          d.rows[i].model = "";
          tr.querySelector(".lot-model").innerHTML = modelOptions(cat.pcModels, d.rows[i].brand, cat.pcBrands, "");
        }
        if (e.target.classList.contains("lot-sel")) renderLots(el);
      });
      tr.querySelector(".lot-sn").addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault(); sync(tr);
          d.rows.push(emptyRow({ mode: "SCAN" }));
          renderLots(el).then(function () {
            const inputs = el.querySelectorAll(".lot-sn");
            inputs[inputs.length - 1].focus();
          });
        }
      });
      tr.querySelector(".lot-del").addEventListener("click", function () {
        d.rows.splice(+tr.getAttribute("data-i"), 1);
        if (!d.rows.length) d.rows.push(emptyRow());
        renderLots(el);
      });
    });
    el.querySelector("#lot-add").addEventListener("click", function () { d.rows.push(emptyRow()); renderLots(el); });
    el.querySelector("#lot-all").addEventListener("change", function (e) { d.rows.forEach(function (r) { r.selected = e.target.checked; }); renderLots(el); });
    el.querySelector("#lot-reset").addEventListener("click", function () {
      App.lotDraft = { name: "", rows: [emptyRow({ mode: "SCAN" })] }; renderLots(el);
    });
    el.querySelector("#lot-brand").addEventListener("click", function () { promptBrand("pc", function () { renderLots(el); }); });
    el.querySelector("#lot-model").addEventListener("click", function () { promptModel("pc", function () { renderLots(el); }); });
    const mass = el.querySelector("#lot-mass");
    if (mass) mass.addEventListener("click", function () {
      openModal({
        title: "Appliquer à la sélection",
        icon: "fa-solid fa-layer-group",
        body: selectField("mass-type", "Type", [{ value: "", label: "Ne pas modifier" }].concat(PC_TYPES), "") +
          selectField("mass-brand", "Marque", [{ value: "", label: "Ne pas modifier" }].concat(cat.pcBrands.map(function (b) { return { value: b.name, label: b.name }; })), "") +
          "<div class=\"form-group\"><label>Modèle</label><select id=\"mass-model\" class=\"lots-modal__input\"><option value=\"\">Ne pas modifier</option></select></div>",
        footer: "<button type=\"button\" class=\"lots-modal__btn lots-modal__btn--cancel\" data-close-modal>Annuler</button><button type=\"button\" class=\"lots-modal__btn lots-modal__btn--submit\" id=\"mass-ok\">Appliquer</button>",
        onOpen: function (root) {
          root.querySelector("#mass-brand").addEventListener("change", function () {
            root.querySelector("#mass-model").innerHTML = modelOptions(cat.pcModels, root.querySelector("#mass-brand").value, cat.pcBrands, "");
          });
          root.querySelector("#mass-ok").addEventListener("click", function () {
            const t = root.querySelector("#mass-type").value, b = root.querySelector("#mass-brand").value, m = root.querySelector("#mass-model").value;
            d.rows.forEach(function (r) { if (!r.selected) return; if (t) r.type = t; if (b) r.brand = b; if (m) r.model = m; });
            closeModal(); renderLots(el);
          });
        }
      });
    });
    el.querySelector("#lot-save").addEventListener("click", async function () {
      el.querySelectorAll("tbody tr").forEach(sync);
      const saved = await guard(function () { return API.createLot({ name: d.name, items: d.rows }); });
      if (saved) {
        App.lotDraft = { name: "", rows: [emptyRow({ mode: "SCAN" })] };
        notify("Lot enregistré, redirection vers l'inventaire", "success");
        go("#/reception/inventaire");
      }
    });
  }

  function promptBrand(kind, rerender) {
    openModal({
      title: "Nouvelle marque", icon: "fa-solid fa-building",
      body: field("new-brand", "Nom de la marque", "text", "", "placeholder=\"Ex : Dell, HP…\" autofocus"),
      footer: "<button type=\"button\" class=\"lots-modal__btn lots-modal__btn--cancel\" data-close-modal>Annuler</button><button type=\"button\" class=\"lots-modal__btn lots-modal__btn--submit\" id=\"save-brand\">Ajouter</button>",
      onOpen: function (root) {
        root.querySelector("#save-brand").addEventListener("click", async function () {
          const item = await guard(function () { return API.addBrand(kind === "disk" ? "disk" : "pc", root.querySelector("#new-brand").value); });
          if (item) { App.catalog = null; closeModal(); notify("Marque ajoutée", "success"); rerender(); }
        });
      }
    });
  }

  function promptModel(kind, rerender) {
    const cat = App.catalog;
    const brands = kind === "disk" ? cat.diskBrands : cat.pcBrands;
    openModal({
      title: "Nouveau modèle", icon: "fa-solid fa-laptop",
      body: selectField("new-model-brand", "Marque", [{ value: "", label: "Choisir" }].concat(brands.map(function (b) { return { value: b.id, label: b.name }; })), "") +
        field("new-model-name", "Nom du modèle", "text", ""),
      footer: "<button type=\"button\" class=\"lots-modal__btn lots-modal__btn--cancel\" data-close-modal>Annuler</button><button type=\"button\" class=\"lots-modal__btn lots-modal__btn--submit\" id=\"save-model\">Ajouter</button>",
      onOpen: function (root) {
        root.querySelector("#save-model").addEventListener("click", async function () {
          const item = await guard(function () { return API.addModel(kind === "disk" ? "disk" : "pc", root.querySelector("#new-model-brand").value, root.querySelector("#new-model-name").value); });
          if (item) { App.catalog = null; closeModal(); notify("Modèle ajouté", "success"); rerender(); }
        });
      }
    });
  }

  async function renderDisques(el) {
    const cat = await catalog();
    if (!App.diskDraft) App.diskDraft = sampleDiskDraft();
    const d = App.diskDraft;
    el.innerHTML =
      "<section class=\"recep-page lot-page entrer-page lots-saisie-page\"><div class=\"lot-page__body\">" +
        "<div class=\"lot-toolbar\" role=\"toolbar\" aria-label=\"Actions session disques\">" +
          "<input class=\"lot-toolbar__name\" type=\"text\" id=\"ds-name\" value=\"" + esc(d.name) + "\" placeholder=\"Nom du lot (optionnel)\" maxlength=\"255\" autocomplete=\"off\">" +
          "<div class=\"lot-toolbar__actions\">" +
            "<button type=\"button\" class=\"lot-btn lot-btn--ghost\" id=\"ds-add\"><i class=\"fa-solid fa-plus\"></i> Ligne</button>" +
            "<button type=\"button\" class=\"lot-btn lot-btn--secondary\" id=\"ds-brand\"><i class=\"fa-solid fa-plus\"></i> Marque</button>" +
            "<button type=\"button\" class=\"lot-btn lot-btn--secondary\" id=\"ds-model\"><i class=\"fa-solid fa-plus\"></i> Modèle</button>" +
            "<button type=\"button\" class=\"lot-btn lot-btn--secondary\" id=\"ds-detect\"><i class=\"fa-solid fa-memory\"></i> Détection</button>" +
            "<span class=\"lot-toolbar__sep\"></span>" +
            "<button type=\"button\" class=\"lot-btn lot-btn--muted\" id=\"ds-reset\"><i class=\"fa-solid fa-arrow-rotate-right\"></i> Nouveau</button>" +
            "<button type=\"button\" class=\"lot-btn lot-btn--primary\" id=\"ds-save\"><i class=\"fa-solid fa-floppy-disk\"></i> Enregistrer</button>" +
          "</div></div>" +
        "<div class=\"lot-table-area\"><div class=\"lot-table-wrap\"><table class=\"lot-table\" id=\"disques-session-table\"><thead><tr>" +
          "<th class=\"lot-table__th--select\"><input type=\"checkbox\" id=\"disques-select-all\" class=\"lot-checkbox\" title=\"Tout sélectionner\"></th>" +
          "<th class=\"lot-table__th--num\">#</th><th class=\"lot-table__th--sn\">S/N</th><th class=\"lot-table__th--type\">Type</th>" +
          "<th class=\"lot-table__th--marque\">Marque</th><th class=\"lot-table__th--modele\">Modèle</th>" +
          "<th class=\"lot-table__th--date\">Taille</th><th class=\"lot-table__th--entree\">Interface</th>" +
          "<th class=\"lot-table__th--destroy\" title=\"Destruction physique\">D.phy</th><th class=\"lot-table__th--shred\">Shred</th>" +
          "<th class=\"lot-table__th--action\"></th>" +
        "</tr></thead><tbody>" +
        d.rows.map(function (r, i) {
          const shred = r.destroy ? "Destruction physique" : r.type === "SSD" ? "Secure E. + Sanitize" : "DoD";
          return "<tr data-i=\"" + i + "\">" +
            "<td data-label=\"Sélection\"><input type=\"checkbox\" class=\"row-checkbox js-disques-row-check\" title=\"Sélectionner\"></td>" +
            "<td data-label=\"N°\"><span>" + (i + 1) + "</span></td>" +
            "<td data-label=\"S/N\"><input type=\"text\" name=\"disques_serial\" class=\"ds-sn\" value=\"" + esc(r.sn) + "\" placeholder=\"S/N\" autocomplete=\"off\"></td>" +
            "<td data-label=\"Type\"><select name=\"disk_type\" class=\"ds-type js-disques-disk-type\"><option value=\"SSD\"" + (r.type === "SSD" ? " selected" : "") + ">SSD</option><option value=\"HDD\"" + (r.type === "HDD" ? " selected" : "") + ">HDD</option></select></td>" +
            "<td data-label=\"Marque\"><div class=\"type-cell-wrapper\"><select class=\"ds-brand\">" + brandOptions(cat.diskBrands, r.brand) + "</select></div></td>" +
            "<td data-label=\"Modèle\"><div class=\"type-cell-wrapper\"><select class=\"ds-model\">" + modelOptions(cat.diskModels, r.brand, cat.diskBrands, r.model) + "</select></div></td>" +
            "<td data-label=\"Taille\"><div class=\"type-cell-wrapper\"><input type=\"text\" class=\"ds-size\" value=\"" + esc(r.size) + "\" placeholder=\"500 Go\"></div></td>" +
            "<td data-label=\"Interface\"><div class=\"type-cell-wrapper\"><select class=\"ds-iface\" name=\"disques_interface\"><option>SATA</option><option" + (r.iface === "NVMe" ? " selected" : "") + ">NVMe</option><option" + (r.iface === "USB" ? " selected" : "") + ">USB</option></select></div></td>" +
            "<td data-label=\"Destr. phy.\"><label class=\"disques-row-dest-label\" title=\"Destruction physique\"><input type=\"checkbox\" class=\"ds-des js-disques-destruction\"" + (r.destroy ? " checked" : "") + "></label></td>" +
            "<td data-label=\"Shred\"><span class=\"js-disques-shred-label disques-shred-text\">" + esc(shred) + "</span></td>" +
            "<td data-label=\"Action\"><button type=\"button\" class=\"btn-delete-row ds-del\" title=\"Supprimer la ligne\"><i class=\"fa-solid fa-trash\"></i></button></td></tr>";
        }).join("") + "</tbody></table></div></div></div></section>";

    function sync(tr) {
      const r = d.rows[+tr.getAttribute("data-i")];
      r.sn = tr.querySelector(".ds-sn").value; r.type = tr.querySelector(".ds-type").value;
      r.brand = tr.querySelector(".ds-brand").value; r.model = tr.querySelector(".ds-model").value;
      r.size = tr.querySelector(".ds-size").value; r.iface = tr.querySelector(".ds-iface").value;
      r.destroy = tr.querySelector(".ds-des").checked;
    }
    el.querySelector("#ds-name").addEventListener("input", function (e) { d.name = e.target.value; });
    el.querySelectorAll("tbody tr").forEach(function (tr) {
      tr.addEventListener("change", function (e) {
        const i = +tr.getAttribute("data-i"); const prev = d.rows[i].brand;
        sync(tr);
        if (e.target.classList.contains("ds-brand") && d.rows[i].brand !== prev) {
          d.rows[i].model = ""; tr.querySelector(".ds-model").innerHTML = modelOptions(cat.diskModels, d.rows[i].brand, cat.diskBrands, "");
        } else if (e.target.classList.contains("ds-type") || e.target.classList.contains("ds-des")) renderDisques(el);
      });
      tr.querySelector(".ds-del").addEventListener("click", function () {
        d.rows.splice(+tr.getAttribute("data-i"), 1); if (!d.rows.length) d.rows.push(emptyDisk()); renderDisques(el);
      });
    });
    el.querySelector("#ds-add").addEventListener("click", function () { d.rows.push(emptyDisk()); renderDisques(el); });
    const dsAll = el.querySelector("#disques-select-all");
    if (dsAll) dsAll.addEventListener("change", function (e) {
      el.querySelectorAll(".js-disques-row-check").forEach(function (cb) { cb.checked = e.target.checked; });
    });
    el.querySelector("#ds-reset").addEventListener("click", function () { App.diskDraft = { name: "", rows: [emptyDisk()] }; renderDisques(el); });
    el.querySelector("#ds-brand").addEventListener("click", function () { promptBrand("disk", function () { renderDisques(el); }); });
    el.querySelector("#ds-model").addEventListener("click", function () { promptModel("disk", function () { renderDisques(el); }); });
    el.querySelector("#ds-detect").addEventListener("click", function () {
      const disks = API.detectDisks();
      openModal({
        title: "Disques détectés", icon: "fa-solid fa-memory",
        body: "<p class=\"lots-modal__help\">Simulation de détection (lsblk). Sélectionnez les disques à ajouter.</p>" +
          disks.map(function (disk, i) {
            return "<label class=\"checkbox-label\" style=\"display:flex;gap:8px;margin:8px 0\"><input type=\"checkbox\" class=\"lsblk-ck\" data-i=\"" + i + "\" checked> <span><strong>" + esc(disk.sn) + "</strong> : " + esc(disk.brand) + " " + esc(disk.model) + " (" + esc(disk.size) + ")</span></label>";
          }).join(""),
        footer: "<button type=\"button\" class=\"lots-modal__btn lots-modal__btn--cancel\" data-close-modal>Fermer</button><button type=\"button\" class=\"lots-modal__btn lots-modal__btn--submit\" id=\"lsblk-add\">Ajouter</button>",
        onOpen: function (root) {
          root.querySelector("#lsblk-add").addEventListener("click", function () {
            root.querySelectorAll(".lsblk-ck:checked").forEach(function (ck) { d.rows.push(Object.assign(emptyDisk(), disks[+ck.getAttribute("data-i")])); });
            if (d.rows.length > 1 && !d.rows[0].sn) d.rows.shift();
            closeModal(); notify("Disques ajoutés (détection simulée)", "success"); renderDisques(el);
          });
        }
      });
    });
    el.querySelector("#ds-save").addEventListener("click", async function () {
      el.querySelectorAll("tbody tr").forEach(sync);
      const saved = await guard(function () { return API.createDiskSession({ name: d.name, items: d.rows }); });
      if (saved) { App.diskDraft = { name: "", rows: [emptyDisk()] }; notify("Session enregistrée + PDF généré", "success"); go("#/reception/historique"); }
    });
  }

  async function renderCommande(el) {
    const cat = await catalog();
    if (!App.cmdDraft) App.cmdDraft = { name: "", category: cat.categories[0] || "", rows: [emptyCmd()] };
    const d = App.cmdDraft;
    el.innerHTML =
      "<section class=\"recep-page lot-page commande-container\"><div class=\"lot-page__body\">" +
        "<div class=\"recep-toolbar-compact\" role=\"toolbar\">" +
          "<div class=\"lot-config__field\"><label class=\"lot-config__label\"><i class=\"fa-solid fa-file-lines\"></i> Nom</label><input class=\"lot-config__input\" id=\"cmd-name\" value=\"" + esc(d.name) + "\" placeholder=\"Ex : Commande fournitures…\"></div>" +
          "<div class=\"lot-config__field\"><label class=\"lot-config__label\"><i class=\"fa-solid fa-folder-tree\"></i> Catégorie</label><select class=\"lot-config__input\" id=\"cmd-cat\">" +
            cat.categories.map(function (c) { return "<option" + (d.category === c ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select></div>" +
          "<div class=\"lot-config__actions\">" +
            "<button type=\"button\" class=\"lot-btn lot-btn--ghost\" id=\"cmd-add\"><i class=\"fa-solid fa-plus\"></i> Ligne</button>" +
            "<button type=\"button\" class=\"lot-btn lot-btn--secondary\" id=\"cmd-prod\"><i class=\"fa-solid fa-plus\"></i> Produit</button>" +
            "<button type=\"button\" class=\"lot-btn lot-btn--secondary\" id=\"cmd-newcat\"><i class=\"fa-solid fa-plus\"></i> Catégorie</button>" +
            "<button type=\"button\" class=\"lot-btn lot-btn--primary\" id=\"cmd-save\"><i class=\"fa-solid fa-floppy-disk\"></i> Enregistrer</button>" +
          "</div></div>" +
        "<div class=\"lot-card lot-card--table\"><div class=\"lot-card__inner lot-card__inner--scroll\"><div class=\"lot-table-wrap\"><table class=\"lot-table\"><thead><tr>" +
          "<th class=\"lot-table__th--num\">#</th><th class=\"lot-table__th--produit\">Produit</th><th class=\"lot-table__th--quantite\">Qté</th>" +
          "<th class=\"lot-table__th--prix\">Prix (€)</th><th class=\"lot-table__th--frais-port\">Port (€)</th><th class=\"lot-table__th--liens\">Lien</th>" +
          "<th class=\"lot-table__th--action\"></th></tr></thead><tbody>" +
        d.rows.map(function (r, i) {
          return "<tr class=\"commande-line\" data-i=\"" + i + "\" data-line-index=\"" + i + "\">" +
            "<td class=\"col-num\" data-label=\"N°\">" + (i + 1) + "</td>" +
            "<td class=\"col-produit\" data-label=\"Produit\"><select class=\"cmd-prod commande-select-product recep-input\">" +
              "<option value=\"\">Produit...</option>" +
              cat.products.map(function (p) { return "<option" + (r.product === p ? " selected" : "") + ">" + esc(p) + "</option>"; }).join("") +
            "</select></td>" +
            "<td class=\"col-quantite\" data-label=\"Quantité\"><input type=\"number\" min=\"0\" class=\"cmd-qty commande-input-quantite recep-input\" value=\"" + esc(r.qty) + "\" placeholder=\"0\"></td>" +
            "<td class=\"col-prix\" data-label=\"Prix (€)\"><input type=\"number\" min=\"0\" step=\"0.01\" class=\"cmd-price commande-input-prix recep-input\" value=\"" + esc(r.price) + "\" placeholder=\"0,00\"></td>" +
            "<td class=\"col-frais-port\" data-label=\"Frais de port (€)\"><input type=\"number\" min=\"0\" step=\"0.01\" class=\"cmd-ship commande-input-frais-port recep-input\" value=\"" + esc(r.shipping) + "\" placeholder=\"0,00\"></td>" +
            "<td class=\"col-liens\" data-label=\"Liens\"><input type=\"text\" class=\"cmd-url commande-input-lien recep-input\" value=\"" + esc(r.url) + "\" placeholder=\"URL\"></td>" +
            "<td class=\"col-actions\" data-label=\"Action\"><button type=\"button\" class=\"recep-btn-icon btn-remove-line cmd-del\" title=\"Supprimer\"" + (d.rows.length <= 1 ? " disabled" : "") + "><i class=\"fas fa-trash\"></i></button></td></tr>";
        }).join("") + "</tbody></table></div></div></div></div></section>";

    function sync(tr) {
      const r = d.rows[+tr.getAttribute("data-i")];
      r.product = tr.querySelector(".cmd-prod").value; r.qty = tr.querySelector(".cmd-qty").value;
      r.price = tr.querySelector(".cmd-price").value; r.shipping = tr.querySelector(".cmd-ship").value; r.url = tr.querySelector(".cmd-url").value;
    }
    el.querySelector("#cmd-name").addEventListener("input", function (e) { d.name = e.target.value; });
    el.querySelector("#cmd-cat").addEventListener("change", function (e) { d.category = e.target.value; });
    el.querySelectorAll("tbody tr").forEach(function (tr) {
      tr.addEventListener("change", function () { sync(tr); });
      tr.querySelector(".cmd-del").addEventListener("click", function () {
        d.rows.splice(+tr.getAttribute("data-i"), 1); if (!d.rows.length) d.rows.push(emptyCmd()); renderCommande(el);
      });
    });
    el.querySelector("#cmd-add").addEventListener("click", function () { d.rows.push(emptyCmd()); renderCommande(el); });
    el.querySelector("#cmd-prod").addEventListener("click", function () {
      openModal({
        title: "Ajouter un produit", body: field("new-prod", "Nom du produit", "text", ""),
        footer: "<button type=\"button\" class=\"lots-modal__btn lots-modal__btn--cancel\" data-close-modal>Annuler</button><button type=\"button\" class=\"lots-modal__btn lots-modal__btn--submit\" id=\"save-prod\">Enregistrer</button>",
        onOpen: function (root) {
          root.querySelector("#save-prod").addEventListener("click", async function () {
            const n = await guard(function () { return API.addProduct(root.querySelector("#new-prod").value); });
            if (n) { App.catalog = null; closeModal(); notify("Produit ajouté", "success"); renderCommande(el); }
          });
        }
      });
    });
    el.querySelector("#cmd-newcat").addEventListener("click", function () {
      openModal({
        title: "Ajouter une catégorie", body: field("new-cat", "Catégorie", "text", ""),
        footer: "<button type=\"button\" class=\"lots-modal__btn lots-modal__btn--cancel\" data-close-modal>Annuler</button><button type=\"button\" class=\"lots-modal__btn lots-modal__btn--submit\" id=\"save-cat\">Enregistrer</button>",
        onOpen: function (root) {
          root.querySelector("#save-cat").addEventListener("click", async function () {
            const n = await guard(function () { return API.addCategory(root.querySelector("#new-cat").value); });
            if (n) { App.catalog = null; d.category = n; closeModal(); notify("Catégorie ajoutée", "success"); renderCommande(el); }
          });
        }
      });
    });
    el.querySelector("#cmd-save").addEventListener("click", async function () {
      el.querySelectorAll("tbody tr").forEach(sync);
      const saved = await guard(function () { return API.createCommande({ name: d.name, category: d.category, items: d.rows }); });
      if (saved) { App.cmdDraft = null; notify("Commande enregistrée + PDF", "success"); go("#/reception/historique"); }
    });
  }

  async function renderDons(el) {
    const cat = await catalog();
    if (!App.donDraft) App.donDraft = sampleDonDraft();
    const d = App.donDraft;
    el.innerHTML =
      "<section class=\"recep-page lot-page dons-container\"><div class=\"lot-page__body\">" +
        "<div class=\"recep-toolbar-compact\" role=\"toolbar\">" +
          "<div class=\"lot-config__field\"><label class=\"lot-config__label\"><i class=\"fa-solid fa-tag\"></i> Nom du lot</label><input class=\"lot-config__input\" id=\"don-name\" value=\"" + esc(d.name) + "\" placeholder=\"Ex : Don promo Helios\"></div>" +
          "<div class=\"lot-config__actions\">" +
            "<button type=\"button\" class=\"lot-btn lot-btn--ghost\" id=\"don-add\"><i class=\"fa-solid fa-plus\"></i> Ligne</button>" +
            "<button type=\"button\" class=\"lot-btn lot-btn--secondary\" id=\"don-brand\"><i class=\"fa-solid fa-plus\"></i> Marque</button>" +
            "<button type=\"button\" class=\"lot-btn lot-btn--secondary\" id=\"don-model\"><i class=\"fa-solid fa-plus\"></i> Modèle</button>" +
            "<button type=\"button\" class=\"lot-btn lot-btn--primary\" id=\"don-save\"><i class=\"fa-solid fa-floppy-disk\"></i> Enregistrer</button>" +
          "</div></div>" +
        "<div class=\"lot-card lot-card--table\"><div class=\"lot-card__inner lot-card__inner--scroll\"><div class=\"lot-table-wrap\"><table class=\"lot-table\"><thead><tr>" +
          "<th class=\"lot-table__th--num\">#</th><th class=\"lot-table__th--type\">Type</th><th class=\"lot-table__th--marque\">Marque</th>" +
          "<th class=\"lot-table__th--modele\">Modèle</th><th class=\"lot-table__th--sn\">S/N</th><th class=\"lot-table__th--date\">Date</th>" +
          "<th class=\"lot-table__th--stagiaire\">Bénéficiaire</th><th class=\"lot-table__th--action\"></th></tr></thead><tbody>" +
        d.rows.map(function (r, i) {
          return "<tr class=\"dons-line\" data-i=\"" + i + "\">" +
            "<td class=\"col-num\" data-label=\"N°\">" + (i + 1) + "</td>" +
            "<td class=\"col-type\" data-label=\"Type\"><div class=\"type-cell-wrapper\"><select class=\"don-type dons-select-type\">" +
              PC_TYPES.map(function (t) { return "<option value=\"" + t + "\"" + (r.type === t ? " selected" : "") + ">" + typeLabel(t) + "</option>"; }).join("") +
            "</select></div></td>" +
            "<td class=\"col-marque\" data-label=\"Marque\"><select class=\"don-brand dons-select-marque\">" + brandOptions(cat.pcBrands, r.brand) + "</select></td>" +
            "<td class=\"col-modele\" data-label=\"Modèle\"><select class=\"don-model dons-select-modele\">" + modelOptions(cat.pcModels, r.brand, cat.pcBrands, r.model) + "</select></td>" +
            "<td class=\"col-sn\" data-label=\"S/N\"><input type=\"text\" class=\"don-sn dons-input-sn\" value=\"" + esc(r.sn) + "\" placeholder=\"S/N\"></td>" +
            "<td class=\"col-date\" data-label=\"Date\"><input type=\"date\" class=\"don-date dons-input-date\" value=\"" + esc(r.date) + "\"></td>" +
            "<td class=\"col-stagiaire\" data-label=\"Bénéficiaire\"><input type=\"text\" class=\"don-st dons-input-stagiaire\" value=\"" + esc(r.stagiaire) + "\" placeholder=\"Nom\"></td>" +
            "<td class=\"col-actions\" data-label=\"Action\"><button type=\"button\" class=\"btn-remove-line don-del\" title=\"Supprimer\"" + (d.rows.length <= 1 ? " disabled" : "") + "><i class=\"fas fa-trash\"></i></button></td></tr>";
        }).join("") + "</tbody></table></div></div></div></div></section>";

    function sync(tr) {
      const r = d.rows[+tr.getAttribute("data-i")];
      r.type = tr.querySelector(".don-type").value; r.brand = tr.querySelector(".don-brand").value;
      r.model = tr.querySelector(".don-model").value; r.sn = tr.querySelector(".don-sn").value;
      r.date = tr.querySelector(".don-date").value; r.stagiaire = tr.querySelector(".don-st").value;
    }
    el.querySelector("#don-name").addEventListener("input", function (e) { d.name = e.target.value; });
    el.querySelectorAll("tbody tr").forEach(function (tr) {
      tr.addEventListener("change", function (e) {
        const i = +tr.getAttribute("data-i"); const prev = d.rows[i].brand; sync(tr);
        if (e.target.classList.contains("don-brand") && d.rows[i].brand !== prev) {
          d.rows[i].model = ""; tr.querySelector(".don-model").innerHTML = modelOptions(cat.pcModels, d.rows[i].brand, cat.pcBrands, "");
        }
      });
      tr.querySelector(".don-del").addEventListener("click", function () {
        d.rows.splice(+tr.getAttribute("data-i"), 1); if (!d.rows.length) d.rows.push(emptyDon()); renderDons(el);
      });
    });
    el.querySelector("#don-add").addEventListener("click", function () { d.rows.push(emptyDon()); renderDons(el); });
    el.querySelector("#don-brand").addEventListener("click", function () { promptBrand("pc", function () { renderDons(el); }); });
    el.querySelector("#don-model").addEventListener("click", function () { promptModel("pc", function () { renderDons(el); }); });
    el.querySelector("#don-save").addEventListener("click", async function () {
      el.querySelectorAll("tbody tr").forEach(sync);
      const saved = await guard(function () { return API.createDon({ name: d.name, items: d.rows }); });
      if (saved) { App.donDraft = null; notify("Don enregistré + certificat PDF", "success"); go("#/reception/historique"); }
    });
  }

  async function renderPrets(el) {
    const cat = await catalog();
    if (!App.pretDraft) App.pretDraft = samplePretDraft();
    const d = App.pretDraft;
    el.innerHTML =
      "<section class=\"recep-page lot-page prets-container\"><div class=\"lot-page__body\">" +
        "<div class=\"lot-card lot-card--config\"><div class=\"lot-card__inner\"><div class=\"prets-config-grid\">" +
          "<div class=\"lot-config__field\"><label class=\"lot-config__label\"><i class=\"fa-solid fa-tag\"></i> Nom du lot (PDF)</label><input class=\"lot-config__input\" id=\"pr-name\" value=\"" + esc(d.name) + "\" placeholder=\"Ex. Lot Helios mars 2026\"></div>" +
          "<div class=\"lot-config__field\"><label class=\"lot-config__label\"><i class=\"fa-solid fa-calendar-day\"></i> Début</label><input class=\"lot-config__input\" type=\"date\" id=\"pr-start\" value=\"" + esc(d.startDate) + "\"></div>" +
          "<div class=\"lot-config__field\"><label class=\"lot-config__label\"><i class=\"fa-solid fa-calendar-check\"></i> Fin</label><input class=\"lot-config__input\" type=\"date\" id=\"pr-end\" value=\"" + esc(d.endDate) + "\"></div>" +
          "<div class=\"lot-config__field\"><label class=\"lot-config__label\"><i class=\"fa-solid fa-building-user\"></i> Emprunteur</label><input class=\"lot-config__input\" id=\"pr-who\" value=\"" + esc(d.borrowerName) + "\" placeholder=\"Nom ou structure\"></div>" +
          "<div class=\"lot-config__field\"><label class=\"lot-config__label\"><i class=\"fa-solid fa-user-tag\"></i> Type</label><select class=\"lot-config__input\" id=\"pr-type\"><option value=\"personne\"" + (d.borrowerType === "personne" ? " selected" : "") + ">Personne</option><option value=\"societe\"" + (d.borrowerType === "societe" ? " selected" : "") + ">Structure</option></select></div>" +
          "<div class=\"prets-remuneration-row\"><label class=\"lot-config__label prets-payant-label\"><input type=\"checkbox\" id=\"pr-paid\"" + (d.paid ? " checked" : "") + "> Prêt payant</label>" +
          "<div class=\"lot-config__field\"><input class=\"lot-config__input\" type=\"number\" id=\"pr-amount\" min=\"0\" step=\"0.01\" placeholder=\"Montant (€)\" value=\"" + esc(d.amount) + "\"" + (d.paid ? "" : " disabled") + "></div></div>" +
        "</div><div class=\"lot-config__actions\"><button type=\"button\" class=\"lot-btn lot-btn--ghost\" id=\"pr-add\"><i class=\"fa-solid fa-plus\"></i> Ligne</button><button type=\"button\" class=\"lot-btn lot-btn--primary\" id=\"pr-save\"><i class=\"fa-solid fa-floppy-disk\"></i> Enregistrer</button></div></div></div>" +
        "<div class=\"lot-card lot-card--table\"><div class=\"lot-card__inner lot-card__inner--scroll\"><div class=\"lot-table-wrap\"><table class=\"lot-table\"><thead><tr>" +
          "<th class=\"lot-table__th--num\">#</th><th class=\"lot-table__th--type\">Type</th><th class=\"lot-table__th--marque\">Marque</th>" +
          "<th class=\"lot-table__th--modele\">Modèle</th><th class=\"lot-table__th--sn\">S/N</th><th class=\"lot-table__th--quantite\">Qté</th>" +
          "<th class=\"lot-table__th--action\"></th></tr></thead><tbody>" +
        d.rows.map(function (r, i) {
          return "<tr class=\"prets-line\" data-i=\"" + i + "\">" +
            "<td class=\"col-num\" data-label=\"N°\">" + (i + 1) + "</td>" +
            "<td class=\"col-type\" data-label=\"Type\"><div class=\"type-cell-wrapper\"><select class=\"pr-t prets-select-type\">" +
              PRET_TYPES.map(function (t) { return "<option" + (r.type === t ? " selected" : "") + ">" + t + "</option>"; }).join("") +
            "</select></div></td>" +
            "<td class=\"col-marque\" data-label=\"Marque\"><select class=\"pr-b\">" + brandOptions(cat.pcBrands, r.brand) + "</select></td>" +
            "<td class=\"col-modele\" data-label=\"Modèle\"><select class=\"pr-m\">" + modelOptions(cat.pcModels, r.brand, cat.pcBrands, r.model) + "</select></td>" +
            "<td class=\"col-sn\" data-label=\"S/N\"><input type=\"text\" class=\"pr-sn prets-in-sn lot-config__input\" value=\"" + esc(r.sn) + "\" placeholder=\"N° série\"></td>" +
            "<td class=\"col-quantite\" data-label=\"Qté\"><input type=\"number\" min=\"1\" class=\"pr-q prets-input-qty\" value=\"" + esc(r.qty) + "\"></td>" +
            "<td class=\"col-action\" data-label=\"\"><button type=\"button\" class=\"btn-remove-line pr-del\" title=\"Supprimer la ligne\"" + (d.rows.length <= 1 ? " disabled" : "") + "><i class=\"fa-solid fa-trash\"></i></button></td></tr>";
        }).join("") + "</tbody></table></div></div></div></div></section>";

    const map = { "pr-name": "name", "pr-start": "startDate", "pr-end": "endDate", "pr-who": "borrowerName", "pr-type": "borrowerType", "pr-amount": "amount" };
    Object.keys(map).forEach(function (id) {
      const node = el.querySelector("#" + id);
      node.addEventListener("input", function (e) { d[map[id]] = e.target.value; });
      node.addEventListener("change", function (e) { d[map[id]] = e.target.value; });
    });
    el.querySelector("#pr-paid").addEventListener("change", function (e) { d.paid = e.target.checked; renderPrets(el); });
    el.querySelectorAll("tbody tr").forEach(function (tr) {
      tr.addEventListener("change", function () {
        const r = d.rows[+tr.getAttribute("data-i")];
        r.type = tr.querySelector(".pr-t").value; r.brand = tr.querySelector(".pr-b").value;
        r.model = tr.querySelector(".pr-m").value; r.sn = tr.querySelector(".pr-sn").value; r.qty = tr.querySelector(".pr-q").value;
      });
      tr.querySelector(".pr-del").addEventListener("click", function () {
        d.rows.splice(+tr.getAttribute("data-i"), 1); if (!d.rows.length) d.rows.push(emptyPret()); renderPrets(el);
      });
    });
    el.querySelector("#pr-add").addEventListener("click", function () { d.rows.push(emptyPret()); renderPrets(el); });
    el.querySelector("#pr-save").addEventListener("click", async function () {
      const saved = await guard(function () { return API.createPret(Object.assign({}, d, { items: d.rows })); });
      if (saved) { App.pretDraft = null; notify("Prêt enregistré + fiche PDF", "success"); go("#/reception/historique"); }
    });
  }

  function applyInventaireFilters(el) {
    const searchInput = el.querySelector("#filter-search-inventaire");
    const stateSelect = el.querySelector("#filter-state");
    const q = ((searchInput && searchInput.value) || "").trim().toLowerCase();
    const st = (stateSelect && stateSelect.value) || "";
    App.invQ = (searchInput && searchInput.value) || "";
    App.invSt = st;
    const classSuffix = st === "Non défini" ? "non-defini" : st.replace(/\s+/g, "-");
    el.querySelectorAll(".inventaire-lot-card").forEach(function (card) {
      const titleEl = card.querySelector(".inventaire-lot-title h3");
      const lotTitle = ((titleEl && titleEl.textContent) || "").toLowerCase();
      const lotId = String(card.getAttribute("data-lot-id") || "");
      const lotMatches = !q || lotTitle.indexOf(q) !== -1 || lotId.toLowerCase().indexOf(q) !== -1;
      let visibleCount = 0;
      card.querySelectorAll(".item-row").forEach(function (row) {
        const stateOk = !st || row.className.indexOf("item-" + classSuffix) !== -1;
        const snEl = row.querySelector(".col-sn");
        const sn = ((snEl && snEl.textContent) || "").toLowerCase();
        const searchOk = !q || lotMatches || sn.indexOf(q) !== -1;
        const visible = stateOk && searchOk;
        row.style.display = visible ? "" : "none";
        if (visible) visibleCount++;
      });
      if (q && visibleCount === 0) {
        card.style.display = "none";
        return;
      }
      card.style.display = "";
      if (q && visibleCount > 0) {
        const body = card.querySelector(".lot-content");
        const icon = card.querySelector(".expand-icon");
        if (body) body.style.display = "block";
        if (icon) {
          icon.classList.add("fa-chevron-down");
          icon.classList.remove("fa-chevron-right");
        }
      }
    });
  }

  async function renderInventaire(el) {
    const lots = await API.listLots("active");
    const q = App.invQ || "";
    const st = App.invSt || "";
    el.innerHTML =
      "<section class=\"recep-page lot-page inventaire-container\"><div class=\"lot-page__body\">" +
        "<div class=\"recep-toolbar-compact\">" +
          "<div class=\"lot-config__field lot-config__field--search\"><label class=\"lot-config__label\" for=\"filter-search-inventaire\"><i class=\"fa-solid fa-magnifying-glass\"></i> Recherche</label>" +
            "<input class=\"lot-config__input\" type=\"search\" id=\"filter-search-inventaire\" placeholder=\"S/N ou lot… (Ctrl+F)\" value=\"" + esc(q) + "\" autocomplete=\"off\"></div>" +
          "<div class=\"lot-config__field\"><label class=\"lot-config__label\" for=\"filter-state\"><i class=\"fa-solid fa-filter\"></i> État</label>" +
            "<select class=\"lot-config__input\" id=\"filter-state\"><option value=\"\">Tous les états</option><option value=\"Reconditionnés\">Reconditionnés</option><option value=\"Pour pièces\">Pour pièces</option><option value=\"HS\">HS</option><option value=\"Non défini\">Non défini</option></select></div>" +
          "<div class=\"lot-config__actions\"><button type=\"button\" class=\"lot-btn lot-btn--primary\" id=\"btn-refresh-lots\"><i class=\"fa-solid fa-sync\"></i> Rafraîchir</button></div>" +
        "</div><div class=\"lot-card lot-card--list\"><div class=\"lot-card__inner lot-card__inner--list\"><div class=\"recep-list lots-list-inv\" id=\"lots-list\"></div></div></div></div></section>";
    el.querySelector("#filter-state").value = st;
    const list = el.querySelector("#lots-list");
    if (!lots.length) {
      list.innerHTML = "<p class=\"text-mute\" style=\"padding:16px\">Aucun lot en cours. Enregistrez un lot depuis l'onglet Lots.</p>";
    } else {
      list.innerHTML = lots.map(function (lot) {
        const items = lot.items || [];
        return "<div class=\"inventaire-lot-card\" data-lot-id=\"" + lot.id + "\">" +
          "<div class=\"inventaire-lot-header\" style=\"cursor:pointer\">" +
            "<div class=\"inventaire-lot-title\"><i class=\"fa-solid fa-chevron-right expand-icon\"></i><h3>Lot #" + esc(lot.id) + (lot.name ? " | " + esc(lot.name) : "") + "</h3>" +
              "<span class=\"badge-created\">Créé le " + fmtDate(lot.createdAt) + "</span></div>" +
            "<div class=\"inventaire-lot-stats\">" +
              "<span class=\"inventaire-stat inventaire-stat--pending\"><i class=\"fa-solid fa-hourglass-end\"></i> <strong>" + lot.stats.todo + "</strong> à faire</span>" +
              "<span class=\"inventaire-stat inventaire-stat--recond\"><i class=\"fa-solid fa-check-circle\"></i> <strong>" + lot.stats.recond + "</strong> reconditionnés</span>" +
              "<span class=\"inventaire-stat inventaire-stat--hs\"><i class=\"fa-solid fa-exclamation-circle\"></i> <strong>" + lot.stats.hs + "</strong> HS</span>" +
              "<span class=\"inventaire-stat inventaire-stat--total\"><i class=\"fa-solid fa-layer-group\"></i> <strong>" + lot.stats.total + "</strong> total</span>" +
            "</div>" +
            "<div class=\"inventaire-lot-progress\"><span class=\"inventaire-lot-progress__label\">Progression · " + lot.stats.progress + "%</span>" +
              "<div class=\"progress-bar recep-progress-wrap\"><div class=\"progress-fill recep-progress-bar\" style=\"width:" + lot.stats.progress + "%\"></div></div></div>" +
            "<div class=\"inventaire-lot-pdf-actions\"><button type=\"button\" class=\"lot-btn lot-btn--secondary btn-pdf\" data-kind=\"lot\" data-id=\"" + lot.id + "\"><i class=\"fa-solid fa-file-pdf\"></i> PDF provisoire</button></div>" +
          "</div>" +
          "<div class=\"lot-content\" style=\"display:none\">" +
            "<div class=\"inventaire-lot-toolbar\">" +
              "<button type=\"button\" class=\"lot-btn lot-btn--secondary btn-add-pc\" data-lot-id=\"" + lot.id + "\"><i class=\"fa-solid fa-plus\"></i> Ajouter du matériel</button>" +
              "<button type=\"button\" class=\"lot-btn lot-btn--danger btn-del-lot\" data-lot-id=\"" + lot.id + "\"><i class=\"fa-solid fa-trash\"></i> Supprimer le lot</button>" +
            "</div>" +
            "<div class=\"lot-table-wrap\"><table class=\"lot-table\"><thead><tr>" +
              "<th class=\"lot-table__th--num\"><i class=\"fa-solid fa-hashtag\"></i></th>" +
              "<th class=\"lot-table__th--sn\"><i class=\"fa-solid fa-barcode\"></i> S/N</th>" +
              "<th class=\"lot-table__th--type\"><i class=\"fa-solid fa-tag\"></i> Type</th>" +
              "<th class=\"lot-table__th--marque\"><i class=\"fa-solid fa-building\"></i> Marque</th>" +
              "<th class=\"lot-table__th--modele\"><i class=\"fa-solid fa-cube\"></i> Modèle</th>" +
              "<th class=\"lot-table__th--os\"><i class=\"fa-solid fa-desktop\"></i> OS</th>" +
              "<th class=\"lot-table__th--state\"><i class=\"fa-solid fa-circle-check\"></i> État</th>" +
              "<th class=\"lot-table__th--date\"><i class=\"fa-solid fa-calendar-days\"></i> Date</th>" +
              "<th class=\"lot-table__th--technicien\"><i class=\"fa-solid fa-user\"></i> Tech.</th>" +
              "<th class=\"lot-table__th--action\"><i class=\"fa-solid fa-screwdriver-wrench\"></i></th>" +
            "</tr></thead><tbody>" +
            items.map(function (it, idx) {
              const os = osMeta(it.os);
              const stKey = (it.state && it.state.trim()) ? it.state.replace(/\s+/g, "-") : "non-defini";
              return "<tr class=\"item-row item-" + stKey + "\">" +
                "<td class=\"col-num\">" + (idx + 1) + "</td>" +
                "<td class=\"col-sn\">" + esc(it.sn) + "</td>" +
                "<td class=\"col-type\">" + esc(typeLabel(it.type)) + "</td>" +
                "<td class=\"col-marque\">" + esc(it.brand) + "</td>" +
                "<td class=\"col-modele\">" + esc(it.model) + "</td>" +
                "<td class=\"col-os\"><i class=\"fa-brands fa-" + os.icon + "\" title=\"" + esc(os.label) + "\"></i></td>" +
                "<td class=\"col-state\"><span class=\"state-badge state-" + stKey + "\">" + esc(it.state || "Non défini") + "</span></td>" +
                "<td class=\"col-date\">" + fmtDate(it.enteredAt) + "</td>" +
                "<td class=\"col-tech\">" + esc(it.technician || "-") + "</td>" +
                "<td class=\"col-action\"><div class=\"inventaire-row-actions\">" +
                  "<button type=\"button\" class=\"btn-edit-pc\" data-lot=\"" + lot.id + "\" data-pc=\"" + it.id + "\" title=\"Éditer ce matériel\"><i class=\"fa-solid fa-edit\"></i></button>" +
                "</div></td></tr>";
            }).join("") +
            "</tbody></table></div></div></div>";
      }).join("");
    }
    el.querySelector("#filter-search-inventaire").addEventListener("input", function () { applyInventaireFilters(el); });
    el.querySelector("#filter-state").addEventListener("change", function () { applyInventaireFilters(el); });
    el.querySelector("#btn-refresh-lots").addEventListener("click", function () { renderInventaire(el); notify("Inventaire rechargé", "info"); });
    el.querySelectorAll(".inventaire-lot-header").forEach(function (h) {
      h.addEventListener("click", function (e) {
        if (e.target.closest("button")) return;
        const body = h.parentElement.querySelector(".lot-content");
        const icon = h.querySelector(".expand-icon");
        const open = body.style.display !== "none";
        body.style.display = open ? "none" : "block";
        if (icon) icon.classList.toggle("fa-chevron-down", !open);
        if (icon) icon.classList.toggle("fa-chevron-right", open);
      });
    });
    el.querySelectorAll(".btn-edit-pc").forEach(function (b) {
      b.addEventListener("click", function () { editPc(b.getAttribute("data-lot"), b.getAttribute("data-pc"), el); });
    });
    el.querySelectorAll(".btn-pdf").forEach(function (b) {
      b.addEventListener("click", function (e) { e.stopPropagation(); openPdf("lot", b.getAttribute("data-id")); });
    });
    el.querySelectorAll(".btn-del-lot").forEach(function (b) {
      b.addEventListener("click", function () {
        openModal({
          title: "Supprimer le lot", icon: "fa-solid fa-triangle-exclamation",
          body: "<p>Voulez-vous vraiment supprimer ce lot en cours ? Cette action est <strong>irréversible</strong>.</p>",
          footer: "<button type=\"button\" class=\"lots-modal__btn lots-modal__btn--cancel\" data-close-modal>Annuler</button><button type=\"button\" class=\"lots-modal__btn lots-modal__btn--danger\" id=\"ok-del\">Supprimer le lot</button>",
          onOpen: function (root) {
            root.querySelector("#ok-del").addEventListener("click", async function () {
              const ok = await guard(function () { return API.deleteLot(b.getAttribute("data-lot-id")); });
              if (ok) { closeModal(); notify("Lot supprimé", "warning"); renderInventaire(el); }
            });
          }
        });
      });
    });
    el.querySelectorAll(".btn-add-pc").forEach(function (b) {
      b.addEventListener("click", async function () {
        const cat = await catalog();
        openModal({
          title: "Ajouter du matériel", icon: "fa-solid fa-plus",
          body: field("add-sn", "S/N", "text", "") + selectField("add-type", "Type", PC_TYPES, "portable") +
            selectField("add-brand", "Marque", cat.pcBrands.map(function (x) { return { value: x.name, label: x.name }; }), cat.pcBrands[0].name) +
            "<div class=\"form-group\"><label>Modèle</label><select id=\"add-model\" class=\"lots-modal__input\">" + modelOptions(cat.pcModels, cat.pcBrands[0].name, cat.pcBrands, "") + "</select></div>",
          footer: "<button type=\"button\" class=\"lots-modal__btn lots-modal__btn--cancel\" data-close-modal>Annuler</button><button type=\"button\" class=\"lots-modal__btn lots-modal__btn--submit\" id=\"ok-add\">Ajouter</button>",
          onOpen: function (root) {
            root.querySelector("#add-brand").addEventListener("change", function () {
              root.querySelector("#add-model").innerHTML = modelOptions(cat.pcModels, root.querySelector("#add-brand").value, cat.pcBrands, "");
            });
            root.querySelector("#ok-add").addEventListener("click", async function () {
              const ok = await guard(function () {
                return API.addLotItem(b.getAttribute("data-lot-id"), {
                  sn: root.querySelector("#add-sn").value, type: root.querySelector("#add-type").value,
                  brand: root.querySelector("#add-brand").value, model: root.querySelector("#add-model").value
                });
              });
              if (ok) { closeModal(); notify("Matériel ajouté", "success"); renderInventaire(el); }
            });
          }
        });
      });
    });
    applyInventaireFilters(el);
  }

  async function editPc(lotId, itemId, el) {
    const lot = await API.getLot(lotId);
    const item = lot.items.find(function (i) { return i.id === itemId; });
    const cat = await catalog();
    openModal({
      title: "Éditer le matériel", icon: "fa-solid fa-computer",
      body:
        "<p class=\"text-mute\">Entrée " + fmtDateTime(item.enteredAt) + "</p>" +
        field("pc-sn", "Numéro de série", "text", item.sn) +
        "<div class=\"row-group\" style=\"display:grid;grid-template-columns:1fr 1fr;gap:12px\">" +
          selectField("pc-type", "Type", PC_TYPES, item.type) +
          selectField("pc-state", "État", [{ value: "", label: "Non défini" }].concat(STATES.map(function (s) { return { value: s, label: s }; })), item.state) +
        "</div>" +
        "<div class=\"row-group\" style=\"display:grid;grid-template-columns:1fr 1fr;gap:12px\">" +
          selectField("pc-brand", "Marque", cat.pcBrands.map(function (b) { return { value: b.name, label: b.name }; }), item.brand) +
          "<div class=\"form-group\"><label>Modèle</label><select id=\"pc-model\" class=\"lots-modal__input\">" + modelOptions(cat.pcModels, item.brand, cat.pcBrands, item.model) + "</select></div>" +
        "</div>" +
        field("pc-tech", "Technicien *", "text", item.technician, "placeholder=\"Prénom du technicien\"") +
        selectField("pc-os", "OS", OS, item.os || "linux"),
      footer: "<button type=\"button\" class=\"lots-modal__btn lots-modal__btn--cancel\" data-close-modal>Annuler</button><button type=\"button\" class=\"lots-modal__btn lots-modal__btn--submit\" id=\"pc-save\">Enregistrer</button>",
      onOpen: function (root) {
        root.querySelector("#pc-brand").addEventListener("change", function () {
          root.querySelector("#pc-model").innerHTML = modelOptions(cat.pcModels, root.querySelector("#pc-brand").value, cat.pcBrands, "");
        });
        root.querySelector("#pc-save").addEventListener("click", async function () {
          const res = await guard(function () {
            return API.updateLotItem(lotId, itemId, {
              sn: root.querySelector("#pc-sn").value, type: root.querySelector("#pc-type").value,
              brand: root.querySelector("#pc-brand").value, model: root.querySelector("#pc-model").value,
              state: root.querySelector("#pc-state").value, technician: root.querySelector("#pc-tech").value.trim(),
              os: root.querySelector("#pc-os").value
            });
          });
          if (res) {
            closeModal();
            if (res.closed) notify("Lot clôturé, PDF final généré", "success");
            else notify("Matériel mis à jour", "success");
            renderInventaire(el);
          }
        });
      }
    });
  }

  function applyHistoriqueFilters(el) {
    const searchInput = el.querySelector("#filter-search-historique");
    const yearSelect = el.querySelector("#filter-year-historique");
    const typeSelect = el.querySelector("#filter-type-historique");
    const q = ((searchInput && searchInput.value) || "").trim().toLowerCase();
    const year = (yearSelect && yearSelect.value) || "";
    const type = (typeSelect && typeSelect.value) || "tous";
    App.histQ = (searchInput && searchInput.value) || "";
    App.histYear = year;
    App.histType = type;
    let visible = 0;
    el.querySelectorAll(".historique-lot-card").forEach(function (card) {
      const kind = card.getAttribute("data-type") || "";
      const titleEl = card.querySelector("h3");
      const title = ((titleEl && titleEl.textContent) || "").toLowerCase();
      const cardYear = card.getAttribute("data-year") || "";
      const typeOk = type === "tous" || kind === type;
      const yearOk = !year || cardYear === year;
      const searchOk = !q || title.indexOf(q) !== -1;
      const show = typeOk && yearOk && searchOk;
      card.style.display = show ? "" : "none";
      if (show) visible++;
    });
    const empty = el.querySelector(".historique-empty");
    if (empty) empty.style.display = visible ? "none" : "";
  }

  async function renderHistorique(el) {
    const year = App.histYear || "";
    const type = App.histType || "tous";
    const q = App.histQ || "";
    const yNow = new Date().getFullYear();
    const years = [];
    for (let y = yNow; y >= yNow - 9; y--) years.push(y);
    const rows = await API.historique({});
    el.innerHTML =
      "<section class=\"recep-page lot-page historique-container\"><div class=\"lot-page__body\">" +
        "<div class=\"recep-toolbar-compact historique-filters\">" +
          "<div class=\"lot-config__field\"><label class=\"lot-config__label\" for=\"filter-year-historique\"><i class=\"fa-solid fa-calendar\"></i> Année</label>" +
            "<select class=\"lot-config__input\" id=\"filter-year-historique\"><option value=\"\">Toutes</option>" + years.map(function (y) { return "<option value=\"" + y + "\"" + (String(year) === String(y) ? " selected" : "") + ">" + y + "</option>"; }).join("") + "</select></div>" +
          "<div class=\"lot-config__field lot-config__field--search\"><label class=\"lot-config__label\" for=\"filter-search-historique\"><i class=\"fa-solid fa-magnifying-glass\"></i> Recherche</label>" +
            "<input class=\"lot-config__input\" type=\"search\" id=\"filter-search-historique\" value=\"" + esc(q) + "\" placeholder=\"Rechercher par nom…\" autocomplete=\"off\"></div>" +
          "<div class=\"lot-config__field\"><label class=\"lot-config__label\" for=\"filter-type-historique\"><i class=\"fa-solid fa-filter\"></i> Type</label>" +
            "<select class=\"lot-config__input\" id=\"filter-type-historique\">" +
              [["tous","Tous"],["lot","Lot"],["disque","Disque"],["don","Don"],["pret","Prêt matériel"],["commande","Commande"]].map(function (t) {
                return "<option value=\"" + t[0] + "\"" + (type === t[0] ? " selected" : "") + ">" + t[1] + "</option>";
              }).join("") +
            "</select></div>" +
          "<div class=\"lot-config__actions\"><button type=\"button\" class=\"lot-btn lot-btn--secondary\" id=\"btn-refresh-historique\"><i class=\"fa-solid fa-sync\"></i> Rafraîchir</button></div>" +
        "</div><div class=\"historique-list-wrap\"><div class=\"recep-list lots-list\" id=\"historique-list\">" +
        (rows.length ? rows.map(histCard).join("") : "") +
        "<p class=\"text-mute historique-empty\" style=\"padding:16px" + (rows.length ? ";display:none" : "") + "\">Aucun enregistrement.</p>" +
        "</div></div></div></section>";
    el.querySelector("#filter-search-historique").addEventListener("input", function () { applyHistoriqueFilters(el); });
    ["filter-year-historique", "filter-type-historique"].forEach(function (id) {
      el.querySelector("#" + id).addEventListener("change", function () { applyHistoriqueFilters(el); });
    });
    el.querySelector("#btn-refresh-historique").addEventListener("click", function () { renderHistorique(el); });
    bindHist(el);
    applyHistoriqueFilters(el);
  }

  function pdfButtons(kind, id, withMail) {
    return "<button type=\"button\" class=\"btn-action btn-pdf-loc\" data-kind=\"" + kind + "\" data-id=\"" + id + "\"><i class=\"fa-solid fa-folder-open\"></i> Emplacement PDF</button>" +
      "<button type=\"button\" class=\"btn-action btn-pdf-view\" data-kind=\"" + kind + "\" data-id=\"" + id + "\"><i class=\"fa-solid fa-eye\"></i> Voir PDF</button>" +
      "<button type=\"button\" class=\"btn-action btn-pdf-dl\" data-kind=\"" + kind + "\" data-id=\"" + id + "\"><i class=\"fa-solid fa-download\"></i> Télécharger</button>" +
      (withMail ? "<button type=\"button\" class=\"btn-action btn-pdf-mail\" data-kind=\"" + kind + "\" data-id=\"" + id + "\"><i class=\"fa-solid fa-envelope\"></i> E-mail</button>" : "") +
      "<button type=\"button\" class=\"btn-action btn-pdf-regen\" data-kind=\"" + kind + "\" data-id=\"" + id + "\"><i class=\"fa-solid fa-arrows-rotate\"></i> Régénérer PDF</button>";
  }

  function histCard(row) {
    const icons = { lot: "fa-desktop", disque: "fa-hard-drive", commande: "fa-file-invoice", don: "fa-hand-holding-heart", pret: "fa-handshake" };
    const recovered = row.data.recoveredAt;
    const canRecover = row.kind === "lot" || row.kind === "disque";
    const canEdit = row.kind !== "pret";
    const mail = row.kind === "lot" || row.kind === "disque";
    const extra = row.kind === "lot"
      ? "<span class=\"historique-stat\"><i class=\"fa-solid fa-check-circle\"></i> <strong>" + (row.data.stats && row.data.stats.recond || 0) + "</strong> reconditionnés</span>" +
        "<span class=\"historique-stat\"><i class=\"fa-solid fa-exclamation-circle\"></i> <strong>" + (row.data.stats && row.data.stats.hs || 0) + "</strong> HS</span>" +
        "<span class=\"historique-stat\"><strong>" + ((row.data.items || []).length) + "</strong> total</span>"
      : "<span class=\"historique-stat\"><strong>" + ((row.data.items || []).length) + "</strong> ligne(s)</span>";
    const typeClass = { disque: " historique-disque-card", don: " historique-don-card", pret: " historique-pret-card", commande: " historique-commande-card" }[row.kind] || "";
    return "<div class=\"historique-lot-card" + typeClass + "\" data-type=\"" + row.kind + "\" data-id=\"" + row.id + "\" data-year=\"" + new Date(row.createdAt).getFullYear() + "\">" +
      "<div class=\"historique-lot-header\"><div class=\"historique-lot-title\">" +
        "<h3><i class=\"fa-solid " + (icons[row.kind] || "fa-file") + " historique-type-icon\"></i> " + (row.kind === "lot" ? "Lot #" + esc(row.id) + " | " : "") + esc(row.name) + "</h3>" +
        (canRecover ? "<span class=\"" + (recovered ? "badge-recovered" : "badge-to-recover") + "\">" + (recovered ? "Récupéré le " + fmtDateTime(recovered) : "À récupérer") + "</span>" : "") +
        "<span class=\"badge-created\">" + (row.kind === "lot" ? "Terminé le " : "") + fmtDate(row.createdAt) + "</span></div>" +
        "<div class=\"historique-lot-stats\">" + extra + "</div>" +
        "<div class=\"historique-lot-actions\">" +
          "<button type=\"button\" class=\"btn-view-details\" data-kind=\"" + row.kind + "\" data-id=\"" + row.id + "\"><i class=\"fa-solid fa-eye\"></i> Voir détails</button>" +
          (canEdit ? "<button type=\"button\" class=\"btn-edit-lot\" data-kind=\"" + row.kind + "\" data-id=\"" + row.id + "\"><i class=\"fa-solid fa-edit\"></i> Éditer nom</button>" : "") +
          (canRecover ? "<button type=\"button\" class=\"" + (recovered ? "btn-recovered" : "btn-to-recover") + "\" data-kind=\"" + row.kind + "\" data-id=\"" + row.id + "\"" + (recovered ? " disabled" : "") + ">" + (recovered ? "✓ Récupéré" : "Récupérer") + "</button>" : "") +
          pdfButtons(row.kind, row.id, mail) +
        "</div></div></div>";
  }

  function bindHist(el) {
    el.querySelectorAll(".btn-view-details").forEach(function (b) {
      b.addEventListener("click", function () { showDetails(b.getAttribute("data-kind"), b.getAttribute("data-id")); });
    });
    el.querySelectorAll(".btn-edit-lot").forEach(function (b) {
      b.addEventListener("click", function () {
        const kind = b.getAttribute("data-kind"), id = b.getAttribute("data-id");
        const entity = API.getEntity(kind, id);
        openModal({
          title: "Éditer le nom", body: field("hist-name", "Nom", "text", entity.name),
          footer: "<button type=\"button\" class=\"lots-modal__btn lots-modal__btn--cancel\" data-close-modal>Annuler</button><button type=\"button\" class=\"lots-modal__btn lots-modal__btn--submit\" id=\"hist-save\">Enregistrer</button>",
          onOpen: function (root) {
            root.querySelector("#hist-save").addEventListener("click", async function () {
              const name = root.querySelector("#hist-name").value;
              const fn = { lot: function () { return API.updateLotName(id, name); }, disque: function () { return API.updateDiskSession(id, { name: name }); }, commande: function () { return API.updateCommande(id, { name: name }); }, don: function () { return API.updateDon(id, { name: name }); } }[kind];
              const ok = await guard(fn);
              if (ok) { closeModal(); notify("Nom modifié", "success"); renderHistorique(el); }
            });
          }
        });
      });
    });
    el.querySelectorAll(".btn-to-recover").forEach(function (b) {
      b.addEventListener("click", async function () {
        const kind = b.getAttribute("data-kind"), id = b.getAttribute("data-id");
        const ok = await guard(function () { return kind === "lot" ? API.recoverLot(id) : API.recoverDisk(id); });
        if (ok) { notify("Marqué comme récupéré", "success"); renderHistorique(el); }
      });
    });
    el.querySelectorAll(".btn-pdf-view, .btn-pdf-dl").forEach(function (b) {
      b.addEventListener("click", function () { openPdf(b.getAttribute("data-kind"), b.getAttribute("data-id")); });
    });
    el.querySelectorAll(".btn-pdf-loc").forEach(function (b) {
      b.addEventListener("click", function () {
        const pdf = API.getPdfFor(b.getAttribute("data-id"));
        notify("Emplacement (simulé) : " + (pdf && pdf.path || "-"), "info");
      });
    });
    el.querySelectorAll(".btn-pdf-regen").forEach(function (b) {
      b.addEventListener("click", async function () {
        const pdf = await guard(function () { return API.regeneratePdf(b.getAttribute("data-id"), b.getAttribute("data-kind")); });
        if (pdf) notify("PDF régénéré : " + pdf.file, "success");
      });
    });
    el.querySelectorAll(".btn-pdf-mail").forEach(function (b) {
      b.addEventListener("click", function () {
        openModal({
          title: "Envoyer le PDF par email", icon: "fa-solid fa-envelope",
          body: field("mail-to", "Adresse email", "email", "", "required") + field("mail-msg", "Message (optionnel)", "textarea", ""),
          footer: "<button type=\"button\" class=\"lots-modal__btn lots-modal__btn--cancel\" data-close-modal>Annuler</button><button type=\"button\" class=\"lots-modal__btn lots-modal__btn--submit\" id=\"mail-send\">Envoyer</button>",
          onOpen: function (root) {
            root.querySelector("#mail-send").addEventListener("click", async function () {
              const ok = await guard(function () { return API.sendMail(root.querySelector("#mail-to").value, root.querySelector("#mail-msg").value); });
              if (ok) { closeModal(); notify("E-mail simulé envoyé à " + ok.to, "success"); }
            });
          }
        });
      });
    });
  }

  function showDetails(kind, id) {
    const entity = API.getEntity(kind, id);
    if (!entity) return;
    const items = entity.items || [];
    let head = "<th>S/N</th><th>Détail</th>";
    let body = items.map(function (it) {
      if (kind === "commande") return "<tr><td>" + esc(it.product) + "</td><td>" + esc(it.qty) + " × " + esc(it.price) + " €</td></tr>";
      if (kind === "don") return "<tr><td>" + esc(it.sn) + "</td><td>" + esc(recipientOf(it)) + " : " + esc(it.brand) + " " + esc(it.model) + "</td></tr>";
      if (kind === "pret") return "<tr><td>" + esc(it.sn || "-") + "</td><td>" + esc(it.type) + " × " + esc(it.qty) + "</td></tr>";
      if (kind === "disque") return "<tr><td>" + esc(it.sn) + "</td><td>" + esc(it.type) + " · " + esc(it.shred) + "</td></tr>";
      return "<tr><td>" + esc(it.sn) + "</td><td>" + esc(it.state || "-") + " · " + esc(it.technician || "-") + " · " + esc(it.os || "") + "</td></tr>";
    }).join("");
    if (kind === "commande") head = "<th>Produit</th><th>Qté / prix</th>";
    openModal({
      title: entity.name || "Détails", wide: true,
      body: (kind === "pret" ? "<p><strong>" + esc(entity.borrowerName) + "</strong> · " + esc(entity.startDate) + " → " + esc(entity.endDate) + "</p>" : "") +
        "<div class=\"lot-details-table recep-table-wrap\"><table class=\"details-table recep-table\"><thead><tr>" + head + "</tr></thead><tbody>" + body + "</tbody></table></div>",
      footer: "<button type=\"button\" class=\"lots-modal__btn lots-modal__btn--cancel\" data-close-modal>Fermer</button>"
    });
  }

  function openPdf(kind, id) {
    const entity = API.getEntity(kind, id);
    const pdf = API.getPdfFor(id);
    if (!entity) return;
    const items = entity.items || [];
    const dateDoc = fmtDateLong(entity.finishedAt || entity.createdAt);
    const pathLine = "<p class=\"pdf-path\">Fichier : " + esc(pdf && pdf.file) + "<br>Chemin : " + esc(pdf && pdf.path) + "</p>";
    let inner = "";

    if (kind === "lot") {
      const counts = {};
      items.forEach(function (it) {
        const k = it.state && it.state.trim() ? it.state : "Non défini";
        counts[k] = (counts[k] || 0) + 1;
      });
      inner =
        "<header class=\"pdf-header\"><div class=\"pdf-header-text\"><h1><i class=\"fa-solid fa-boxes-stacked\"></i> Fiche du " + esc(entity.name) + "</h1></div>" + pdfBrand() + "</header>" +
        "<section class=\"pdf-info\"><h2><i class=\"fa-solid fa-circle-info\"></i> Informations du lot</h2><ul>" +
          "<li><span class=\"label\"><i class=\"fa-regular fa-square-plus\"></i> Créé le :</span><span class=\"value\">" + esc(fmtDateLong(entity.createdAt)) + "</span></li>" +
          "<li><span class=\"label\"><i class=\"fa-regular fa-square-check\"></i> Terminé le :</span><span class=\"value\">" + esc(entity.finishedAt ? fmtDateLong(entity.finishedAt) : "-") + "</span></li>" +
          "<li><span class=\"label\"><i class=\"fa-solid fa-reply\"></i> Récupéré le :</span><span class=\"value\">" + esc(entity.recoveredAt ? fmtDateLong(entity.recoveredAt) : "-") + "</span></li>" +
        "</ul></section>" +
        "<section class=\"pdf-summary\"><h2><i class=\"fa-solid fa-square-poll-horizontal\"></i> Résumé</h2>" +
          "<p class=\"pdf-summary-total-line\"><strong>" + items.length + "</strong> article(s)</p>" +
          "<div class=\"pdf-summary-state-cards\">" + Object.keys(counts).map(function (k) {
            return "<span class=\"pdf-summary-state-card\"><span class=\"pdf-summary-state-name\">" + esc(k) + "</span><span class=\"pdf-summary-state-count\">" + counts[k] + "</span></span>";
          }).join("") + "</div></section>" +
        "<section class=\"pdf-detail\"><h2><i class=\"fa-solid fa-table-list\"></i> Détail des articles</h2>" +
          "<table class=\"pdf-table\"><thead><tr><th class=\"col-num\">N°</th><th>Type</th><th>Marque</th><th>Modèle</th><th>OS</th><th>S/N</th><th>État</th><th>Date</th><th>Technicien</th></tr></thead><tbody>" +
          items.map(function (it, i) {
            const os = osMeta(it.os);
            return "<tr><td>" + (i + 1) + "</td><td>" + esc(typeLabel(it.type)) + "</td><td>" + esc(it.brand) + "</td><td>" + esc(it.model) + "</td><td>" + esc(os.label) + "</td><td>" + esc(it.sn) + "</td><td>" + esc(it.state || "Non défini") + "</td><td>" + esc(fmtDate(it.enteredAt)) + "</td><td>" + esc(it.technician || "-") + "</td></tr>";
          }).join("") + "</tbody></table></section>";
    } else if (kind === "disque") {
      const byIf = {};
      items.forEach(function (it) { byIf[it.iface || "SATA"] = (byIf[it.iface || "SATA"] || 0) + 1; });
      inner =
        "<header class=\"pdf-header\"><div class=\"pdf-header-text\"><h1><i class=\"fa-solid fa-hard-drive\"></i> Certificat d’effacement sécurisé des données</h1></div>" + pdfBrand() + "</header>" +
        "<section class=\"pdf-info\"><h2><i class=\"fa-solid fa-circle-info\"></i> Informations de la session</h2>" +
          "<p class=\"pdf-summary-total-line\"><span class=\"label\"><i class=\"fa-regular fa-calendar\"></i> Date :</span> <span class=\"value\">" + esc(dateDoc) + "</span></p>" +
          "<p class=\"pdf-summary-total-line\"><span class=\"label\"><i class=\"fa-solid fa-hard-drive\"></i> Nombre de disques :</span> <span class=\"value\">" + items.length + "</span></p>" +
          "<ul class=\"pdf-summary-by-interface\">" + Object.keys(byIf).map(function (k) { return "<li>" + esc(k) + " : " + byIf[k] + "</li>"; }).join("") + "</ul></section>" +
        "<section class=\"pdf-method\"><h2><i class=\"fa-solid fa-screwdriver-wrench\"></i> Méthode</h2>" +
          "<h3 class=\"pdf-method-sub\">Méthode utilisée pour les disques endommagés</h3>" +
          "<p>Il arrive que certains disques rencontrent des erreurs lors de l’effacement sécurisé. Dans ce cas, un effacement logiciel ne peut garantir la sécurité des données. C’est pourquoi nous effectuons une destruction physique de ces disques par perçage.</p></section>" +
        "<section class=\"pdf-summary\"><h2><i class=\"fa-solid fa-square-poll-horizontal\"></i> Résumé</h2>" +
          "<p class=\"pdf-summary-total-line\"><span class=\"label\"><i class=\"fa-solid fa-tag\"></i> Session :</span> <span class=\"value\">" + esc(entity.name) + "</span></p></section>" +
        "<section class=\"pdf-detail\"><h2><i class=\"fa-solid fa-table-list\"></i> Détail des disques</h2>" +
          "<table class=\"pdf-table\"><thead><tr><th>N°</th><th>S/N</th><th>Marque</th><th>Modèle</th><th>Taille</th><th>Type</th><th>Interface</th><th>Shred</th></tr></thead><tbody>" +
          items.map(function (it, i) {
            return "<tr><td>" + (i + 1) + "</td><td>" + esc(it.sn) + "</td><td>" + esc(it.brand) + "</td><td>" + esc(it.model) + "</td><td>" + esc(it.size) + "</td><td>" + esc(it.type) + "</td><td>" + esc(it.iface) + "</td><td>" + esc(it.shred) + "</td></tr>";
          }).join("") + "</tbody></table></section>";
    } else if (kind === "commande") {
      let total = 0;
      inner =
        "<header class=\"pdf-header\"><div class=\"pdf-header-text\"><h1><i class=\"fa-solid fa-file-invoice\"></i> Commande : " + esc(entity.name) + "</h1></div>" + pdfBrand() + "</header>" +
        "<section class=\"pdf-info\"><h2><i class=\"fa-solid fa-circle-info\"></i> Informations</h2>" +
          "<p class=\"pdf-summary-total-line\"><span class=\"label\"><i class=\"fa-regular fa-calendar\"></i> Date :</span> <span class=\"value\">" + esc(dateDoc) + "</span></p>" +
          "<p class=\"pdf-summary-total-line\"><span class=\"label\"><i class=\"fa-solid fa-folder-tree\"></i> Catégorie :</span> <span class=\"value\">" + esc(entity.category) + "</span></p></section>" +
        "<section class=\"pdf-detail\"><h2><i class=\"fa-solid fa-table-list\"></i> Détail de la commande</h2>" +
          "<table class=\"pdf-table\"><thead><tr><th>N°</th><th>Produit</th><th>Qté</th><th>Prix unit.</th><th>Port</th><th>Total</th></tr></thead><tbody>" +
          items.map(function (it, i) {
            const line = (Number(it.qty) || 0) * (Number(it.price) || 0) + (Number(it.shipping) || 0);
            total += line;
            return "<tr><td>" + (i + 1) + "</td><td>" + esc(it.product) + "</td><td>" + esc(it.qty) + "</td><td>" + money(it.price) + "</td><td>" + money(it.shipping) + "</td><td>" + money(line) + "</td></tr>";
          }).join("") + "</tbody></table><p class=\"pdf-totals\">Total TTC : <strong>" + money(total) + "</strong></p></section>";
    } else if (kind === "don") {
      inner =
        "<header class=\"pdf-header\"><div class=\"pdf-header-text\"><h1><i class=\"fa-solid fa-hand-holding-heart\"></i> NEXA ATELIER</h1><p class=\"pdf-header-org\">Certificat de don de matériel informatique</p></div>" + pdfBrand() + "</header>" +
        "<section class=\"pdf-certificate-title\"><h2><i class=\"fa-solid fa-award\"></i> Certificat de don</h2>" +
          "<p class=\"certificate-intro\">Le présent document atteste du don du matériel listé ci-dessous au bénéfice des personnes identifiées.</p></section>" +
        "<section class=\"pdf-info\"><h2><i class=\"fa-solid fa-circle-info\"></i> Informations</h2>" +
          "<p class=\"pdf-summary-total-line\"><span class=\"label\"><i class=\"fa-regular fa-calendar\"></i> Date :</span> <span class=\"value\">" + esc(dateDoc) + "</span></p>" +
          "<p class=\"pdf-summary-total-line\"><span class=\"label\"><i class=\"fa-solid fa-tag\"></i> Lot :</span> <span class=\"value\">" + esc(entity.name) + "</span></p></section>" +
        "<section class=\"pdf-detail\"><h2><i class=\"fa-solid fa-table-list\"></i> Détail du don</h2>" +
          "<table class=\"pdf-table\"><thead><tr><th>N°</th><th>Type</th><th>Marque</th><th>Modèle</th><th>S/N</th><th>Date</th><th>Bénéficiaire</th><th>Signature</th></tr></thead><tbody>" +
          items.map(function (it, i) {
            return "<tr><td>" + (i + 1) + "</td><td>" + esc(typeLabel(it.type)) + "</td><td>" + esc(it.brand) + "</td><td>" + esc(it.model) + "</td><td>" + esc(it.sn) + "</td><td>" + esc(fmtDate(it.date)) + "</td><td>" + esc(recipientOf(it)) + "</td><td><span class=\"pdf-sig\"></span></td></tr>";
          }).join("") + "</tbody></table></section>";
    } else {
      inner =
        "<header class=\"pdf-header\"><div class=\"pdf-header-text\"><h1><i class=\"fa-solid fa-handshake\"></i> " + esc(entity.name) + "</h1></div>" + pdfBrand() + "</header>" +
        "<section class=\"pdf-certificate-title\"><h2><i class=\"fa-solid fa-boxes-stacked\"></i> Matériel prêté</h2>" +
          "<p class=\"certificate-intro\">Le présent document récapitule le matériel prêté ou mis à disposition, la période concernée et les conditions financières le cas échéant.</p></section>" +
        "<section class=\"pdf-info\"><h2><i class=\"fa-solid fa-circle-info\"></i> Informations</h2>" +
          "<p class=\"pdf-summary-total-line\"><span class=\"label\"><i class=\"fa-regular fa-calendar\"></i> Date du document :</span> <span class=\"value\">" + esc(dateDoc) + "</span></p>" +
          "<p class=\"pdf-summary-total-line\"><span class=\"label\"><i class=\"fa-solid fa-hashtag\"></i> Référence :</span> <span class=\"value\">" + esc(entity.reference || "-") + "</span></p>" +
          "<p class=\"pdf-summary-total-line\"><span class=\"label\"><i class=\"fa-solid fa-building-user\"></i> Emprunteur :</span> <span class=\"value\">" + esc(entity.borrowerName) + " (" + esc(entity.borrowerType === "societe" ? "Structure" : "Personne") + ")</span></p>" +
          "<p class=\"pdf-summary-total-line\"><span class=\"label\"><i class=\"fa-solid fa-calendar-days\"></i> Période :</span> <span class=\"value\">" + esc(fmtDate(entity.startDate)) + " → " + esc(fmtDate(entity.endDate)) + "</span></p>" +
          "<p class=\"pdf-summary-total-line\"><span class=\"label\"><i class=\"fa-solid fa-coins\"></i> Rémunération :</span> <span class=\"value\">" + (entity.paid ? money(entity.amount) : "Prêt gratuit") + "</span></p></section>" +
        "<section class=\"pdf-detail\"><h2><i class=\"fa-solid fa-table-list\"></i> Détail du matériel</h2>" +
          "<table class=\"pdf-table\"><thead><tr><th>N°</th><th>Type</th><th>Marque</th><th>Modèle</th><th>S/N</th><th>Qté</th></tr></thead><tbody>" +
          items.map(function (it, i) {
            return "<tr><td>" + (i + 1) + "</td><td>" + esc(it.type) + "</td><td>" + esc(it.brand) + "</td><td>" + esc(it.model) + "</td><td>" + esc(it.sn || "-") + "</td><td>" + esc(it.qty) + "</td></tr>";
          }).join("") + "</tbody></table></section>";
    }

    openModal({
      title: (pdf && pdf.file) || "Document PDF",
      wide: true,
      body: "<div class=\"pdf-viewer\"><div class=\"pdf-preview\" id=\"pdf-print\">" + inner + pathLine + "</div></div>",
      footer: "<button type=\"button\" class=\"lots-modal__btn lots-modal__btn--cancel\" data-close-modal>Fermer</button>" +
        "<button type=\"button\" class=\"lots-modal__btn lots-modal__btn--submit\" id=\"pdf-print-btn\"><i class=\"fa-solid fa-print\"></i> Imprimer / PDF</button>",
      onOpen: function (root) {
        root.querySelector("#pdf-print-btn").addEventListener("click", function () {
          const w = window.open("", "_blank");
          if (!w) return;
          const href = new URL("css/pdf-preview.css", location.href).href;
          w.document.write(
            "<html><head><title>" + esc(pdf && pdf.file) + "</title>" +
            "<link rel=\"stylesheet\" href=\"https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css\">" +
            "<link rel=\"stylesheet\" href=\"" + href + "\"></head>" +
            "<body style=\"margin:0;background:#fff\">" + root.querySelector("#pdf-print").outerHTML + "</body></html>"
          );
          w.document.close();
          w.focus();
          setTimeout(function () { w.print(); }, 250);
        });
      }
    });
  }

  /* ---------- Paramètres ---------- */
  function injectSettings() {
    document.getElementById("settingsModalContainer").innerHTML =
      "<div class=\"settings-modal hidden\" id=\"settingsModal\">" +
        "<div class=\"settings-modal-overlay\" id=\"settingsModalOverlay\"></div>" +
        "<div class=\"settings-modal-container\">" +
          "<div class=\"settings-modal-header\">" +
            "<button class=\"settings-modal-close\" id=\"settingsModalClose\" type=\"button\" aria-label=\"Fermer\"><i class=\"fas fa-times\"></i></button>" +
            "<h2 class=\"settings-modal-title\"><i class=\"fas fa-gear\"></i> Paramètres</h2></div>" +
          "<div class=\"settings-modal-body\"><section class=\"settings-update-card\">" +
            "<header class=\"settings-update-card__header\"><div class=\"settings-update-card__icon\"><i class=\"fa-solid fa-cloud-arrow-down\"></i></div>" +
            "<div class=\"settings-update-card__titles\"><h3>Mise à jour</h3><p class=\"settings-update-card__subtitle\">Vérifiez et installez la dernière version de Workspace.</p></div></header>" +
            "<div class=\"settings-update-status-block\"><span class=\"settings-update-status-label\">État</span><div class=\"settings-update-status\" id=\"settingsUpdateStatus\">Workspace démo 3.3.5, à jour</div></div>" +
            "<div class=\"settings-update-actions\">" +
              "<button type=\"button\" id=\"settingsBtnCheckUpdate\" class=\"settings-btn settings-btn--ghost\"><i class=\"fa-solid fa-arrows-rotate\"></i> Vérifier</button>" +
              "<button type=\"button\" id=\"settingsBtnDownloadUpdate\" class=\"settings-btn settings-btn--primary hidden\" disabled><i class=\"fa-solid fa-download\"></i> Télécharger &amp; préparer</button>" +
              "<button type=\"button\" id=\"settingsBtnRestartUpdate\" class=\"settings-btn settings-btn--restart hidden\" disabled><i class=\"fa-solid fa-power-off\"></i> Redémarrer pour appliquer</button>" +
            "</div>" +
            "<div class=\"settings-update-progress hidden\" id=\"settingsUpdateProgress\"><div class=\"settings-update-progress-bar\"><div class=\"settings-update-progress-fill\" id=\"settingsUpdateProgressFill\" style=\"width:0%\"></div></div>" +
            "<div class=\"settings-update-progress-text\" id=\"settingsUpdateProgressText\">0%</div></div>" +
            "<div class=\"settings-update-hint hidden\" id=\"settingsUpdateHint\"><i class=\"fa-solid fa-circle-check\"></i> <span>Mise à jour prête. Cliquez sur <strong>Redémarrer pour appliquer</strong>.</span></div>" +
          "</section></div></div></div>";
  }

  function openSettings() {
    const modal = document.getElementById("settingsModal");
    modal.classList.remove("hidden");
    document.getElementById("settingsUpdateStatus").textContent = "Workspace démo 3.3.5, à jour";
    document.getElementById("settingsBtnDownloadUpdate").classList.add("hidden");
    document.getElementById("settingsBtnRestartUpdate").classList.add("hidden");
    document.getElementById("settingsUpdateProgress").classList.add("hidden");
    document.getElementById("settingsUpdateHint").classList.add("hidden");
    document.getElementById("profileUpdatePing").classList.add("hidden");
  }

  function closeSettings() {
    document.getElementById("settingsModal").classList.add("hidden");
  }

  async function resetDemo() {
    await API.reset();
    App.catalog = null;
    App.lotDraft = App.diskDraft = App.cmdDraft = App.donDraft = App.pretDraft = null;
    App.invQ = App.invSt = "";
    App.histQ = App.histYear = "";
    App.histType = "tous";
    closeModal(); closeSettings();
    notify("Démo réinitialisée", "success");
    render();
  }

  /* ---------- events ---------- */
  document.getElementById("navThemeToggle").addEventListener("click", function () {
    App.themeDark = !App.themeDark; applyTheme();
  });
  document.getElementById("navSettings").addEventListener("click", openSettings);
  document.getElementById("navBurger").addEventListener("click", function () {
    document.getElementById("navLinks").classList.toggle("active");
  });
  document.getElementById("btn-reset-demo").addEventListener("click", resetDemo);
  document.getElementById("footer-ip").addEventListener("click", async function () {
    try { await navigator.clipboard.writeText(document.getElementById("footer-ip-value").textContent); notify("IP copiée", "success"); }
    catch (e) { notify("10.42.0.18", "info"); }
  });

  document.querySelector("header").addEventListener("click", function (e) {
    const btn = e.target.closest("[data-page]");
    if (!btn || btn.closest("#content")) return;
    document.getElementById("navLinks").classList.remove("active");
    const page = btn.getAttribute("data-page");
    go(page === "reception" ? "#/reception/entrer" : "#/agenda");
  });

  content.addEventListener("click", function (e) {
    const rec = e.target.closest("[data-reception-page]");
    if (rec) { e.preventDefault(); go("#/reception/" + rec.getAttribute("data-page")); return; }
    const view = e.target.closest("[data-calendar-view]");
    if (view) { App.calView = view.getAttribute("data-calendar-view"); render(); return; }
    const nav = e.target.closest("[data-calendar-nav]");
    if (nav) {
      const dir = Number(nav.getAttribute("data-calendar-nav"));
      if (App.calView === "week") App.calCursor.setDate(App.calCursor.getDate() + 7 * dir);
      else if (App.calView === "month") App.calCursor.setMonth(App.calCursor.getMonth() + dir);
      else App.calCursor.setFullYear(App.calCursor.getFullYear() + dir);
      render(); return;
    }
    const ev = e.target.closest("[data-event]");
    if (ev) { App.selectedEvent = ev.getAttribute("data-event"); render(); return; }
    const edit = e.target.closest("[data-edit-event]");
    if (edit) {
      API.listEvents().then(function (list) { eventForm(list.find(function (x) { return x.id === edit.getAttribute("data-edit-event"); })); });
      return;
    }
    const del = e.target.closest("[data-del-event]");
    if (del) {
      guard(function () { return API.deleteEvent(del.getAttribute("data-del-event")); }).then(function (ok) {
        if (ok) { App.selectedEvent = null; notify("Événement supprimé", "success"); render(); }
      });
      return;
    }
    if (e.target.closest("#addEventBtn")) { eventForm(null); return; }
    const day = e.target.closest("[data-cal-day]");
    if (day && !e.target.closest("[data-event]")) eventForm(null, day.getAttribute("data-cal-day"));
  });

  dialog.addEventListener("click", function (e) {
    if (e.target === dialog || e.target.closest("[data-close-modal]")) closeModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModal();
    if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F") && App.page === "reception" && App.recep === "inventaire") {
      const search = document.getElementById("filter-search-inventaire");
      if (search) { e.preventDefault(); search.focus(); search.select(); }
    }
  });

  document.getElementById("settingsModalContainer").addEventListener("click", function (e) {
    if (e.target.id === "settingsModalOverlay" || e.target.closest("#settingsModalClose")) closeSettings();
    if (e.target.closest("#settingsBtnCheckUpdate")) {
      document.getElementById("settingsUpdateStatus").textContent = "Nouvelle version 3.3.6 disponible (simulé)";
      const dl = document.getElementById("settingsBtnDownloadUpdate");
      dl.classList.remove("hidden"); dl.disabled = false;
      document.getElementById("profileUpdatePing").classList.remove("hidden");
      notify("Mise à jour disponible", "info");
    }
    if (e.target.closest("#settingsBtnDownloadUpdate")) {
      const bar = document.getElementById("settingsUpdateProgress");
      const fill = document.getElementById("settingsUpdateProgressFill");
      const txt = document.getElementById("settingsUpdateProgressText");
      bar.classList.remove("hidden");
      let p = 0;
      const t = setInterval(function () {
        p += 14; fill.style.width = Math.min(p, 100) + "%"; txt.textContent = Math.min(p, 100) + "%";
        if (p >= 100) {
          clearInterval(t);
          document.getElementById("settingsUpdateStatus").textContent = "Mise à jour prête";
          const rs = document.getElementById("settingsBtnRestartUpdate");
          rs.classList.remove("hidden"); rs.disabled = false;
          document.getElementById("settingsUpdateHint").classList.remove("hidden");
        }
      }, 160);
    }
    if (e.target.closest("#settingsBtnRestartUpdate")) {
      notify("Redémarrage simulé, vous restez sur la démo 3.3.5", "success");
      closeSettings();
    }
  });

  setInterval(function () {
    const ram = document.getElementById("footer-ram-value");
    if (ram) ram.textContent = (5.8 + Math.random() * 0.7).toFixed(1) + " / 16 Go";
  }, 5000);

  injectSettings();
  applyTheme();
  window.addEventListener("hashchange", render);
  if (!location.hash) location.hash = "#/agenda";
  render();
})();
