const ICONS = {
  discover: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/></svg>`,
  standouts: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5z"/></svg>`,
  likes: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.6-7 10-7 10z"/></svg>`,
  messages: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 6h14v10H8l-3 3V6z"/></svg>`,
  profile: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 19a6.5 6.5 0 0 1 13 0"/></svg>`
};

const defaultUser = () => ({
  name: "",
  age: 28,
  gender: "women",
  orientation: "",
  city: "Austin",
  seeking: "everyone",
  job: "",
  school: "",
  height: "5'8\"",
  intention: "Looking for something serious",
  photos: ["", "", "", "", "", ""],
  prompts: [
    { q: "A life goal of mine", a: "" },
    { q: "The way to win me over is", a: "" },
    { q: "I go crazy for", a: "" }
  ]
});

const ORIENTATIONS = [
  ["straight", "Straight"],
  ["gay", "Gay"],
  ["lesbian", "Lesbian"],
  ["bisexual", "Bisexual"],
  ["queer", "Queer"],
  ["pansexual", "Pansexual"],
  ["asexual", "Asexual"],
  ["questioning", "Questioning"]
];

function orientationLabel(key) {
  return (ORIENTATIONS.find(([v]) => v === key) || [key, key || "—"])[1];
}

function genderLabel(key) {
  return { women: "Woman", men: "Man", nonbinary: "Non-binary" }[key] || key;
}

function openTo(person, targetGender) {
  const o = person.orientation;
  const g = person.gender;
  if (!o || !targetGender) return true;
  if (["bisexual", "queer", "pansexual", "questioning", "asexual"].includes(o)) return true;
  if (o === "straight") {
    if (g === "women") return targetGender === "men";
    if (g === "men") return targetGender === "women";
    return true;
  }
  if (o === "gay") {
    if (g === "men") return targetGender === "men";
    if (g === "women") return targetGender === "women";
    return targetGender === "men" || targetGender === "nonbinary";
  }
  if (o === "lesbian") return targetGender === "women" || targetGender === "nonbinary";
  return true;
}

const defaultGithub = () => latchStorage.inferTarget();

function emptyState() {
  return {
    user: defaultUser(),
    onboarded: false,
    view: "discover",
    chatId: null,
    skipped: [],
    liked: [],
    matches: [],
    roses: 5,
    threads: {},
    unread: {},
    pendingBots: {},
    tweaks: {},
    unmatched: [],
    github: defaultGithub(),
    updatedAt: 0
  };
}

function migrate(raw) {
  const s = { ...emptyState(), ...raw };
  s.user = { ...defaultUser(), ...(raw.user || {}) };
  while (s.user.photos.length < 6) s.user.photos.push("");
  s.user.photos = s.user.photos.slice(0, 6);
  s.github = { ...defaultGithub(), ...(raw.github || {}) };
  if (!s.github.owner || !s.github.repo) s.github = { ...latchStorage.inferTarget(), sha: s.github.sha || null };
  s.pendingBots = {};
  s.tweaks = raw.tweaks || {};
  s.unmatched = raw.unmatched || [];
  if (!s.user.photos.some(Boolean) || !s.user.name) s.onboarded = false;
  return s;
}

let state = migrate(latchStorage.readLocal() || emptyState());
let onboardStep = 0;
let saveTimer = null;
let ghBusy = false;
const $ = (id) => document.getElementById(id);

function boardPayload() {
  const { pendingBots, github, ...rest } = state;
  return {
    ...rest,
    pendingBots: {},
    github: { owner: github.owner, repo: github.repo, branch: github.branch, path: github.path },
    updatedAt: Date.now()
  };
}

function save(opts = {}) {
  state.updatedAt = Date.now();
  try {
    latchStorage.writeLocal(state);
  } catch (_) {
    toast("Couldn't save locally — try smaller photos.");
  }
  if (opts.skipRemote) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => syncToGithub().catch(() => {}), 900);
}

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2400);
}

async function syncToGithub() {
  const g = state.github;
  if (!latchStorage.getToken() || !g.owner || !g.repo || ghBusy) return;
  ghBusy = true;
  setGhStatus("Saving to GitHub…");
  try {
    const sha = await latchStorage.pushBoard(g, boardPayload(), g.sha);
    if (sha) state.github.sha = sha;
    latchStorage.writeLocal(state);
    setGhStatus("Saved to GitHub");
  } catch (err) {
    setGhStatus(err.message);
  } finally {
    ghBusy = false;
  }
}

async function loadFromGithub() {
  const g = state.github;
  if (!latchStorage.getToken() || !g.owner || !g.repo) return;
  setGhStatus("Loading board…");
  try {
    const remote = await latchStorage.pullBoard(g);
    if (!remote || remote.missing) {
      setGhStatus("No board file yet — it'll be created on save.");
      return;
    }
    state.github.sha = remote.sha;
    if (remote.data && (remote.data.updatedAt || 0) >= (state.updatedAt || 0)) {
      const keepGh = { ...state.github, sha: remote.sha };
      state = migrate(remote.data);
      state.github = keepGh;
      latchStorage.writeLocal(state);
      toast("Loaded your board from GitHub");
    }
    setGhStatus("In sync");
    if (state.onboarded) render();
  } catch (err) {
    setGhStatus(err.message);
  }
}

function setGhStatus(text) {
  const el = document.querySelector("[data-gh-status]");
  if (el) el.textContent = text;
}

/* Per-person overrides from the admin sheet, applied on read so every card, chat and
   filter sees the edited version rather than the profiles.js original. */
const TWEAK_FIELDS = ["name", "age", "city", "job", "school", "height", "intention", "gender", "orientation"];

function applyTweaks(p) {
  const t = state.tweaks && state.tweaks[p.id];
  if (!t) return p;
  const out = { ...p, voice: { ...p.voice } };
  TWEAK_FIELDS.forEach((k) => {
    if (t[k] !== undefined && t[k] !== "") out[k] = k === "age" ? Number(t[k]) : t[k];
  });
  if (t.prompts) out.prompts = p.prompts.map((q, i) => (t.prompts[i] ? { ...q, a: t.prompts[i] } : q));
  /* chat.js reads style off the profile, so tone edits reach the reply planner. */
  if (t.style) out.style = t.style;
  return out;
}

