(function () {
  "use strict";

  /* ---------- Configuration GitHub ---------- */
  const GH_OWNER = "SandaJohns";
  const GH_REPO = "mada-piste";
  const GH_FILE = "js/data.js";

  /* ---------- Outils ---------- */
  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) =>
      ({ "&": "\x26amp;", "<": "\x26lt;", ">": "\x26gt;", '"': "\x26quot;", "'": "\x26#39;" }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const todayStr = () => new Date().toISOString().split("T")[0];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); }
      catch (e) { alert("Mémoire du navigateur pleine : supprime quelques photos ou publie d'abord."); }
    },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const sha = async (s) => {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  };
  const toBase64 = (str) => btoa(unescape(encodeURIComponent(str)));
  const compress = (file) => new Promise((ok, ko) => {
    const r = new FileReader(), img = new Image();
    r.onload = () => { img.src = r.result; };
    r.onerror = ko; img.onerror = ko;
    img.onload = () => {
      const k = Math.min(1, 1000 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      ok(c.toDataURL("image/jpeg", 0.72));
    };
    r.readAsDataURL(file);
  });

  /* ---------- État ---------- */
  let admin = sessionStorage.getItem("mp_admin") === "1";
  let D = admin ? (store.get("mp_draft", null) || clone(SITE)) : SITE;
  let showAdminLogin = false, editId = null, form = { imgs: [], specs: [] };
  let lb = { open: false, imgs: [], idx: 0 };
  let publishing = false;

  const saveDraft = () => { store.set("mp_draft", D); render(); };
  const wa = (msg) => `https://wa.me/${D.phone}?text=${encodeURIComponent(msg)}`;

  /* ---------- Publication directe GitHub ---------- */
  async function publishToGitHub() {
    const token = ($("#ghtoken")?.value || store.get("mp_gh_token", "")).trim();
    if (!token) {
      alert("Renseigne d'abord la clé de publication GitHub dans le champ prévu en bas de l'espace admin.");
      $("#ghtoken")?.focus();
      return;
    }
    store.set("mp_gh_token", token);
    publishing = true;
    render();

    const apiUrl = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_FILE}`;
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json"
    };

    try {
      // 1. Récupérer le SHA actuel du fichier js/data.js sur GitHub
      const getRes = await fetch(apiUrl, { headers });
      if (!getRes.ok) {
        if (getRes.status === 401 || getRes.status === 403) {
          throw new Error("Clé de publication invalide ou permissions insuffisantes.");
        }
        throw new Error(`Erreur GitHub (${getRes.status}) lors de la lecture du fichier.`);
      }
      const fileInfo = await getRes.json();

      // 2. Envoyer le nouveau contenu de js/data.js
      const content = "window.SITE = " + JSON.stringify(D, null, 2) + ";\n";
      const putRes = await fetch(apiUrl, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message: "Mise à jour du catalogue Mada Piste via Admin",
          content: toBase64(content),
          sha: fileInfo.sha
        })
      });

      if (!putRes.ok) {
        throw new Error(`Échec de l'enregistrement sur GitHub (${putRes.status}).`);
      }

      window.SITE = clone(D);
      store.del("mp_draft");
      alert("✅ Modifications publiées avec succès !\n\nLe site public sera à jour dans environ 1 minute.");
    } catch (err) {
      alert("❌ Erreur lors de la publication : " + err.message);
    } finally {
      publishing = false;
      render();
    }
  }

  /* ---------- Composants ---------- */
  function carCard(c) {
    const imgs = c.imgs || [];
    return `
    <article class="card">
      <div class="im" id="im${esc(c.id)}" data-act="zoomcar" data-id="${esc(c.id)}" title="Agrandir les photos" style="background-image:url('${esc(imgs[0] || "")}')">
        ${imgs.length > 1 ? `<span class="badge-ph">📷 ${imgs.length}</span>` : ""}
      </div>
      ${imgs.length > 1 ? `<div class="thumbs" id="th${esc(c.id)}">${imgs.map((s, idx) =>
        `<img src="${esc(s)}" alt="" class="${idx === 0 ? "act" : ""}" data-act="th" data-id="${esc(c.id)}" data-idx="${idx}">`).join("")}</div>` : ""}
      <div class="bd">
        <h3>${esc(c.name)}</h3>
        <p>${esc(c.desc)}</p>
        <div class="specs">${(c.specs || []).map((s) => `<span class="tag">${esc(s)}</span>`).join("")}</div>
        <div class="card-foot">
          <div>
            <p class="pr">${c.price ? esc(c.price) + " € / jour" : "Tarif sur devis"}</p>
            <span class="mut" style="font-size:12px">Avec chauffeur · Toute l'île</span>
          </div>
          <button class="btn sm" data-act="book" data-id="${esc(c.id)}">Réserver</button>
        </div>
        ${admin ? `<div class="adm-actions">
          <button class="btn s sm" data-act="edit" data-id="${esc(c.id)}">Modifier</button>
          <button class="btn r sm" data-act="del" data-id="${esc(c.id)}">Supprimer</button>
        </div>` : ""}
      </div>
    </article>`;
  }

  function adminLogin() {
    return `<form id="alf"><b>Connexion administrateur</b>
      <label>Mot de passe<input id="alp" type="password" required></label>
      <button class="btn" type="submit">Entrer</button></form>`;
  }

  function adminPanel() {
    const savedToken = store.get("mp_gh_token", "");
    const hasDraft = !!store.get("mp_draft", null);
    return `<div class="box adm">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <h2 style="margin:0">Espace administrateur</h2>
        ${hasDraft ? '<span class="tag" style="background:var(--ac);color:#fff">Brouillon non publié</span>' : '<span class="tag">Site à jour</span>'}
      </div>
      <p class="mut" style="margin:0">Ajoutez ou modifiez vos 4×4 et vos photos ci-dessous, puis cliquez sur <b>« Publier en ligne »</b> pour mettre à jour le site.</p>

      <b id="fn-title">${editId ? "Modifier le véhicule" : "Ajouter un véhicule"}</b>
      <label>Nom du véhicule<input id="fn" placeholder="Ex : Toyota Land Cruiser Prado" value="${esc(form.name)}"></label>
      <label>Description<textarea id="fd" rows="2" placeholder="Confortable, climatisé, idéal pour les pistes...">${esc(form.desc)}</textarea></label>
      <label>Équipements / caractéristiques (séparés par une virgule)<input id="fsp" placeholder="7 places, 4×4, Climatisation, Snorkel" value="${esc((form.specs || []).join(", "))}"></label>
      <label>Prix par jour en € (laisser vide = Tarif sur devis)<input id="fp" value="${esc(form.price)}"></label>
      <label>Photos du véhicule (depuis votre téléphone ou PC)<input id="fi" type="file" accept="image/*" multiple></label>
      <label>… ou chemin d'une image déjà sur le serveur<input id="fpath" placeholder="img/starex.jpg"></label>
      <div class="prev">${(form.imgs || []).map((s, i) =>
        `<span><img src="${esc(s)}" alt=""><button class="btn r sm" data-act="rmimg" data-i="${i}">×</button></span>`).join("")}</div>
      <div>
        <button class="btn" data-act="save">${editId ? "Enregistrer ce véhicule" : "Ajouter ce véhicule"}</button>
        ${editId ? '<button class="btn s" data-act="cancel">Annuler la modification</button>' : ""}
      </div>

      <hr style="border:0;border-top:1px solid var(--bd);width:100%">
      <b>Galerie & Contact</b>
      <label>Ajouter des photos à la galerie « Sur les pistes »<input id="gi" type="file" accept="image/*" multiple></label>
      <label>Numéro WhatsApp (avec indicatif, sans +)<input id="ph" value="${esc(D.phone)}"></label>

      <hr style="border:0;border-top:1px solid var(--bd);width:100%">
      <b>Publication du site</b>
      <label>Clé de publication GitHub (enregistrée automatiquement sur cet appareil)
        <input id="ghtoken" type="password" placeholder="github_pat_..." value="${esc(savedToken)}">
      </label>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn" data-act="publish" ${publishing ? "disabled" : ""}>${publishing ? "Publication en cours..." : "🚀 Publier en ligne"}</button>
        <button class="btn s" data-act="reset">Annuler le brouillon</button>
        <button class="btn s" data-act="dl">Sauvegarde (data.js)</button>
      </div>

      <details style="margin-top:6px">
        <summary style="font-size:13px;color:var(--mut)">Options avancées (changer le mot de passe admin)</summary>
        <div style="display:grid;gap:8px;margin-top:10px">
          <label>Nouveau mot de passe admin (à coller dans adminHash de data.js)
            <input id="gh" placeholder="nouveau mot de passe"></label>
          <button class="btn s sm" data-act="gh">Calculer le hash</button>
          <code id="ghout" style="word-break:break-all;font-size:12px"></code>
        </div>
      </details>
    </div>`;
  }

  function render() {
    const opts = D.cars.map((c) => `<option>${esc(c.name)}</option>`).join("");
    const today = todayStr();
    $("#app").innerHTML = `
    <header>
      <a href="#" class="logo">🚙 Mada Piste</a>
      <nav>
        <a href="#cars">Véhicules</a>
        ${D.gallery.length || admin ? '<a href="#gal">Galerie</a>' : ""}
        <a href="#routes">Itinéraires</a>
        <a href="#faq">FAQ</a>
        <a href="#reserver" class="nav-cta">Devis / Transfert</a>
        ${admin ? '<a href="#" data-act="adminout">Quitter admin</a>' : ""}
      </nav>
    </header>

    <div class="hero" style="${D.hero ? `background-image:url('${esc(D.hero)}')` : ""}">
      <div>
        <span class="hero-tag">Madagascar · Circuits & Transfert aéroport</span>
        <h1>Un 4×4 avec chauffeur partout à Madagascar</h1>
        <p>Circuits sur mesure, expéditions tout-terrain et transfert aéroport d'Ivato vers votre hôtel ou en province.</p>
        <div class="hero-btns">
          <a class="btn" href="#reserver">Demander un devis</a>
          <a class="btn s-light" href="#reserver" data-act="transfer">Réserver un transfert aéroport</a>
        </div>
      </div>
    </div>

    <div class="trust"><div>
      <p style="margin:0"><b>Chauffeurs expérimentés</b><span>Guides locaux connaissant chaque piste</span></p>
      <p style="margin:0"><b>Transfert aéroport 24/7</b><span>Accueil Ivato (Tana) & provinces</span></p>
      <p style="margin:0"><b>4×4 préparés piste</b><span>Entretien rigoureux & grand confort</span></p>
      <p style="margin:0"><b>Devis rapide</b><span>Réponse directe par WhatsApp</span></p>
    </div></div>

    ${showAdminLogin && !admin ? `<section>${adminLogin()}</section>` : ""}
    ${admin ? `<section>${adminPanel()}</section>` : ""}

    <section id="cars">
      <div class="sec-head">
        <h2>Nos 4×4 avec chauffeur</h2>
        <span class="mut">Cliquez sur une photo pour l'agrandir</span>
      </div>
      <div class="grid">${D.cars.map(carCard).join("")}</div>
    </section>

    ${D.gallery.length || admin ? `<section id="gal">
      <div class="sec-head">
        <h2>Sur les pistes</h2>
        <span class="mut">Nos véhicules en conditions réelles</span>
      </div>
      <div class="gal">${D.gallery.map((s, i) =>
        `<div><img src="${esc(s)}" alt="" loading="lazy" data-act="zoomgal" data-idx="${i}">${admin ? `<button class="btn r sm" data-act="rmgal" data-i="${i}">×</button>` : ""}</div>`).join("")}</div>
    </section>` : ""}

    <section id="routes">
      <h2>Nos prestations & itinéraires</h2>
      <div class="steps routes">
        <div>
          <span class="tag">Transfert · 24h/24</span>
          <b>Navette & Transfert Aéroport</b>
          <span>Accueil personnalisé à l'aéroport d'Ivato (TNR) avec pancarte et transfert vers votre hôtel ou toute ville.</span>
        </div>
        <div>
          <span class="tag">10 à 15 jours</span>
          <b>La mythique RN7 (Tana – Tuléar)</b>
          <span>Hautes Terres, parc de l'Isalo, Ranomafana et plages d'Ifaty avec chauffeur-guide.</span>
        </div>
        <div>
          <span class="tag">5 à 12 jours</span>
          <b>Ouest & Grand Nord</b>
          <span>Allée des Baobabs, Tsingy de Bemaraha, Diego-Suarez et embarcadère d'Ankify (Nosy Be).</span>
        </div>
      </div>
    </section>

    <section id="reserver">
      <h2>Demander un devis</h2>
      <div class="book-wrap">
        <form id="bk">
          <div class="row">
            <label>Prestation
              <select id="bsrv">
                <option value="Location 4×4 avec chauffeur">Location 4×4 avec chauffeur</option>
                <option value="Transfert aéroport">Transfert aéroport</option>
              </select>
            </label>
            <label>Véhicule souhaité<select id="bc">${opts}</select></label>
          </div>
          <div class="row">
            <label>Date de départ / arrivée vol<input id="bd" type="date" min="${today}"></label>
            <label>Date de retour (optionnel si transfert)<input id="br" type="date" min="${today}"></label>
          </div>
          <label>Lieu de prise en charge / Itinéraire ou n° de vol<input id="bt" placeholder="Ex : Aéroport Ivato (vol AF934) → Hôtel centre-ville ou circuit RN7"></label>
          <div class="row">
            <label>Nom<input id="bn" required></label>
            <label>Téléphone (WhatsApp)<input id="bp" required inputmode="tel"></label>
          </div>
          <button class="btn" type="submit">Envoyer la demande sur WhatsApp</button>
        </form>

        <div class="box info-box">
          <b>Comment ça marche ?</b>
          <ol class="mini-steps">
            <li><b>Choisissez la prestation</b> (circuit avec chauffeur ou transfert aéroport) et le 4×4.</li>
            <li><b>Envoyez le formulaire</b> : votre message WhatsApp se pré-remplit automatiquement.</li>
            <li><b>Recevez votre devis</b> clair et personnalisé rapidement.</li>
          </ol>
          <hr style="border:0;border-top:1px solid var(--bd);width:100%">
          <b>Inclus dans nos prestations :</b>
          <ul class="check-list">
            <li>Chauffeur professionnel expérimenté et ponctuel</li>
            <li>Véhicule 4×4 climatisé, révisé avant chaque départ</li>
            <li>Accueil pancarte à l'aéroport (suivi des retards de vol)</li>
            <li>Assistance 7j/7 sur toute l'île de Madagascar</li>
          </ul>
        </div>
      </div>
    </section>

    <section id="faq">
      <h2>Questions fréquentes</h2>
      <div class="faq-list">
        <details>
          <summary>Proposez-vous la location sans chauffeur ?</summary>
          <p>Non, tous nos véhicules sont loués <b>exclusivement avec chauffeur</b>. Les pistes malgaches demandent une solide expérience du terrain et de la mécanique locale : nos chauffeurs garantissent votre sécurité et la sérénité de votre voyage.</p>
        </details>
        <details>
          <summary>Comment se déroule le transfert depuis l'aéroport d'Ivato ?</summary>
          <p>Votre chauffeur vous attend directement à la sortie des arrivées avec une pancarte à votre nom, même en cas de retard de votre vol, et vous conduit jusqu'à votre hôtel à Antananarivo ou votre destination en province.</p>
        </details>
        <details>
          <summary>Comment sont gérés le carburant et l'hébergement du chauffeur ?</summary>
          <p>Pour les circuits de plusieurs jours, le carburant reste à la charge du client selon le kilométrage parcouru. Les détails concernant l'indemnité repas/hébergement du chauffeur sont précisés clairement dans votre devis WhatsApp.</p>
        </details>
        <details>
          <summary>Faut-il verser un acompte pour réserver ?</summary>
          <p>Le devis par WhatsApp est gratuit et sans engagement. Un acompte vous sera uniquement demandé une fois le véhicule, l'itinéraire et les dates validés ensemble pour bloquer le planning.</p>
        </details>
      </div>
    </section>

    <dialog id="lbModal" class="lb">
      <div class="lb-inner">
        <button class="lb-close" data-act="lbclose" aria-label="Fermer">✕</button>
        ${lb.imgs.length > 1 ? '<button class="lb-nav prev" data-act="lbprev" aria-label="Précédent">‹</button>' : ""}
        <img id="lbImg" src="${esc(lb.imgs[lb.idx] || "")}" alt="">
        ${lb.imgs.length > 1 ? '<button class="lb-nav next" data-act="lbnext" aria-label="Suivant">›</button>' : ""}
        ${lb.imgs.length > 1 ? `<div class="lb-count">${lb.idx + 1} / ${lb.imgs.length}</div>` : ""}
      </div>
    </dialog>

    <a class="wa-float" href="${wa("Bonjour, je souhaite un devis (4×4 avec chauffeur / transfert aéroport).")}" target="_blank" rel="noopener">
      <svg viewBox="0 0 32 32" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M16 .5C7.44.5.5 7.44.5 16c0 2.73.71 5.4 2.07 7.76L.38 31.62l8.06-2.11A15.44 15.44 0 0 0 16 31.5c8.56 0 15.5-6.94 15.5-15.5S24.56.5 16 .5zm0 28.38c-2.42 0-4.79-.65-6.86-1.88l-.49-.29-4.78 1.25 1.28-4.66-.32-.51A12.83 12.83 0 0 1 3.12 16C3.12 8.9 8.9 3.12 16 3.12S28.88 8.9 28.88 16 23.1 28.88 16 28.88zm7.06-9.63c-.39-.19-2.29-1.13-2.64-1.26-.36-.13-.62-.19-.88.19-.26.39-1 1.26-1.23 1.52-.23.26-.45.29-.84.1-.39-.19-1.64-.6-3.12-1.92-1.15-1.03-1.93-2.3-2.16-2.69-.23-.39-.02-.6.17-.79.18-.18.39-.45.58-.68.19-.23.26-.39.39-.65.13-.26.06-.48-.03-.68-.1-.19-.88-2.11-1.2-2.89-.32-.76-.64-.66-.88-.67h-.75c-.26 0-.68.1-1.03.48-.36.39-1.36 1.33-1.36 3.24 0 1.91 1.39 3.76 1.58 4.02.19.26 2.74 4.18 6.63 5.86.93.4 1.65.64 2.21.82.93.3 1.78.26 2.45.16.75-.11 2.29-.94 2.61-1.84.32-.91.32-1.68.23-1.84-.1-.16-.36-.26-.75-.45z"/></svg>
      <span>WhatsApp</span>
    </a>

    <footer>
      <b>Mada Piste</b><br>Location de 4×4 avec chauffeur & Transfert aéroport à Madagascar<br>
      <a href="tel:+${esc(D.phone)}">+${esc(D.phone)}</a> · <a href="${wa("Bonjour")}" target="_blank" rel="noopener">WhatsApp</a>
    </footer>`;

    if (lb.open) $("#lbModal").showModal();
  }

  /* ---------- Actions ---------- */
  const keep = () => {
    form.name = $("#fn").value;
    form.desc = $("#fd").value;
    form.price = $("#fp").value;
    form.specs = $("#fsp").value.split(",").map((s) => s.trim()).filter(Boolean);
  };

  const openLb = (imgs, idx = 0) => {
    if (!imgs || !imgs.length) return;
    lb = { open: true, imgs, idx };
    render();
  };

  document.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-act]");
    if (!t) {
      if (e.target.id === "lbModal") { lb.open = false; $("#lbModal").close(); }
      return;
    }
    const a = t.dataset.act, id = t.dataset.id, i = +t.dataset.i, idx = +t.dataset.idx;

    // Miniatures & Lightbox
    if (a === "th") {
      $("#im" + id).style.backgroundImage = `url('${t.src}')`;
      $("#im" + id).dataset.cur = idx;
      document.querySelectorAll(`#th${id} img`).forEach((el, k) => el.classList.toggle("act", k === idx));
      return;
    }
    if (a === "zoomcar") {
      const car = D.cars.find((c) => c.id === id);
      openLb(car.imgs, +(t.dataset.cur || 0));
      return;
    }
    if (a === "zoomgal") { openLb(D.gallery, idx); return; }
    if (a === "lbclose") { lb.open = false; $("#lbModal").close(); return; }
    if (a === "lbprev") { lb.idx = (lb.idx - 1 + lb.imgs.length) % lb.imgs.length; render(); return; }
    if (a === "lbnext") { lb.idx = (lb.idx + 1) % lb.imgs.length; render(); return; }

    // Navigation & Transfert
    if (a === "book") {
      $("#bsrv").value = "Location 4×4 avec chauffeur";
      $("#bc").value = D.cars.find((c) => c.id === id).name;
      $("#reserver").scrollIntoView();
      return;
    }
    if (a === "transfer") {
      e.preventDefault();
      $("#bsrv").value = "Transfert aéroport";
      $("#bt").placeholder = "Ex : Aéroport Ivato → Hôtel Antananarivo (Vol AF934 à 22h30)";
      $("#reserver").scrollIntoView();
      return;
    }
    if (a === "adminout") {
      e.preventDefault(); admin = false; sessionStorage.removeItem("mp_admin"); D = SITE; render(); return;
    }

    // Actions admin
    if (!admin) return;
    if (a === "edit") {
      editId = id; form = clone(D.cars.find((c) => c.id === id)); render(); $("#fn").scrollIntoView(); return;
    }
    if (a === "cancel") { editId = null; form = { imgs: [], specs: [] }; render(); return; }
    if (a === "del") {
      if (confirm("Supprimer ce véhicule ?")) { D.cars = D.cars.filter((c) => c.id !== id); saveDraft(); }
      return;
    }
    if (a === "rmimg") { keep(); form.imgs.splice(i, 1); render(); return; }
    if (a === "rmgal") { D.gallery.splice(i, 1); saveDraft(); return; }
    if (a === "save") {
      keep();
      if (!form.name) return alert("Le nom est obligatoire.");
      if (editId) D.cars = D.cars.map((c) => (c.id === editId ? { ...form, id: editId } : c));
      else D.cars.push({ ...form, id: "c" + Date.now() });
      editId = null; form = { imgs: [], specs: [] }; saveDraft(); return;
    }
    if (a === "publish") { await publishToGitHub(); return; }
    if (a === "dl") {
      const code = "window.SITE = " + JSON.stringify(D, null, 2) + ";\n";
      const l = document.createElement("a");
      l.href = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
      l.download = "data.js"; l.click();
      return;
    }
    if (a === "reset") {
      if (confirm("Effacer le brouillon non publié et revenir à la version en ligne ?")) {
        store.del("mp_draft"); D = clone(SITE); render();
      }
      return;
    }
    if (a === "gh") { $("#ghout").textContent = await sha($("#gh").value); }
  });

  // Navigation clavier dans la visionneuse
  document.addEventListener("keydown", (e) => {
    if (!lb.open) return;
    if (e.key === "Escape") { lb.open = false; $("#lbModal").close(); }
    if (e.key === "ArrowLeft") { lb.idx = (lb.idx - 1 + lb.imgs.length) % lb.imgs.length; render(); }
    if (e.key === "ArrowRight") { lb.idx = (lb.idx + 1) % lb.imgs.length; render(); }
  });

  document.addEventListener("change", async (e) => {
    const t = e.target;
    if (t.id === "bsrv") {
      $("#bt").placeholder = t.value === "Transfert aéroport"
          ? "Ex : Aéroport Ivato → Hôtel Antananarivo (Vol AF934 à 22h30)"
          : "Ex : Aéroport Ivato → RN7 → Tuléar";
      return;
    }
    if (t.id === "bd" && t.value) {
      const ret = $("#br");
      ret.min = t.value;
      if (ret.value && ret.value < t.value) ret.value = t.value;
      return;
    }
    if (!admin) return;
    if (t.id === "ghtoken") { store.set("mp_gh_token", t.value.trim()); return; }
    if (t.id === "ph") { D.phone = t.value.replace(/\D/g, ""); saveDraft(); }
    if (t.id === "fi") {
      keep();
      for (const f of t.files) (form.imgs = form.imgs || []).push(await compress(f));
      render();
    }
    if (t.id === "fpath" && t.value.trim()) { keep(); form.imgs.push(t.value.trim()); render(); }
    if (t.id === "gi") {
      for (const f of t.files) D.gallery.push(await compress(f));
      saveDraft();
    }
  });

  document.addEventListener("submit", async (e) => {
    const f = e.target;
    if (!["bk", "alf"].includes(f.id)) return;
    e.preventDefault();

    if (f.id === "bk") {
      const g = (s) => $(s).value.trim();
      if (!g("#bn") || !g("#bp")) return alert("Nom et téléphone requis.");
      const srv = g("#bsrv");
      const dates = g("#br") ? `du ${g("#bd") || "?"} au ${g("#br")}` : `le ${g("#bd") || "?"}`;
      const m = `Bonjour, je souhaite un devis :\n• Prestation : ${srv}\n• Véhicule : ${g("#bc")}\n• Date(s) : ${dates}\n• Trajet / Vol : ${g("#bt") || "?"}\n• Nom : ${g("#bn")}\n• Tél : ${g("#bp")}`;
      window.open(wa(m), "_blank");
    }

    if (f.id === "alf") {
      if ((await sha($("#alp").value)) !== SITE.adminHash) return alert("Mot de passe incorrect.");
      admin = true; sessionStorage.setItem("mp_admin", "1");
      D = store.get("mp_draft", null) || clone(SITE); showAdminLogin = false; render();
    }
  });

  if (location.hash === "#admin") showAdminLogin = true;
  render();
})();