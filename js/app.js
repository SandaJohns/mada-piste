(function () {
  "use strict";

  /* ---------- Outils ---------- */
  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); }
      catch (e) { alert("Mémoire du navigateur pleine : utilise des chemins d'images (img/...) plutôt que des uploads."); }
    },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const sha = async (s) => {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  };
  const compress = (file) => new Promise((ok, ko) => {
    const r = new FileReader(), img = new Image();
    r.onload = () => { img.src = r.result; };
    r.onerror = ko; img.onerror = ko;
    img.onload = () => {
      const k = Math.min(1, 1200 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      ok(c.toDataURL("image/jpeg", 0.75));
    };
    r.readAsDataURL(file);
  });

  /* ---------- État ---------- */
  let admin = sessionStorage.getItem("mp_admin") === "1";
  let D = admin ? (store.get("mp_draft", null) || clone(SITE)) : SITE;   // D = données affichées
  let sess = store.get("mp_sess", null);                                 // client connecté
  let authMode = "login", showAdminLogin = false, editId = null, form = { imgs: [] };

  const saveDraft = () => { store.set("mp_draft", D); render(); };
  const wa = (msg) => `https://wa.me/${D.phone}?text=${encodeURIComponent(msg)}`;

  /* ---------- Affichage ---------- */
  function carCard(c) {
    const imgs = c.imgs || [];
    return `
    <article class="card">
      <div class="im" id="im${esc(c.id)}" style="background-image:url('${esc(imgs[0] || "")}')"></div>
      ${imgs.length > 1 ? `<div class="thumbs">${imgs.map((s) =>
        `<img src="${esc(s)}" alt="" data-act="th" data-id="${esc(c.id)}">`).join("")}</div>` : ""}
      <div class="bd">
        <h3>${esc(c.name)}</h3>
        <p>${esc(c.desc)}</p>
        ${(c.specs || []).map((s) => `<span class="tag">${esc(s)}</span>`).join("")}
        <p class="pr">${c.price ? esc(c.price) + " € / jour" : "Sur devis"}</p>
        <span class="tag">Disponible partout à Madagascar</span><br>
        <button class="btn sm" data-act="book" data-id="${esc(c.id)}">Réserver</button>
        ${admin ? `
          <button class="btn s sm" data-act="edit" data-id="${esc(c.id)}">Modifier</button>
          <button class="btn r sm" data-act="del" data-id="${esc(c.id)}">Supprimer</button>` : ""}
      </div>
    </article>`;
  }

  function accountBox() {
    if (sess) {
      const hist = store.get("mp_h_" + sess.phone, []);
      return `<div class="box"><b>Bonjour ${esc(sess.name)}</b>
        <span class="mut">Vos dernières demandes :</span>
        ${hist.length ? hist.map((h) => `<span class="tag">${esc(h)}</span>`).join("") : '<span class="mut">Aucune pour l\'instant.</span>'}
        <button class="btn s sm" data-act="out">Se déconnecter</button></div>`;
    }
    const reg = authMode === "reg";
    return `<form id="af"><b>${reg ? "Créer un compte client" : "Connexion client"}</b>
      ${reg ? '<label>Nom<input id="an" required></label>' : ""}
      <label>Téléphone<input id="ap" required inputmode="tel"></label>
      <label>Mot de passe<input id="aw" type="password" required minlength="4"></label>
      <button class="btn" type="submit">${reg ? "Créer mon compte" : "Me connecter"}</button>
      <a href="#" data-act="mode" class="mut">${reg ? "J'ai déjà un compte" : "Pas encore de compte ? S'inscrire"}</a>
      <span class="mut">Le compte est enregistré sur cet appareil uniquement.</span></form>`;
  }

  function adminLogin() {
    return `<form id="alf"><b>Connexion administrateur</b>
      <label>Mot de passe<input id="alp" type="password" required></label>
      <button class="btn" type="submit">Entrer</button></form>`;
  }

  function adminPanel() {
    return `<div class="box adm">
      <h2>Espace administrateur</h2>
      <p class="mut">Vos changements sont un brouillon visible uniquement ici. Pour les publier : « Copier data.js », puis collez dans <code>js/data.js</code> sur votre hébergement.</p>

      <b id="fn-title">${editId ? "Modifier le véhicule" : "Ajouter un véhicule"}</b>
      <label>Nom<input id="fn" value="${esc(form.name)}"></label>
      <label>Description<textarea id="fd" rows="2">${esc(form.desc)}</textarea></label>
      <label>Prix par jour en € (vide = sur devis)<input id="fp" value="${esc(form.price)}"></label>
      <label>Photos (upload)<input id="fi" type="file" accept="image/*" multiple></label>
      <label>… ou chemin d'une image déjà sur le serveur<input id="fpath" placeholder="img/starex.jpg"></label>
      <div class="prev">${(form.imgs || []).map((s, i) =>
        `<span><img src="${esc(s)}" alt=""><button class="btn r sm" data-act="rmimg" data-i="${i}">×</button></span>`).join("")}</div>
      <div><button class="btn" data-act="save">${editId ? "Mettre à jour" : "Ajouter"}</button>
      ${editId ? '<button class="btn s" data-act="cancel">Annuler</button>' : ""}</div>

      <hr style="border:0;border-top:1px solid var(--bd);width:100%">
      <label>Photos de la galerie<input id="gi" type="file" accept="image/*" multiple></label>
      <label>Numéro WhatsApp (sans +)<input id="ph" value="${esc(D.phone)}"></label>

      <hr style="border:0;border-top:1px solid var(--bd);width:100%">
      <div>
        <button class="btn" data-act="copy">Copier data.js</button>
        <button class="btn s" data-act="dl">Télécharger data.js</button>
        <button class="btn s" data-act="reset">Annuler le brouillon</button>
      </div>

      <label>Générer un nouveau mot de passe admin (à coller dans adminHash)
        <input id="gh" placeholder="nouveau mot de passe"></label>
      <button class="btn s sm" data-act="gh">Calculer le hash</button>
      <code id="ghout" style="word-break:break-all"></code>
    </div>`;
  }

  function render() {
    const opts = D.cars.map((c) => `<option>${esc(c.name)}</option>`).join("");
    $("#app").innerHTML = `
    <header><b>Mada Piste</b>
      <nav>
        <a href="#cars">Véhicules</a>
        ${D.gallery.length || admin ? '<a href="#gal">Galerie</a>' : ""}
        <a href="#reserver">Réserver</a>
        <a href="#compte">${sess ? esc(sess.name) : "Mon compte"}</a>
        ${admin ? '<a href="#" data-act="adminout">Quitter l\'admin</a>' : ""}
      </nav></header>

    <div class="hero" style="${D.hero ? `background-image:url('${esc(D.hero)}')` : ""}">
      <div><h1>Un 4×4, partout à Madagascar</h1>
      <p>Location avec ou sans chauffeur, livraison dans toute l'île.</p>
      <a class="btn" href="#reserver">Demander un devis</a></div></div>

    <div class="trust"><div>
      <p style="margin:0"><b>Disponible partout</b><span>Dans toute l'île de Madagascar</span></p>
      <p style="margin:0"><b>Avec ou sans chauffeur</b><span>Selon votre itinéraire</span></p>
      <p style="margin:0"><b>4×4 adaptés aux pistes</b><span>Starex, Terracan, Land Cruiser</span></p>
      <p style="margin:0"><b>Réponse rapide</b><span>Devis par WhatsApp</span></p>
    </div></div>

    ${showAdminLogin && !admin ? `<section>${adminLogin()}</section>` : ""}
    ${admin ? `<section>${adminPanel()}</section>` : ""}

    <section id="cars"><h2>Nos 4×4</h2><div class="grid">${D.cars.map(carCard).join("")}</div></section>

    ${D.gallery.length || admin ? `<section id="gal"><h2>Galerie</h2><div class="gal">${D.gallery.map((s, i) =>
        `<div><img src="${esc(s)}" alt="" loading="lazy">${admin ? `<button class="btn r sm" data-act="rmgal" data-i="${i}">×</button>` : ""}</div>`).join("")}</div></section>` : ""}

    <section><h2>Comment ça marche</h2><div class="steps">
      <div><b>Choisissez votre 4×4</b><span>Parcourez les véhicules et notez vos dates.</span></div>
      <div><b>Envoyez votre demande</b><span>Le formulaire ouvre WhatsApp, déjà rempli.</span></div>
      <div><b>Recevez votre devis</b><span>Nous confirmons le prix et la prise en charge.</span></div>
    </div></section>

    <section id="reserver"><h2>Réserver</h2>
      <form id="bk">
        <label>Véhicule<select id="bc">${opts}</select></label>
        <div class="row"><label>Départ<input id="bd" type="date"></label><label>Retour<input id="br" type="date"></label></div>
        <label>Destination / ville de prise en charge<input id="bt"></label>
        <div class="row"><label>Nom<input id="bn" value="${esc(sess ? sess.name : "")}"></label>
        <label>Téléphone<input id="bp" inputmode="tel" value="${esc(sess ? sess.phone : "")}"></label></div>
        <button class="btn" type="submit">Envoyer sur WhatsApp</button>
      </form></section>

    <section id="compte"><h2>Espace client</h2>${accountBox()}</section>

    <a class="wa-float" href="${wa("Bonjour, je souhaite un devis pour un 4×4.")}" target="_blank" rel="noopener">WhatsApp</a>
    <footer><b>Mada Piste</b><br>Location de 4×4 partout à Madagascar<br>
      <a href="tel:+${esc(D.phone)}">+${esc(D.phone)}</a> · <a href="${wa("Bonjour")}" target="_blank" rel="noopener">WhatsApp</a></footer>`;
  }

  /* ---------- Actions ---------- */
  const keep = () => {
    form.name = $("#fn").value; form.desc = $("#fd").value; form.price = $("#fp").value;
  };

  document.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const a = t.dataset.act, id = t.dataset.id, i = +t.dataset.i;

    // Actions publiques
    if (a === "th") { $("#im" + id).style.backgroundImage = `url('${t.src}')`; return; }
    if (a === "book") { $("#bc").value = D.cars.find((c) => c.id === id).name; $("#reserver").scrollIntoView(); return; }
    if (a === "mode") { e.preventDefault(); authMode = authMode === "reg" ? "login" : "reg"; render(); return; }
    if (a === "out") { sess = null; store.del("mp_sess"); render(); return; }
    if (a === "adminout") {
      e.preventDefault(); admin = false; sessionStorage.removeItem("mp_admin"); D = SITE; render(); return;
    }

    // Actions admin
    if (!admin) return;
    if (a === "edit") {
      editId = id; form = clone(D.cars.find((c) => c.id === id)); render(); $("#fn").scrollIntoView(); return;
    }
    if (a === "cancel") { editId = null; form = { imgs: [] }; render(); return; }
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
      editId = null; form = { imgs: [] }; saveDraft(); return;
    }
    if (a === "copy" || a === "dl") {
      const code = "window.SITE = " + JSON.stringify(D, null, 2) + ";\n";
      if (a === "copy") {
        try { await navigator.clipboard.writeText(code); alert("data.js copié. Collez-le dans js/data.js."); }
        catch (err) { alert("Copie impossible : utilisez « Télécharger data.js »."); }
      } else {
        const l = document.createElement("a");
        l.href = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
        l.download = "data.js"; l.click();
      }
      return;
    }
    if (a === "reset") {
      if (confirm("Effacer le brouillon et revenir à data.js ?")) { store.del("mp_draft"); D = clone(SITE); render(); }
      return;
    }
    if (a === "gh") { $("#ghout").textContent = await sha($("#gh").value); }
  });

  document.addEventListener("change", async (e) => {
    if (!admin) return;
    const t = e.target;
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
    if (!["bk", "af", "alf"].includes(f.id)) return;
    e.preventDefault();

    if (f.id === "bk") {                                   // réservation WhatsApp
      const g = (s) => $(s).value.trim();
      if (!g("#bn") || !g("#bp")) return alert("Nom et téléphone requis.");
      const m = `Bonjour, je souhaite réserver : ${g("#bc")}\nDu ${g("#bd") || "?"} au ${g("#br") || "?"}\nDestination : ${g("#bt") || "?"}\nNom : ${g("#bn")}\nTél : ${g("#bp")}`;
      if (sess) {
        const k = "mp_h_" + sess.phone;
        store.set(k, [m.split("\n").slice(0, 3).join(" · "), ...store.get(k, [])].slice(0, 20));
      }
      window.open(wa(m), "_blank");
    }

    if (f.id === "af") {                                   // compte client
      const p = $("#ap").value.trim(), w = await sha($("#aw").value), u = store.get("mp_users", {});
      if (authMode === "reg") {
        if (u[p]) return alert("Ce numéro a déjà un compte.");
        u[p] = { name: $("#an").value.trim(), w }; store.set("mp_users", u);
      } else if (!u[p] || u[p].w !== w) return alert("Téléphone ou mot de passe incorrect.");
      sess = { name: u[p].name, phone: p }; store.set("mp_sess", sess); render();
    }

    if (f.id === "alf") {                                  // admin
      if ((await sha($("#alp").value)) !== SITE.adminHash) return alert("Mot de passe incorrect.");
      admin = true; sessionStorage.setItem("mp_admin", "1");
      D = store.get("mp_draft", null) || clone(SITE); showAdminLogin = false; render();
    }
  });

  if (location.hash === "#admin") showAdminLogin = true;   // accès admin : index.html#admin
  render();
})();