function allProfiles() {
  return window.LATCH_PROFILES.map(applyTweaks);
}

function profileById(id) {
  const p = window.LATCH_PROFILES.find((x) => x.id === id);
  return p ? applyTweaks(p) : null;
}

/* "Show me" is the filter; sexuality is a profile attribute that seeds it and gets
   displayed. Filtering on both let you save a combination that matched nobody —
   a straight woman set to show women emptied the whole app. */
function visibleProfiles() {
  const me = state.user;
  return allProfiles().filter((p) => {
    if (me.seeking !== "everyone" && p.gender !== me.seeking) return false;
    if (!openTo(p, me.gender)) return false;
    return true;
  });
}

/* What someone's stated sexuality implies they want to see, used as the default so
   the two settings don't start out fighting each other. */
function seekingFor(user) {
  const o = user.orientation;
  const g = user.gender;
  if (o === "straight") return g === "women" ? "men" : g === "men" ? "women" : "everyone";
  if (o === "lesbian") return "women";
  if (o === "gay") return g === "women" ? "women" : "men";
  return "everyone";
}

function discoverQueue() {
  const gone = new Set([...state.skipped, ...state.liked, ...state.matches, ...state.unmatched]);
  return visibleProfiles().filter((p) => !gone.has(p.id) && !p.standout);
}

function standouts() {
  const gone = new Set([...state.skipped, ...state.liked, ...state.matches, ...state.unmatched]);
  return visibleProfiles().filter((p) => p.standout && !gone.has(p.id));
}

function likesIncoming() {
  const gone = new Set([...state.skipped, ...state.matches, ...state.unmatched]);
  return visibleProfiles().filter((p) => p.likesYou && !gone.has(p.id) && !state.liked.includes(p.id));
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function navHtml(active) {
  const items = [
    ["discover", "Discover"],
    ["standouts", "Standouts"],
    ["likes", "Likes"],
    ["messages", "Matches"],
    ["profile", "Profile"]
  ];
  return items
    .map(
      ([id, label]) =>
        `<button class="${active === id || (active === "chat" && id === "messages") ? "active" : ""}" data-go="${id}">${ICONS[id]}<span>${label}</span></button>`
    )
    .join("");
}

function bindNav() {
  document.querySelectorAll("[data-nav]").forEach((nav) => {
    nav.innerHTML = navHtml(state.view === "chat" ? "messages" : state.view);
    nav.querySelectorAll("button").forEach((btn) => {
      btn.onclick = () => setView(btn.dataset.go);
    });
  });
}

function setView(view, extra) {
  state.view = view;
  if (view !== "chat") state.chatId = null;
  if (extra?.chatId) {
    state.view = "chat";
    state.chatId = extra.chatId;
    state.unread[extra.chatId] = false;
  }
  save();
  render();
}

function titles() {
  const map = {
    discover: ["Discover", `${orientationLabel(state.user.orientation) || "Anyone"} · ${state.user.city || "near you"}`],
    standouts: ["Standouts", `${state.roses} rose${state.roses === 1 ? "" : "s"} left this week`],
    likes: ["Likes you", "People who already liked you"],
    messages: ["Matches", "Your conversations"],
    chat: ["Matches", ""],
    profile: ["Your profile", "This is what people see"]
  };
  const t = map[state.view] || map.discover;
  $("page-title").textContent = t[0];
  $("page-sub").textContent = t[1];
}

function photoUrl(p, i) {
  return p.photos[i] || p.photos[0];
}

function userPhotos() {
  return state.user.photos.filter(Boolean);
}

async function onPhotoFile(file, index, after) {
  if (!file) return;
  try {
    const data = await latchStorage.compressImage(file);
    state.user.photos[index] = data;
    save();
    after();
  } catch (_) {
    toast("Couldn't read that photo");
  }
}

function photoGridHtml(prefix) {
  return `<div class="photo-row six">${[0, 1, 2, 3, 4, 5]
    .map(
      (i) => `<div class="photo-slot">
        ${state.user.photos[i] ? `<img src="${esc(state.user.photos[i])}" alt="" />` : ""}
        <label>${state.user.photos[i] ? "Change" : "Add"}<input type="file" accept="image/*" data-photo="${i}" data-photo-prefix="${prefix}" /></label>
      </div>`
    )
    .join("")}</div>`;
}

function bindPhotoInputs(root, after) {
  root.querySelectorAll("[data-photo]").forEach((el) => {
    el.onchange = () => onPhotoFile(el.files[0], Number(el.dataset.photo), after);
  });
}

/* The whole profile: every photo, every prompt, the facts table. Shared by Discover
   and by the full-screen view opened from Standouts and Likes. */
function profileArticleHtml(p) {
  return `<article class="profile-scroll" data-id="${p.id}">
      ${p.photos
        .map(
          (src, i) => `
        <div class="media">
          <img src="${esc(src)}" alt="${esc(p.name)}" />
          ${
            i === 0
              ? `<div class="media-meta"><h2>${esc(p.name)}, ${p.age}</h2>
                <div class="chips"><span class="chip">${esc(orientationLabel(p.orientation))}</span><span class="chip">${esc(genderLabel(p.gender))}</span></div>
                <p>${esc(p.job)}</p></div>`
              : ""
          }
        </div>
        ${
          p.prompts[i]
            ? `<div class="prompt-card">
                <p class="q">${esc(p.prompts[i].q)}</p>
                <p class="a">${esc(p.prompts[i].a)}</p>
                <button class="like-chip" data-comment="${i}">♡  Like with a comment</button>
              </div>`
            : ""
        }`
        )
        .join("")}
      <div class="facts-card">
        <div class="fact"><span>Gender</span><b>${esc(genderLabel(p.gender))}</b></div>
        <div class="fact"><span>Sexuality</span><b>${esc(orientationLabel(p.orientation))}</b></div>
        <div class="fact"><span>Height</span><b>${esc(p.height)}</b></div>
        <div class="fact"><span>School</span><b>${esc(p.school)}</b></div>
        <div class="fact"><span>Looking for</span><b>${esc(p.intention)}</b></div>
      </div>
    </article>`;
}

function renderDiscover() {
  const root = $("view-discover");
  const queue = discoverQueue();
  if (!queue.length) {
    /* Distinguish "seen everyone" from "your filter excludes everyone" — the second
       one looks identical but needs a fix, not patience. */
    const anyone = visibleProfiles().length;
    root.innerHTML = anyone
      ? `<div class="empty"><h3>You're caught up</h3><p class="muted">You've been through everyone who fits your filter. Reset the deck from Profile → Admin.</p></div>`
      : `<div class="empty"><h3>Nobody fits your filter</h3>
          <p class="muted">You're set to show <b>${esc(state.user.seeking)}</b>, and nobody there matches. Widen it and they'll come back.</p>
          <button class="btn-primary" id="fix-filter">Show me everyone</button>
        </div>`;
    if (!anyone) {
      $("fix-filter").onclick = () => {
        state.user.seeking = "everyone";
        save();
        toast("Showing everyone");
        render();
      };
    }
    return;
  }
  const p = queue[0];
  root.innerHTML = `
    ${profileArticleHtml(p)}
    <div class="actions">
      <button type="button" class="skip" title="Skip">✕</button>
      <button type="button" class="like" title="Like">♡</button>
    </div>`;
  root.querySelector(".skip").onclick = () => skip(p.id);
  root.querySelector(".like").onclick = () => likePerson(p.id, null);
  root.querySelectorAll("[data-comment]").forEach((btn) => {
    btn.onclick = () => openComment(p, Number(btn.dataset.comment));
  });
}

function renderStandouts() {
  const root = $("view-standouts");
  const list = standouts();
  if (!list.length) {
    root.innerHTML = `<div class="empty"><h3>No standouts left</h3><p class="muted">New ones land next week. (In this demo, reset from Profile.)</p></div>`;
    return;
  }
  root.innerHTML = `<div class="cards-grid">${list
    .map(
      (p) => `<button class="mini-card" data-open="${p.id}">
        <img src="${esc(photoUrl(p, 0))}" alt="" />
        <div class="pad">
          <span class="badge">This week</span>
          <h3>${esc(p.name)}, ${p.age}</h3>
          <p>${esc(orientationLabel(p.orientation))} · ${esc(genderLabel(p.gender))}</p>
          <p>${esc(p.job)}</p>
          <span class="rose-btn" data-rose="${p.id}">Send a rose</span>
        </div>
      </button>`
    )
    .join("")}</div>`;
  root.querySelectorAll("[data-open]").forEach((el) => {
    el.onclick = (e) => {
      if (e.target.closest("[data-rose]")) return;
      openPreview(profileById(el.dataset.open), { rose: true });
    };
  });
  root.querySelectorAll("[data-rose]").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      sendRose(btn.dataset.rose);
    };
  });
}

function renderLikes() {
  const root = $("view-likes");
  const list = likesIncoming();
  if (!list.length) {
    root.innerHTML = `<div class="empty"><h3>No likes yet</h3><p class="muted">Keep discovering — some people already like you in this demo.</p></div>`;
    return;
  }
  root.innerHTML = `<div class="cards-grid">${list
    .map(
      (p) => `<button class="mini-card" data-open="${p.id}">
        <img src="${esc(photoUrl(p, 0))}" alt="" />
        <div class="pad">
          <h3>${esc(p.name)}, ${p.age}</h3>
          <p>${esc(orientationLabel(p.orientation))} · ${esc(genderLabel(p.gender))}</p>
          ${p.likeNote ? `<p class="note">“${esc(p.likeNote)}”</p>` : `<p>${esc(p.job)}</p>`}
          <span class="match-btn" data-match="${p.id}">Match</span>
        </div>
      </button>`
    )
    .join("")}</div>`;
  root.querySelectorAll("[data-open]").forEach((el) => {
    el.onclick = (e) => {
      if (e.target.closest("[data-match]")) return;
      openPreview(profileById(el.dataset.open), { match: true });
    };
  });
  root.querySelectorAll("[data-match]").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      matchNow(btn.dataset.match, "You matched!");
    };
  });
}

function lastMessage(id) {
  const t = state.threads[id] || [];
  return t.length ? t[t.length - 1] : null;
}

function renderMessages() {
  const root = $("view-messages");
  if (state.view === "chat" && state.chatId) {
    renderChat(root);
    return;
  }
  if (!state.matches.length) {
    root.innerHTML = `<div class="empty"><h3>No matches yet</h3><p class="muted">Like someone who likes you back, or send a rose.</p></div>`;
    return;
  }
  root.innerHTML = `<div class="msg-layout">
    <div class="thread-list">${state.matches
      .map((id) => {
        const p = profileById(id);
        if (!p) return "";
        const last = lastMessage(id);
        const preview = last ? last.text : "Say hello";
        return `<button class="thread-row" data-chat="${id}">
          <img src="${esc(photoUrl(p, 0))}" alt="" />
          <div>
            <h3>${esc(p.name)}</h3>
            <p>${esc(preview)}</p>
          </div>
          ${state.unread[id] ? `<span class="unread"></span>` : `<span></span>`}
        </button>`;
      })
      .join("")}</div>
  </div>`;
  root.querySelectorAll("[data-chat]").forEach((btn) => {
    btn.onclick = () => setView("chat", { chatId: btn.dataset.chat });
  });
}

function renderChat(root) {
  const p = profileById(state.chatId);
  if (!p) {
    state.view = "messages";
    renderMessages();
    return;
  }
  const msgs = state.threads[p.id] || [];
  $("page-title").textContent = p.name;
  $("page-sub").textContent = "Active now";
  root.innerHTML = `
    <div class="chat">
      <div class="chat-head">
        <button class="btn-ghost" id="back-msg">←</button>
        <img src="${esc(photoUrl(p, 0))}" alt="" />
        <div class="chat-who">
          <strong>${esc(p.name)}, ${p.age}</strong>
          <div class="muted" style="font-size:.8rem">${esc(orientationLabel(p.orientation))} · ${esc(p.job)}</div>
        </div>
        <button class="btn-ghost menu-btn" id="chat-menu" aria-label="Chat options">☰</button>
      </div>
      <div class="bubbles" id="bubbles">
        ${msgs
          .map((m) => `<div class="bubble ${m.from === "me" ? "me" : "them"}">${esc(m.text)}</div>`)
          .join("")}
        ${state.pendingBots[p.id] ? `<div class="typing">${esc(p.name)} is typing…</div>` : ""}
      </div>
      <form class="composer" id="composer">
        <input name="text" maxlength="280" placeholder="Send a message" autocomplete="off" />
        <button type="submit">Send</button>
      </form>
    </div>`;
  $("back-msg").onclick = () => setView("messages");
  $("chat-menu").onclick = () => openChatMenu(p);
  const form = $("composer");
  form.onsubmit = (e) => {
    e.preventDefault();
    const input = form.text;
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    sendUserMessage(p.id, text);
  };
  const box = $("bubbles");
  box.scrollTop = box.scrollHeight;
}

function githubFieldsHtml() {
  const g = state.github.owner ? state.github : latchStorage.inferTarget();
  state.github = { ...g, sha: state.github.sha || null };
  const token = latchStorage.getToken();
  const connected = Boolean(token && g.owner && g.repo);
  return `<div class="prompt-card">
    <p class="q">Connect GitHub</p>
    <p class="muted" style="margin:0 0 12px">Paste a token. This site already knows it saves to <b>${esc(g.owner)}/${esc(g.repo)}</b> — you don't enter a repo name.</p>
    <label class="stack">Token
      <input class="field" type="password" id="gh-token" value="${esc(token)}" placeholder="Paste token" autocomplete="off" />
    </label>
    <p class="muted" data-gh-status style="margin:8px 0 0">${connected ? `Ready — ${esc(g.owner)}/${esc(g.repo)}` : "Not connected"}</p>
    <div class="row" style="justify-content:flex-start;margin-top:12px">
      <button type="button" class="btn-primary" id="gh-connect">Connect</button>
    </div>
  </div>`;
}

async function connectGithub() {
  const tok = document.getElementById("gh-token");
  const token = tok ? tok.value.trim() : "";
  setGhStatus("Connecting…");
  try {
    const result = await latchStorage.connect(token);
    state.github = { ...result.target, sha: result.board?.sha || null };
    save({ skipRemote: true });
    if (result.board && !result.board.missing && result.board.data) {
      const keepGh = { ...state.github };
      if ((result.board.data.updatedAt || 0) >= (state.updatedAt || 0)) {
        state = migrate(result.board.data);
        state.github = keepGh;
        latchStorage.writeLocal(state);
      }
    }
    setGhStatus(`Connected as ${result.login} → ${state.github.owner}/${state.github.repo}`);
    toast("Connected");
    await syncToGithub();
    if (state.onboarded) render();
  } catch (err) {
    setGhStatus(err.message);
    toast(err.message);
  }
}

function bindGithub(root) {
  root.querySelector("#gh-connect")?.addEventListener("click", connectGithub);
  const tok = root.querySelector("#gh-token");
  if (tok) {
    tok.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        connectGithub();
      }
    });
  }
}

function renderProfile() {
  const root = $("view-profile");
  const u = state.user;
  root.innerHTML = `
    <div class="editor">
      ${photoGridHtml("profile")}
      <p class="muted" style="margin:0;font-size:.85rem">Photos are compressed and stored with your board (browser + optional GitHub file).</p>
      <label class="stack">First name<input class="field" data-f="name" value="${esc(u.name)}" /></label>
      <label class="stack">Age<input class="field" type="number" min="18" max="99" data-f="age" value="${esc(u.age)}" /></label>
      <label class="stack">I am
        <select data-f="gender">
          <option value="women" ${u.gender === "women" ? "selected" : ""}>A woman</option>
          <option value="men" ${u.gender === "men" ? "selected" : ""}>A man</option>
          <option value="nonbinary" ${u.gender === "nonbinary" ? "selected" : ""}>Non-binary</option>
        </select>
      </label>
      <label class="stack">Sexuality
        <select data-f="orientation">
          <option value="" ${!u.orientation ? "selected" : ""}>Select</option>
          ${ORIENTATIONS.map(([v, l]) => `<option value="${v}" ${u.orientation === v ? "selected" : ""}>${l}</option>`).join("")}
        </select>
      </label>
      <label class="stack">Show me
        <select data-f="seeking">
          <option value="everyone" ${u.seeking === "everyone" ? "selected" : ""}>Everyone</option>
          <option value="women" ${u.seeking === "women" ? "selected" : ""}>Women</option>
          <option value="men" ${u.seeking === "men" ? "selected" : ""}>Men</option>
        </select>
      </label>
      <label class="stack">City<input class="field" data-f="city" value="${esc(u.city)}" /></label>
      <label class="stack">Job title<input class="field" data-f="job" value="${esc(u.job)}" /></label>
      <label class="stack">School<input class="field" data-f="school" value="${esc(u.school)}" /></label>
      <label class="stack">Height<input class="field" data-f="height" value="${esc(u.height)}" /></label>
      <label class="stack">Dating intention
        <select data-f="intention">
          ${["Looking for something serious", "Open to whatever", "Figuring it out"]
            .map((opt) => `<option ${u.intention === opt ? "selected" : ""}>${opt}</option>`)
            .join("")}
        </select>
      </label>
      ${u.prompts
        .map(
          (pr, i) => `<div class="prompt-card">
            <label class="stack">Prompt
              <select data-pq="${i}">${window.PROMPT_BANK.map(
            (q) => `<option ${pr.q === q ? "selected" : ""}>${esc(q)}</option>`
          ).join("")}</select>
            </label>
            <label class="stack" style="margin-top:10px">Your answer
              <textarea data-pa="${i}">${esc(pr.a)}</textarea>
            </label>
          </div>`
        )
        .join("")}
      ${githubFieldsHtml()}
      <div class="admin-card">
        <h3>Admin</h3>
        <p class="muted">Manual controls. These act on this browser, then sync like everything else.</p>
        <button class="btn-ghost" id="reset-demo">Reset likes, matches &amp; chats</button>
        <button class="btn-ghost" id="reset-people">Reset customized people${
          Object.keys(state.tweaks || {}).length ? ` (${Object.keys(state.tweaks).length})` : ""
        }</button>
        <button class="btn-ghost" id="reset-keep">Start over, keep my profile</button>
        <button class="btn-ghost danger" id="reset-all">Full reset — erase everything</button>
      </div>
    </div>`;
  root.querySelectorAll("[data-f]").forEach((el) => {
    el.oninput = () => {
      state.user[el.dataset.f] = el.type === "number" ? Number(el.value) : el.value;
      save();
    };
    if (el.dataset.f === "orientation" || el.dataset.f === "seeking" || el.dataset.f === "gender") {
      el.onchange = () => {
        state.user[el.dataset.f] = el.value;
        save();
        toast("Filters updated");
      };
    }
  });
  root.querySelectorAll("[data-pq]").forEach((el) => {
    el.onchange = () => {
      state.user.prompts[Number(el.dataset.pq)].q = el.value;
      save();
    };
  });
  root.querySelectorAll("[data-pa]").forEach((el) => {
    el.oninput = () => {
      state.user.prompts[Number(el.dataset.pa)].a = el.value;
      save();
    };
  });
  bindPhotoInputs(root, renderProfile);
  bindGithub(root);
  $("reset-demo").onclick = () => {
    state.skipped = [];
    state.liked = [];
    state.matches = [];
    state.unmatched = [];
    state.threads = {};
    state.unread = {};
    state.pendingBots = {};
    state.roses = 5;
    save();
    toast("Deck shuffled");
    setView("discover");
  };
  $("reset-people").onclick = () => {
    state.tweaks = {};
    save();
    toast("Everyone back to their original personality");
    render();
  };
  $("reset-keep").onclick = () => confirmReset("keep");
  $("reset-all").onclick = () => confirmReset("all");
}

/* Two resets, per the admin brief: one wipes the app but hands your profile back to
   the setup wizard prefilled, the other erases you too. */
function confirmReset(mode) {
  const keep = mode === "keep";
  const modal = $("modal");
  modal.classList.remove("hidden");
  modal.innerHTML = `<div class="sheet">
    <h3>${keep ? "Start over, keep my profile" : "Full reset"}</h3>
    <p class="muted">${
      keep
        ? "Clears likes, matches, chats, roses and any customized people, then reopens setup with your details already filled in."
        : "Erases everything including your profile and photos, on this browser and in the saved board. There's no undo."
    }</p>
    <div class="row">
      <button class="btn-ghost" id="cancel-m">Cancel</button>
      <button class="btn-primary" id="do-reset">${keep ? "Reset & edit profile" : "Erase everything"}</button>
    </div>
  </div>`;
  $("cancel-m").onclick = closeModal;
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };
  $("do-reset").onclick = () => {
    const user = keep ? JSON.parse(JSON.stringify(state.user)) : null;
    const github = { ...state.github };
    state = migrate({ ...emptyState(), github });
    if (keep) {
      state.user = user;
      state.onboarded = false;
    }
    onboardStep = 0;
    closeModal();
    save();
    toast(keep ? "Reset — your profile is prefilled" : "Everything erased");
    render();
  };
}

function openComment(p, promptIndex) {
  const prompt = p.prompts[promptIndex];
  const modal = $("modal");
  modal.classList.remove("hidden");
  modal.innerHTML = `<div class="sheet">
    <p class="q muted">${esc(prompt.q)}</p>
    <h3>${esc(prompt.a)}</h3>
    <p class="muted">Like ${esc(p.name)} and say why.</p>
    <textarea id="comment-text" maxlength="140" placeholder="Write a comment…"></textarea>
    <div class="row">
      <button class="btn-ghost" id="cancel-m">Cancel</button>
      <button class="btn-primary" id="send-like">Send like</button>
    </div>
  </div>`;
  $("cancel-m").onclick = closeModal;
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };
  $("send-like").onclick = () => {
    const note = $("comment-text").value.trim();
    closeModal();
    likePerson(p.id, note || `Liked your prompt: “${prompt.a}”`);
  };
}

function openPreview(p, opts = {}) {
  if (!p) return;
  const action = opts.rose ? "Send a rose" : opts.match ? "Match" : "Like";
  const modal = $("modal");
  modal.classList.remove("hidden");
  modal.innerHTML = `<div class="sheet sheet-full">
    <div class="sheet-bar">
      <button class="btn-ghost" id="cancel-m" aria-label="Close">←</button>
      <strong>${esc(p.name)}, ${p.age}</strong>
    </div>
    <div class="sheet-scroll">
      ${p.likeNote ? `<div class="like-note"><span class="muted">Liked you</span><p>“${esc(p.likeNote)}”</p></div>` : ""}
      ${profileArticleHtml(p)}
    </div>
    ${
      opts.view
        ? `<div class="sheet-foot one"><button class="btn-ghost" id="pass">Close</button></div>`
        : `<div class="sheet-foot">
      <button class="btn-ghost" id="pass">Pass</button>
      <button class="btn-primary" id="do">${action}</button>
    </div>`
    }
  </div>`;
  $("cancel-m").onclick = closeModal;
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };
  modal.querySelectorAll("[data-comment]").forEach((btn) => {
    btn.onclick = () => openComment(p, Number(btn.dataset.comment));
  });
  $("pass").onclick = () => {
    closeModal();
    if (!opts.view) skip(p.id);
  };
  if (opts.view) return;
  $("do").onclick = () => {
    closeModal();
    if (opts.rose) sendRose(p.id);
    else if (opts.match) matchNow(p.id, "You matched!");
    else likePerson(p.id, null);
  };
}

function openChatMenu(p) {
  const modal = $("modal");
  modal.classList.remove("hidden");
  modal.innerHTML = `<div class="sheet">
    <h3>${esc(p.name)}</h3>
    <div class="menu-list">
      <button class="menu-item" id="m-profile">View full profile</button>
      <button class="menu-item" id="m-admin">Admin — customize this person</button>
      <button class="menu-item" id="m-clear">Clear this conversation</button>
      <button class="menu-item danger" id="m-unmatch">Unmatch</button>
    </div>
    <div class="row"><button class="btn-ghost" id="cancel-m">Close</button></div>
  </div>`;
  $("cancel-m").onclick = closeModal;
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };
  $("m-profile").onclick = () => {
    closeModal();
    openPreview(p, { view: true });
  };
  $("m-admin").onclick = () => openPersonAdmin(p);
  $("m-clear").onclick = () => {
    delete state.threads[p.id];
    delete state.pendingBots[p.id];
    save();
    closeModal();
    toast("Conversation cleared");
    render();
  };
  $("m-unmatch").onclick = () => {
    closeModal();
    unmatch(p);
  };
}

function unmatch(p) {
  state.matches = state.matches.filter((x) => x !== p.id);
  delete state.threads[p.id];
  delete state.unread[p.id];
  delete state.pendingBots[p.id];
  if (!state.unmatched.includes(p.id)) state.unmatched.push(p.id);
  save();
  toast(`Unmatched ${p.name}`);
  setView("messages");
}

const TONES = ["playful", "dry", "warm", "thoughtful", "direct", "witty", "soft", "quiet", "grounded", "easy"];

/* Everything here writes into state.tweaks[id], which applyTweaks() layers over the
   original profile — so edits show up in Discover, Likes and the reply planner alike. */
function openPersonAdmin(p) {
  const t = { ...(state.tweaks[p.id] || {}) };
  const style = { ...(t.style || {}) };
  const modal = $("modal");
  modal.classList.remove("hidden");
  modal.innerHTML = `<div class="sheet sheet-full">
    <div class="sheet-bar">
      <button class="btn-ghost" id="cancel-m" aria-label="Close">←</button>
      <strong>Admin · ${esc(p.name)}</strong>
    </div>
    <div class="sheet-scroll admin-form">
      <p class="muted">Overrides for this person only. Blank means "use the original."</p>
      <label>Name<input id="a-name" value="${esc(t.name ?? "")}" placeholder="${esc(p.name)}" /></label>
      <div class="two">
        <label>Age<input id="a-age" type="number" min="18" max="99" value="${esc(t.age ?? "")}" placeholder="${p.age}" /></label>
        <label>City<input id="a-city" value="${esc(t.city ?? "")}" placeholder="${esc(p.city)}" /></label>
      </div>
      <label>Job<input id="a-job" value="${esc(t.job ?? "")}" placeholder="${esc(p.job)}" /></label>
      <div class="two">
        <label>Gender<select id="a-gender">${["", "women", "men", "nonbinary"]
          .map((g) => `<option value="${g}" ${t.gender === g ? "selected" : ""}>${g ? genderLabel(g) : "Original"}</option>`)
          .join("")}</select></label>
        <label>Sexuality<select id="a-orientation">${["", ...ORIENTATIONS.map(([v]) => v)]
          .map((o) => `<option value="${o}" ${t.orientation === o ? "selected" : ""}>${o ? orientationLabel(o) : "Original"}</option>`)
          .join("")}</select></label>
      </div>
      <label>Looking for<input id="a-intention" value="${esc(t.intention ?? "")}" placeholder="${esc(p.intention)}" /></label>

      <h4>Personality</h4>
      <label>Chat tone<select id="a-tone">${["", ...TONES]
        .map((x) => `<option value="${x}" ${style.tone === x ? "selected" : ""}>${x ? x[0].toUpperCase() + x.slice(1) : "Original"}</option>`)
        .join("")}</select></label>
      <label>Flirtiness <span class="muted">${Math.round((style.flirt ?? 0.5) * 100)}%</span>
        <input id="a-flirt" type="range" min="0" max="100" value="${Math.round((style.flirt ?? 0.5) * 100)}" /></label>
      <label>Emoji <span class="muted">${Math.round((style.emojiRate ?? 0.15) * 100)}%</span>
        <input id="a-emoji" type="range" min="0" max="100" value="${Math.round((style.emojiRate ?? 0.15) * 100)}" /></label>
      <label>Exclamation marks <span class="muted">${Math.round((style.bang ?? 0.25) * 100)}%</span>
        <input id="a-bang" type="range" min="0" max="100" value="${Math.round((style.bang ?? 0.25) * 100)}" /></label>
      <label class="check"><input id="a-lower" type="checkbox" ${style.lower ? "checked" : ""} /> types in lowercase</label>
      <label class="check"><input id="a-clip" type="checkbox" ${style.clip ? "checked" : ""} /> keeps replies short</label>
      <label>Reply speed<select id="a-pace">${[
        ["", "Original"],
        ["fast", "Fast — replies immediately"],
        ["normal", "Normal"],
        ["slow", "Slow — makes you wait"]
      ]
        .map(([v, l]) => `<option value="${v}" ${style.pace === v ? "selected" : ""}>${l}</option>`)
        .join("")}</select></label>

      <h4>Prompts</h4>
      ${p.prompts
        .map(
          (q, i) => `<label>${esc(q.q)}<textarea id="a-prompt-${i}" rows="2" placeholder="${esc(q.a)}">${esc(
            (t.prompts && t.prompts[i]) || ""
          )}</textarea></label>`
        )
        .join("")}
    </div>
    <div class="sheet-foot three">
      <button class="btn-ghost" id="a-reset">Reset</button>
      <button class="btn-ghost" id="a-cancel">Cancel</button>
      <button class="btn-primary" id="a-save">Save</button>
    </div>
  </div>`;
  const close = () => closeModal();
  $("cancel-m").onclick = close;
  $("a-cancel").onclick = close;
  modal.querySelectorAll('input[type="range"]').forEach((r) => {
    r.oninput = () => {
      const out = r.parentElement.querySelector(".muted");
      if (out) out.textContent = `${r.value}%`;
    };
  });
  $("a-reset").onclick = () => {
    delete state.tweaks[p.id];
    save();
    closeModal();
    toast(`${p.name} reset to original`);
    render();
  };
  $("a-save").onclick = () => {
    const val = (id) => $(id).value.trim();
    const next = {
      name: val("a-name"),
      age: val("a-age"),
      city: val("a-city"),
      job: val("a-job"),
      gender: val("a-gender"),
      orientation: val("a-orientation"),
      intention: val("a-intention"),
      prompts: p.prompts.map((_, i) => val(`a-prompt-${i}`)),
      style: {
        tone: val("a-tone"),
        flirt: Number($("a-flirt").value) / 100,
        emojiRate: Number($("a-emoji").value) / 100,
        bang: Number($("a-bang").value) / 100,
        lower: $("a-lower").checked,
        clip: $("a-clip").checked,
        pace: val("a-pace")
      }
    };
    if (!next.prompts.some(Boolean)) delete next.prompts;
    state.tweaks[p.id] = next;
    save();
    closeModal();
    toast(`${next.name || p.name} updated`);
    render();
  };
}

function closeModal() {
  $("modal").classList.add("hidden");
  $("modal").innerHTML = "";
}

function skip(id) {
  if (!state.skipped.includes(id)) state.skipped.push(id);
  save();
  render();
}

function likePerson(id, note) {
  const p = profileById(id);
  if (!state.liked.includes(id)) state.liked.push(id);
  const willMatch = p.likesYou || Math.random() < 0.45 || Boolean(note);
  save();
  if (willMatch) matchNow(id, note ? "They liked your comment" : "It's a match", note);
  else {
    toast(`Liked ${p.name}`);
    render();
  }
}

function sendRose(id) {
  if (state.roses <= 0) {
    toast("No roses left this week");
    return;
  }
  state.roses -= 1;
  if (!state.liked.includes(id)) state.liked.push(id);
  save();
  matchNow(id, "Rose received — they matched");
}

function matchNow(id, headline, userNote) {
  if (!state.matches.includes(id)) state.matches.unshift(id);
  state.liked = state.liked.filter((x) => x !== id);
  const p = profileById(id);
  if (!state.threads[id]) {
    if (userNote) state.threads[id] = [{ from: "me", text: userNote, ts: Date.now() }];
    else {
      const opener = p.likesYou && p.likeNote ? p.likeNote : latchPick(p.voice.greet);
      state.threads[id] = [{ from: "them", text: opener, ts: Date.now() }];
    }
  }
  state.unread[id] = true;
  save();
  toast(headline);
  setView("chat", { chatId: id });
  if (userNote) queueBotReply(id, userNote);
}

function sendUserMessage(id, text) {
  if (!state.threads[id]) state.threads[id] = [];
  state.threads[id].push({ from: "me", text, ts: Date.now() });
  save();
  render();
  queueBotReply(id, text);
}

function queueBotReply(id, userText) {
  const p = profileById(id);
  const thread = state.threads[id] || [];
  const { lines } = latchConverse(p, userText, thread, state.user);
  const queue = (lines || []).filter(Boolean).slice(0, 3);
  if (!queue.length) return;
  const pace = { fast: 0.35, normal: 1, slow: 2.2 }[(p.style && p.style.pace) || "normal"] || 1;
  const sendNext = (i) => {
    state.pendingBots[id] = true;
    save({ skipRemote: true });
    render();
    const typing = Math.min(4200, queue[i].length * 28);
    const delay = ((i === 0 ? 800 : 400) + typing + Math.random() * 700) * pace;
    setTimeout(() => {
      if (!state.threads[id]) state.threads[id] = [];
      state.threads[id].push({ from: "them", text: queue[i], ts: Date.now() });
      state.pendingBots[id] = false;
      if (state.view !== "chat" || state.chatId !== id) state.unread[id] = true;
      save();
      render();
      if (i + 1 < queue.length) sendNext(i + 1);
    }, delay);
  };
  sendNext(0);
}

const ONBOARD_STEPS = 10;

function wizardProgress(step) {
  return `<div class="wiz-progress" aria-hidden="true">${Array.from({ length: ONBOARD_STEPS }, (_, i) => `<i class="${i <= step ? "on" : ""}"></i>`).join("")}</div>`;
}

function renderOnboard() {
  const el = $("onboard");
  if (state.onboarded && state.user.name) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  el.classList.remove("hidden");
  const u = state.user;
  const back = `<button type="button" class="btn-ghost" data-wiz="back">Back</button>`;
  const next = `<button type="button" class="btn-primary" data-wiz="next">Continue</button>`;
  let body = "";
  if (onboardStep === 0) {
    body = `<img src="favicon.svg" alt="" width="48" height="48" />
      <h2>Welcome to Latch</h2>
      <p>Set up your profile the way you would on a real dating app. Everyone else here is fictional.</p>
      <button type="button" class="btn-primary" data-wiz="next">Create your profile</button>`;
  } else if (onboardStep === 1) {
    body = `<h2>First name</h2><p>This is how you'll show up in chats.</p>
      <label class="stack">Name<input class="field" data-f="name" maxlength="24" value="${esc(u.name)}" placeholder="Alex" /></label>
      <div class="wiz-nav">${back}${next}</div>`;
  } else if (onboardStep === 2) {
    body = `<h2>Age</h2><p>You must be 18 or older.</p>
      <label class="stack">Age<input class="field" type="number" min="18" max="99" data-f="age" value="${esc(u.age)}" /></label>
      <div class="wiz-nav">${back}${next}</div>`;
  } else if (onboardStep === 3) {
    body = `<h2>I am</h2>
      <div class="choice-col">
        ${[
          ["women", "A woman"],
          ["men", "A man"],
          ["nonbinary", "Non-binary"]
        ]
          .map(
            ([v, l]) =>
              `<button type="button" class="choice ${u.gender === v ? "on" : ""}" data-set="gender" data-v="${v}">${l}</button>`
          )
          .join("")}
      </div>
      <div class="wiz-nav">${back}${next}</div>`;
  } else if (onboardStep === 4) {
    body = `<h2>Sexuality</h2><p>Used to filter people who would actually match with you.</p>
      <div class="choice-col">
        ${ORIENTATIONS.map(
          ([v, l]) =>
            `<button type="button" class="choice ${u.orientation === v ? "on" : ""}" data-set="orientation" data-v="${v}">${l}</button>`
        ).join("")}
      </div>
      <div class="wiz-nav">${back}${next}</div>`;
  } else if (onboardStep === 5) {
    body = `<h2>Show me</h2><p>Set from your sexuality — change it if that's not right.</p>
      <div class="choice-col">
        ${[
          ["everyone", "Everyone"],
          ["women", "Women"],
          ["men", "Men"]
        ]
          .map(
            ([v, l]) =>
              `<button type="button" class="choice ${u.seeking === v ? "on" : ""}" data-set="seeking" data-v="${v}">${l}</button>`
          )
          .join("")}
      </div>
      <div class="wiz-nav">${back}${next}</div>`;
  } else if (onboardStep === 6) {
    body = `<h2>Your photos</h2><p>Add at least one. Six slots, like a real profile — compressed for GitHub.</p>
      ${photoGridHtml("onboard")}
      <div class="wiz-nav">${back}${next}</div>`;
  } else if (onboardStep === 7) {
    body = `<h2>Prompts</h2><p>Answer at least one. This is what people comment on.</p>
      ${u.prompts
        .map(
          (pr, i) => `<div class="prompt-card">
            <select data-pq="${i}">${window.PROMPT_BANK.map((q) => `<option ${pr.q === q ? "selected" : ""}>${esc(q)}</option>`).join("")}</select>
            <textarea data-pa="${i}" placeholder="Your answer" style="margin-top:8px">${esc(pr.a)}</textarea>
          </div>`
        )
        .join("")}
      <div class="wiz-nav">${back}${next}</div>`;
  } else if (onboardStep === 8) {
    body = `<h2>The basics</h2>
      <label class="stack">City<input class="field" data-f="city" value="${esc(u.city)}" /></label>
      <label class="stack">Job title<input class="field" data-f="job" value="${esc(u.job)}" placeholder="Software engineer" /></label>
      <label class="stack">School<input class="field" data-f="school" value="${esc(u.school)}" /></label>
      <label class="stack">Height<input class="field" data-f="height" value="${esc(u.height)}" /></label>
      <label class="stack">Dating intention
        <select data-f="intention">
          ${["Looking for something serious", "Open to whatever", "Figuring it out"]
            .map((opt) => `<option ${u.intention === opt ? "selected" : ""}>${opt}</option>`)
            .join("")}
        </select>
      </label>
      <div class="wiz-nav">${back}${next}</div>`;
  } else {
    body = `<h2>Save your board</h2><p>Optional. Paste a GitHub token and hit Connect — that's it. Skip if you only want this phone/browser.</p>
      ${githubFieldsHtml()}
      <div class="wiz-nav">${back}<button type="button" class="btn-primary" data-wiz="done">Start discovering</button></div>`;
  }
  el.innerHTML = `<div class="onboard-card wide">${wizardProgress(onboardStep)}${body}</div>`;
  el.querySelectorAll("[data-f]").forEach((input) => {
    input.oninput = () => {
      state.user[input.dataset.f] = input.type === "number" ? Number(input.value) : input.value;
      save({ skipRemote: true });
    };
  });
  el.querySelectorAll("[data-set]").forEach((btn) => {
    btn.onclick = () => {
      state.user[btn.dataset.set] = btn.dataset.v;
      /* Seed "Show me" from the sexuality just picked, so the next step starts on the
         answer that matches instead of a combination that finds nobody. */
      if (btn.dataset.set === "orientation" || btn.dataset.set === "gender") {
        state.user.seeking = seekingFor(state.user);
      }
      save({ skipRemote: true });
      renderOnboard();
    };
  });
  el.querySelectorAll("[data-pq]").forEach((sel) => {
    sel.onchange = () => {
      state.user.prompts[Number(sel.dataset.pq)].q = sel.value;
      save({ skipRemote: true });
    };
  });
  el.querySelectorAll("[data-pa]").forEach((ta) => {
    ta.oninput = () => {
      state.user.prompts[Number(ta.dataset.pa)].a = ta.value;
      save({ skipRemote: true });
    };
  });
  bindPhotoInputs(el, renderOnboard);
  bindGithub(el);
  el.querySelector("[data-wiz='back']")?.addEventListener("click", () => {
    onboardStep = Math.max(0, onboardStep - 1);
    renderOnboard();
  });
  el.querySelector("[data-wiz='next']")?.addEventListener("click", () => {
    const err = validateStep(onboardStep);
    if (err) {
      toast(err);
      return;
    }
    onboardStep += 1;
    renderOnboard();
  });
  el.querySelector("[data-wiz='done']")?.addEventListener("click", finishOnboard);
}

function validateStep(step) {
  const u = state.user;
  if (step === 1 && !u.name.trim()) return "Add your first name";
  if (step === 2 && (!u.age || u.age < 18)) return "Age must be 18+";
  if (step === 4 && !u.orientation) return "Pick your sexuality";
  if (step === 6 && !userPhotos().length) return "Add at least one photo";
  if (step === 7 && !u.prompts.some((p) => p.a.trim())) return "Answer at least one prompt";
  return "";
}

function finishOnboard() {
  if (!state.user.name.trim()) {
    toast("Add your first name");
    onboardStep = 1;
    renderOnboard();
    return;
  }
  if (!state.user.orientation) {
    toast("Pick your sexuality");
    onboardStep = 4;
    renderOnboard();
    return;
  }
  if (!userPhotos().length) {
    toast("Add at least one photo");
    onboardStep = 6;
    renderOnboard();
    return;
  }
  state.onboarded = true;
  save();
  $("onboard").classList.add("hidden");
  render();
  syncToGithub();
}

function render() {
  bindNav();
  titles();
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  const viewId = state.view === "chat" ? "view-messages" : `view-${state.view}`;
  const pane = $(viewId) || $("view-discover");
  pane.classList.remove("hidden");
  if (state.view === "discover") renderDiscover();
  else if (state.view === "standouts") renderStandouts();
  else if (state.view === "likes") renderLikes();
  else if (state.view === "messages" || state.view === "chat") renderMessages();
  else if (state.view === "profile") renderProfile();
}

renderOnboard();
if (state.onboarded) {
  render();
  loadFromGithub();
}
window.addEventListener("resize", () => {
  if (state.view === "messages" || state.view === "chat") render();
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("modal").classList.contains("hidden")) closeModal();
});
