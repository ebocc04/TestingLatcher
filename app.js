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
    customProfiles: [],
    unmatched: [],
    github: { ...defaultGithub(), photoShas: {} },
    brainJob: null,
    brainReply: null,
    updatedAt: 0
  };
}

function migrate(raw) {
  const s = { ...emptyState(), ...raw };
  s.user = { ...defaultUser(), ...(raw.user || {}) };
  while (s.user.photos.length < 6) s.user.photos.push("");
  s.user.photos = s.user.photos.slice(0, 6);
  s.github = { ...defaultGithub(), ...(raw.github || {}) };
  if (!s.github.owner || !s.github.repo) s.github = { ...latchStorage.inferTarget(), sha: s.github.sha || null, photoShas: s.github.photoShas || {} };
  s.github.photoShas = s.github.photoShas || {};
  s.pendingBots = {};
  s.tweaks = raw.tweaks || {};
  s.customProfiles = Array.isArray(raw.customProfiles) ? raw.customProfiles : [];
  s.unmatched = raw.unmatched || [];
  s.brainJob = raw.brainJob || null;
  s.brainReply = raw.brainReply || null;
  if (!s.user.photos.some(Boolean) || !s.user.name) s.onboarded = false;
  return s;
}

let state = emptyState();
let onboardStep = 0;
let saveTimer = null;
let ghBusy = false;
let llmProgress = "";
if (window.latchLLM) {
  latchLLM.setConfig({
    provider: "local",
    model: latchLLM.pickLocalModel(),
    enabled: true
  });
}
const $ = (id) => document.getElementById(id);

function boardPayload() {
  const { pendingBots, github, ...rest } = state;
  return {
    ...rest,
    pendingBots: {},
    github: {
      owner: github.owner,
      repo: github.repo,
      branch: github.branch,
      path: github.path,
      photoShas: github.photoShas || {}
    },
    updatedAt: Date.now()
  };
}

function save(opts = {}) {
  state.updatedAt = Date.now();
  latchStorage.writeLocal(state);
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

async function syncToGithubNow() {
  const g = state.github;
  if (!latchStorage.getToken() || !g.owner || !g.repo) return null;
  ghBusy = true;
  setGhStatus("Saving…");
  try {
    await latchStorage.offloadPhotos(state, g);
    const sha = await latchStorage.pushBoard(g, boardPayload(), g.sha);
    if (sha) state.github.sha = sha;
    latchStorage.writeLocal(state);
    setGhStatus("Board sync on");
    return sha;
  } catch (err) {
    setGhStatus(err.message);
    throw err;
  } finally {
    ghBusy = false;
  }
}

function syncToGithub() {
  const run = () => syncToGithubNow();
  syncToGithub.chain = (syncToGithub.chain || Promise.resolve()).then(run, run);
  return syncToGithub.chain;
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
    const remoteNewer = remote.data && (remote.data.updatedAt || 0) >= (state.updatedAt || 0);
    const remoteHasFiles =
      remote.data && latchStorage.countFilePhotos(remote.data) > latchStorage.countFilePhotos(state);
    if (remote.data && (remoteNewer || remoteHasFiles)) {
      const keepGh = { ...state.github, sha: remote.sha };
      state = migrate(remote.data);
      state.github = { ...keepGh, photoShas: { ...(remote.data.github && remote.data.github.photoShas), ...keepGh.photoShas } };
      await latchStorage.hydratePhotos(state);
      await latchStorage.parkInlinePhotos(state);
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function canUseBrain() {
  return Boolean(latchStorage.getToken() && state.github && state.github.owner && latchLLM.deviceRole() === "phone");
}

async function pushBrainPatch(reply) {
  const g = state.github;
  const remote = await latchStorage.pullBoard(g);
  if (!remote || remote.missing || !remote.data) return;
  const payload = { ...remote.data, pendingBots: {}, brainReply: reply, updatedAt: Date.now() };
  const sha = await latchStorage.pushBoard(g, payload, remote.sha);
  if (sha) state.github.sha = sha;
}

async function askDesktopBrain(p, thread) {
  const jobId = `b-${Date.now().toString(36)}`;
  state.brainJob = {
    id: jobId,
    chatId: p.id,
    profileId: p.id,
    thread: (thread || []).filter((m) => m && m.text).map((m) => ({ from: m.from, text: m.text })),
    user: {
      name: state.user.name,
      age: state.user.age,
      gender: state.user.gender,
      orientation: state.user.orientation
    },
    askedAt: Date.now()
  };
  state.brainReply = null;
  save({ skipRemote: true });
  llmProgress = "Sending to Hermes host…";
  render();
  await syncToGithub();
  const posted = await latchStorage.pullBoard(state.github);
  if (!posted || !posted.data || !posted.data.brainJob || posted.data.brainJob.id !== jobId) {
    throw new Error("Board sync didn't send the chat. Check the token on both devices.");
  }
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    await sleep(1500);
    const remote = await latchStorage.pullBoard(state.github);
    if (!remote || !remote.data) continue;
    if (remote.sha) state.github.sha = remote.sha;
    const reply = remote.data.brainReply;
    if (!reply || reply.id !== jobId) {
      llmProgress = "Waiting for Hermes host… leave Latch open on the computer.";
      render();
      continue;
    }
    if (reply.status === "loading") {
      llmProgress = reply.text || "Hermes host is writing…";
      render();
      continue;
    }
    if (reply.lines && reply.lines.length) {
      state.brainJob = null;
      state.brainReply = null;
      save({ skipRemote: true });
      return reply.lines;
    }
    if (reply.error) throw new Error(reply.error);
  }
  return null;
}

let brainWorking = false;

function jobPerson(job, remoteData) {
  return (
    profileById(job.profileId) ||
    ((remoteData && remoteData.customProfiles) || []).find((x) => x.id === job.profileId) ||
    (window.LATCH_PROFILES || []).find((x) => x.id === job.profileId) ||
    null
  );
}

async function processBrainJob() {
  if (brainWorking || latchLLM.deviceRole() !== "host" || !latchStorage.getToken()) return;
  if (!window.latchLLM || !latchLLM.active() || latchLLM.config().provider !== "local") {
    setLlmStatus("Hermes host is off. Tap Start Hermes host.");
    return;
  }
  const remote = await latchStorage.pullBoard(state.github);
  if (!remote || !remote.data || !remote.data.brainJob || !remote.data.brainJob.id) {
    setLlmStatus("Hermes host is watching for Phone link…");
    return;
  }
  const job = remote.data.brainJob;
  const done = remote.data.brainReply;
  if (done && done.id === job.id && (done.lines || done.error)) return;
  brainWorking = true;
  try {
    if (remote.sha) state.github.sha = remote.sha;
    setLlmStatus(`Hermes host got a chat from Phone link…`);
    await pushBrainPatch({ id: job.id, status: "loading", text: "Hermes host is writing…" });
    const p = jobPerson(job, remote.data);
    if (!p) {
      await pushBrainPatch({ id: job.id, error: "That person isn't on Hermes host. Open the same board on the computer." });
      return;
    }
    const lines = await latchLLM.reply(p, job.thread, job.user || state.user);
    await pushBrainPatch({ id: job.id, lines, at: Date.now() });
    setLlmStatus("Hermes host answered Phone link");
    setGhStatus("Hermes host answered Phone link");
  } catch (err) {
    try {
      await pushBrainPatch({ id: job.id, error: err.message || "Hermes failed" });
    } catch (_) {}
    setLlmStatus(err.message || "Hermes host failed");
  } finally {
    brainWorking = false;
  }
}

function startBrainLoop() {
  if (!startBrainLoop.t) {
    startBrainLoop.t = setInterval(() => {
      if (!state.onboarded || !latchStorage.getToken() || latchLLM.deviceRole() !== "host") return;
      processBrainJob().catch(() => {});
    }, 1500);
  }
  if (state.onboarded && latchStorage.getToken() && latchLLM.deviceRole() === "host") {
    processBrainJob().catch(() => {});
  }
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
  if (t.style) out.style = { ...(p.style || {}), ...t.style };
  return out;
}

function roster() {
  return [...(state.customProfiles || []), ...window.LATCH_PROFILES];
}

function allProfiles() {
  return roster().map(applyTweaks);
}

function profileById(id) {
  const p = roster().find((x) => x.id === id);
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
  const nextId = extra?.chatId || (view === "chat" ? state.chatId : null);
  if (nextId !== renderChat._id) {
    renderChat._keepFocus = false;
    renderChat._id = null;
  }
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
  return latchStorage.resolvePhoto(p.photos[i] || p.photos[0], state.github);
}

function userPhotos() {
  return state.user.photos.filter(Boolean);
}

async function onPhotoFile(file, index, after) {
  if (!file) return;
  try {
    const data = await latchStorage.compressImage(file);
    state.user.photos[index] = await latchStorage.keepPhoto(data, `user-${index}`);
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
        ${state.user.photos[i] ? `<img src="${esc(latchStorage.resolvePhoto(state.user.photos[i], state.github))}" alt="" />` : ""}
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
          <img src="${esc(latchStorage.resolvePhoto(src, state.github))}" alt="${esc(p.name)}" />
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

function chatBubblesHtml(p, msgs) {
  return `${msgs
    .map((m) => {
      const via = m.from === "them" && m.via ? `<i class="via">${viaLabel(m.via)}</i>` : "";
      return `<div class="bubble ${m.from === "me" ? "me" : "them"}">${esc(m.text)}${via}</div>`;
    })
    .join("")}
        ${
          state.pendingBots[p.id]
            ? `<div class="typing">${esc(llmProgress || `${p.name} is typing…`)}</div>`
            : ""
        }`;
}

function focusComposer() {
  const input = document.querySelector("#composer input[name=text]");
  if (!input) return;
  input.focus();
  const n = input.value.length;
  try {
    input.setSelectionRange(n, n);
  } catch (_) {}
}

function renderChat(root) {
  const p = profileById(state.chatId);
  if (!p) {
    state.view = "messages";
    renderMessages();
    return;
  }
  const msgs = state.threads[p.id] || [];
  const engineName = chatEngineLabel();
  $("page-title").textContent = p.name;
  $("page-sub").textContent = `Active now · ${engineName}`;
  const reuse = renderChat._id === p.id && root.querySelector("#composer") && root.querySelector("#bubbles");
  if (reuse) {
    const pill = root.querySelector(".engine-pill");
    if (pill) {
      pill.textContent = engineName;
      pill.classList.toggle("on", engineName !== "built-in");
    }
    const box = $("bubbles");
    box.innerHTML = chatBubblesHtml(p, msgs);
    box.scrollTop = box.scrollHeight;
    if (renderChat._keepFocus) focusComposer();
    return;
  }
  renderChat._id = p.id;
  renderChat._keepFocus = false;
  root.innerHTML = `
    <div class="chat">
      <div class="chat-head">
        <button class="btn-ghost" id="back-msg">←</button>
        <img src="${esc(photoUrl(p, 0))}" alt="" />
        <div class="chat-who">
          <strong>${esc(p.name)}, ${p.age}</strong>
          <div class="muted" style="font-size:.8rem">${esc(orientationLabel(p.orientation))} · ${esc(p.job)}</div>
        </div>
        <span class="engine-pill ${engineName !== "built-in" ? "on" : ""}">${engineName}</span>
        <button class="btn-ghost menu-btn" id="chat-menu" aria-label="Chat options">☰</button>
      </div>
      <div class="bubbles" id="bubbles">
        ${chatBubblesHtml(p, msgs)}
      </div>
      <form class="composer" id="composer">
        <input name="text" maxlength="280" placeholder="Send a message" autocomplete="off" />
        <button type="submit">Send</button>
      </form>
    </div>`;
  $("back-msg").onclick = () => {
    renderChat._keepFocus = false;
    setView("messages");
  };
  $("chat-menu").onclick = () => openChatMenu(p);
  const form = $("composer");
  form.onsubmit = (e) => {
    e.preventDefault();
    const input = form.text;
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    renderChat._keepFocus = true;
    focusComposer();
    sendUserMessage(p.id, text);
  };
  const box = $("bubbles");
  box.scrollTop = box.scrollHeight;
}

function viaLabel(via) {
  if (via === "hermes") return "Hermes host";
  if (via === "rules") return "built-in";
  return via || "";
}

function chatEngineLabel() {
  if (!(window.latchLLM && latchLLM.active())) return "built-in";
  if (latchLLM.isTightDevice()) return canUseBrain() ? "Phone link" : "built-in";
  if (latchLLM.config().provider === "local") return "Hermes host";
  return { openrouter: "OpenRouter", groq: "Groq" }[latchLLM.config().provider] || "Model";
}

function githubFieldsHtml() {
  const g = state.github.owner ? state.github : latchStorage.inferTarget();
  state.github = { ...g, sha: state.github.sha || null };
  const token = latchStorage.getToken();
  const connected = Boolean(token && g.owner && g.repo);
  const phone = window.latchLLM && latchLLM.deviceRole() === "phone";
  return `<div class="prompt-card">
    <p class="q">Board sync</p>
    <p class="muted" style="margin:0 0 12px">Same token on <b>Hermes host</b> (computer) and <b>Phone link</b> (phone). Saves the board and photos to <b>${esc(g.owner)}/${esc(g.repo)}</b>.</p>
    <label class="stack">Token
      <input class="field" type="password" id="gh-token" value="${esc(token)}" placeholder="Paste token" autocomplete="off" />
    </label>
    <p class="muted" data-gh-status style="margin:8px 0 0">${connected ? `Board sync on — ${esc(g.owner)}/${esc(g.repo)}` : "Board sync off"}</p>
    <div class="row" style="justify-content:flex-start;margin-top:12px">
      <button type="button" class="btn-primary" id="gh-connect">${phone ? "Connect this phone" : "Connect this computer"}</button>
    </div>
  </div>`;
}

function roleFieldsHtml() {
  const role = latchLLM.deviceRole();
  return `<div class="prompt-card">
    <p class="q">This device</p>
    <p class="muted" style="margin:0 0 12px">Pick one. Computers are <b>Hermes host</b>. Phones are <b>Phone link</b>.</p>
    <div class="choice-col">
      <button type="button" class="choice ${role === "host" ? "on" : ""}" data-device-role="host">Hermes host — this computer runs the AI</button>
      <button type="button" class="choice ${role === "phone" ? "on" : ""}" data-device-role="phone">Phone link — this phone asks the computer</button>
    </div>
  </div>`;
}

function llmFieldsHtml() {
  const cfg = latchLLM.config();
  const key = latchLLM.getKey();
  const on = latchLLM.active();
  const spec = latchLLM.providers[cfg.provider];
  const models = llmFieldsHtml.models || spec.curated.concat(cfg.model).filter((v, i, a) => a.indexOf(v) === i);
  if (latchLLM.deviceRole() === "phone") {
    return `<div class="prompt-card">
      <p class="q">Phone link</p>
      <p class="muted" style="margin:0 0 12px">This phone does not run the AI. It asks <b>Hermes host</b> on your computer. Connect <b>Board sync</b> above, then leave Latch open on the PC.</p>
      <label class="check"><input type="checkbox" id="llm-off" ${on ? "" : "checked"} /> don't wait — use built-in replies</label>
      <p class="muted" data-llm-status style="margin:8px 0 0">${
        !on
          ? "Phone link off — built-in replies"
          : canUseBrain()
            ? "Phone link on — waiting for Hermes host"
            : "Phone link needs Board sync first"
      }</p>
    </div>`;
  }
  return `<div class="prompt-card">
    <p class="q">Hermes host</p>
    <p class="muted" style="margin:0 0 12px">This computer runs the AI. Keep this tab open so <b>Phone link</b> can use it. Chrome or Edge.</p>
    <label class="stack">Provider
      <select class="field" id="llm-provider">
        <option value="local" ${cfg.provider === "local" ? "selected" : ""}>Hermes on this computer — free, no key</option>
        <option value="openrouter" ${cfg.provider === "openrouter" ? "selected" : ""}>OpenRouter free models — free account, no credits</option>
        <option value="groq" ${cfg.provider === "groq" ? "selected" : ""}>Groq — free, refuses flirty chat</option>
      </select>
    </label>
    ${
      cfg.provider === "local"
        ? ""
        : `<label class="stack" style="margin-top:10px">${esc(spec.label)} API key
      <input class="field" type="password" id="llm-key" value="${esc(key)}" placeholder="${esc(spec.keyHint)}" autocomplete="off" />
    </label>`
    }
    <label class="stack" style="margin-top:10px">Model
      <select class="field" id="llm-model">${models
        .map((m) => `<option value="${esc(m)}" ${m === cfg.model ? "selected" : ""}>${esc(m)}</option>`)
        .join("")}</select>
    </label>
    <label class="check" style="margin-top:10px"><input type="checkbox" id="llm-off" ${on ? "" : "checked"} /> stop hosting — use built-in replies</label>
    <p class="muted" data-llm-status style="margin:8px 0 0">${
      on ? `Hermes host on — ${esc(cfg.model)}` : "Hermes host off — built-in replies"
    }</p>
    <div class="row" style="justify-content:flex-start;margin-top:12px">
      <button type="button" class="btn-primary" id="llm-connect">Start Hermes host</button>
      <button type="button" class="btn-ghost" id="llm-test">Test a reply</button>
    </div>
  </div>`;
}

function setLlmStatus(msg) {
  const el = document.querySelector("[data-llm-status]");
  if (el) el.textContent = msg;
}

function bindLlm(root) {
  root.querySelectorAll("[data-device-role]").forEach((btn) => {
    btn.onclick = () => {
      latchLLM.setDeviceRole(btn.dataset.deviceRole);
      startBrainLoop();
      if (btn.dataset.deviceRole === "host" && latchLLM.active() && latchLLM.config().provider === "local") {
        latchLLM.ensureLocal().catch(() => {});
      }
      renderProfile();
    };
  });
  const keyEl = root.querySelector("#llm-key");
  const modelEl = root.querySelector("#llm-model");
  const provEl = root.querySelector("#llm-provider");
  root.querySelector("#llm-off")?.addEventListener("change", (e) => {
    latchLLM.setConfig({ enabled: !e.target.checked });
    setLlmStatus(
      latchLLM.active()
        ? latchLLM.isTightDevice()
          ? canUseBrain()
            ? "Phone link on — waiting for Hermes host"
            : "Phone link needs Board sync first"
          : `Hermes host on — ${latchLLM.config().model}`
        : latchLLM.isTightDevice()
          ? "Phone link off — built-in replies"
          : "Hermes host off — built-in replies"
    );
  });
  provEl?.addEventListener("change", () => {
    const spec = latchLLM.providers[provEl.value];
    latchLLM.setConfig({ provider: provEl.value, model: spec.defaultModel });
    llmFieldsHtml.models = spec.curated;
    renderProfile();
  });
  modelEl?.addEventListener("change", () => {
    latchLLM.setConfig({ model: modelEl.value });
    setLlmStatus(`Live — ${modelEl.value}`);
  });
  root.querySelector("#llm-connect")?.addEventListener("click", async () => {
    const provider = provEl ? provEl.value : latchLLM.config().provider;
    latchLLM.setConfig({ provider, enabled: true });
    if (provider !== "local") {
      if (!keyEl || !keyEl.value.trim()) {
        setLlmStatus("Paste a free API key, or switch to Hermes on this computer.");
        return;
      }
      latchLLM.setKey(keyEl.value);
    }
    setLlmStatus(provider === "local" ? "Starting Hermes host… first time is a couple GB." : "Checking key…");
    const stop = latchLLM.onProgress((text) => setLlmStatus(text || "Loading…"));
    try {
      if (provider === "local") {
        await latchLLM.ensureLocal();
        latchLLM.setConfig({ localReady: true, enabled: true });
        toast("Hermes host ready — leave this tab open");
        startBrainLoop();
      } else {
        const models = await latchLLM.listModels();
        llmFieldsHtml.models = models;
        const cfg = latchLLM.config();
        const fallback = latchLLM.DEFAULT_MODEL;
        const model = models.includes(cfg.model) ? cfg.model : models.includes(fallback) ? fallback : models[0];
        latchLLM.setConfig({ model, enabled: true });
        toast(`Chat model connected — ${model}`);
      }
      renderProfile();
    } catch (err) {
      setLlmStatus(err.message);
    } finally {
      stop();
    }
  });
  root.querySelector("#llm-test")?.addEventListener("click", async () => {
    const p = profileById(state.matches[0]) || visibleProfiles()[0];
    if (!p) {
      setLlmStatus("No people to test with.");
      return;
    }
    setLlmStatus("Asking…");
    try {
      const lines = await latchLLM.reply(p, [{ from: "them", text: "hey, what are you up to tonight?" }, { from: "me", text: "not much. what do you do for work?" }], state.user);
      setLlmStatus(lines ? `${p.name}: ${lines.join(" / ")}` : "Empty reply — try another model.");
    } catch (err) {
      setLlmStatus(err.message);
    }
  });
}

async function connectGithub() {
  const tok = document.getElementById("gh-token");
  const token = tok ? tok.value.trim() : "";
  setGhStatus("Connecting…");
  try {
    const result = await latchStorage.connect(token);
    state.github = {
      ...result.target,
      sha: result.board?.sha || null,
      photoShas: { ...(state.github.photoShas || {}), ...((result.target && result.target.photoShas) || {}) }
    };
    save({ skipRemote: true });
    if (result.board && !result.board.missing && result.board.data) {
      const keepGh = { ...state.github };
      if ((result.board.data.updatedAt || 0) >= (state.updatedAt || 0)) {
        state = migrate(result.board.data);
        state.github = { ...keepGh, photoShas: { ...((result.board.data.github || {}).photoShas || {}), ...keepGh.photoShas } };
        await latchStorage.hydratePhotos(state);
        await latchStorage.parkInlinePhotos(state);
        latchStorage.writeLocal(state);
      }
    }
    setGhStatus(`Connected as ${result.login} → ${state.github.owner}/${state.github.repo}`);
    toast("Connected");
    await syncToGithub();
    startBrainLoop();
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
      <p class="muted" style="margin:0;font-size:.85rem">Photos ride with <b>Board sync</b>. Add them here, then open <b>Phone link</b> on your phone.</p>
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
          ${["Looking for something serious", "Open to whatever", "Figuring it out", "Here for a good time"]
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
      ${roleFieldsHtml()}
      ${llmFieldsHtml()}
      <div class="admin-card">
        <h3>Admin</h3>
        <p class="muted">Manual controls. These act on this browser, then sync like everything else.</p>
        <button class="btn-primary" id="add-profile">Add a profile</button>
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
  bindLlm(root);
  $("add-profile").onclick = () => openAddProfile();
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
  $("do-reset").onclick = async () => {
    const user = keep ? { ...state.user, photos: [...(state.user.photos || [])] } : null;
    const github = { ...state.github };
    if (!keep) await latchStorage.clearBoard();
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

function parseInstagram(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(raw) && !/instagram\.com/i.test(raw)) {
    return { kind: "image", url: raw };
  }
  const href = /^https?:/i.test(raw)
    ? raw
    : raw.startsWith("@") || !raw.includes(".")
      ? `https://www.instagram.com/${raw.replace(/^@/, "")}/`
      : `https://${raw}`;
  let u;
  try {
    u = new URL(href);
  } catch (_) {
    return null;
  }
  if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return { kind: "image", url: href };
  const parts = u.pathname.split("/").filter(Boolean);
  const head = (parts[0] || "").toLowerCase();
  if (["p", "reel", "reels", "tv"].includes(head) && parts[1]) {
    return { kind: "post", handle: "", page: `https://www.instagram.com/p/${parts[1]}/` };
  }
  if (parts[0] && !["explore", "accounts", "stories"].includes(head)) {
    return { kind: "profile", handle: parts[0], page: `https://www.instagram.com/${parts[0]}/` };
  }
  return null;
}

function extractPhotoUrls(html) {
  const urls = [];
  const add = (u) => {
    if (!u) return;
    const clean = String(u).replace(/\\u0026/g, "&").replace(/\\+/g, "").replace(/&amp;/g, "&");
    if (/^https?:\/\//i.test(clean) && /\.(jpe?g|png|webp)/i.test(clean.split("?")[0]) && !urls.includes(clean)) {
      urls.push(clean);
    }
  };
  const og = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)/i) || html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (og) add(og[1]);
  [...html.matchAll(/"display_url"\s*:\s*"([^"]+)"/g)].forEach((m) => add(m[1].replace(/\\u0026/g, "&")));
  [...html.matchAll(/https?:\\?\/\\?\/[^\s"'\\]+scontent[^\s"'\\]+\.(?:jpe?g|webp)/gi)].forEach((m) =>
    add(m[0].replace(/\\\//g, "/"))
  );
  return urls.slice(0, 6);
}

function handleToName(handle) {
  const s = String(handle || "")
    .replace(/^@/, "")
    .replace(/_+$/g, "")
    .replace(/[._]+/g, " ")
    .trim();
  if (!s) return "";
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

async function avatarFromHandle(handle) {
  if (!handle) return "";
  const src = `https://unavatar.io/instagram/${encodeURIComponent(handle)}?fallback=false`;
  try {
    return await latchStorage.compressImageUrl(src);
  } catch (_) {
    return "";
  }
}

async function fetchPageText(url) {
  const proxies = [
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`
  ];
  let last = "";
  for (const wrap of proxies) {
    try {
      const res = await fetch(wrap(url));
      if (!res.ok) {
        last = `${res.status}`;
        continue;
      }
      const text = await res.text();
      if (text && text.length > 200) return text;
      last = "empty page";
    } catch (err) {
      last = err.message;
    }
  }
  const blocked = /403|401|429/.test(last);
  throw new Error(
    blocked
      ? "Instagram blocked the page (403). They don't let a website read a profile grid."
      : last || "Couldn't reach Instagram from the browser."
  );
}

async function pullViaDebugChrome(pageUrl) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 70000);
  try {
    const res = await fetch(`http://127.0.0.1:7843/grab?url=${encodeURIComponent(pageUrl)}`, { signal: ctrl.signal });
    const body = await res.text();
    if (!res.ok) throw new Error(body || `${res.status}`);
    const got = JSON.parse(body);
    if (got.login) throw new Error("Log into Instagram in the debug Chrome window, then hit Grab again.");
    if (got.photos && got.photos.length) return got.photos;
    throw new Error("Debug Chrome opened but found no photos.");
  } finally {
    clearTimeout(t);
  }
}

async function pullInstagramPhotos(input) {
  const parsed = parseInstagram(input);
  if (!parsed) throw new Error("Paste an Instagram profile, post, or a photo URL.");
  if (parsed.kind === "image") {
    const data = await latchStorage.compressImageUrl(parsed.url);
    return { handle: "", photos: [data] };
  }
  try {
    const chromePhotos = await pullViaDebugChrome(parsed.page);
    return { handle: parsed.handle || "", photos: chromePhotos };
  } catch (err) {
    if (/Log into Instagram/.test(err.message || "")) throw err;
  }
  const photos = [];
  const pic = await avatarFromHandle(parsed.handle);
  if (pic) photos.push(pic);
  try {
    const html = await fetchPageText(parsed.page);
    for (const src of extractPhotoUrls(html)) {
      if (photos.length >= 6) break;
      try {
        photos.push(await latchStorage.compressImageUrl(src));
      } catch (_) {}
    }
  } catch (err) {
    if (!photos.length) throw err;
    return { handle: parsed.handle || "", photos, note: err.message };
  }
  if (!photos.length) {
    throw new Error("Instagram blocked the grid. Upload shots or paste image URLs below.");
  }
  return { handle: parsed.handle || "", photos };
}

function customVoice(name, explicit) {
  if (explicit) {
    return {
      greet: [`hey. skip the small talk — what do you want.`, `hi. I already like your face.`],
      reply: [`yeah I'm into that.`, `keep going.`, `come say that in person.`],
      keywords: {}
    };
  }
  return {
    greet: [`Hey — just got here.`, `Hi. Your profile didn't feel like homework.`],
    reply: [`That's a good answer.`, `I like this.`, `Want to keep talking?`],
    keywords: {}
  };
}

function emptyCustom() {
  return {
    id: `c-${Date.now().toString(36)}`,
    custom: true,
    name: "",
    age: 26,
    gender: "women",
    orientation: "bisexual",
    city: state.user.city || "Austin",
    job: "",
    school: "",
    height: "",
    intention: "Open to whatever",
    standout: false,
    likesYou: true,
    likeNote: "",
    instagram: "",
    photos: ["", "", "", "", "", ""],
    prompts: [
      { q: "I go crazy for", a: "" },
      { q: "I'm looking for", a: "" },
      { q: "The way to win me over is", a: "" }
    ],
    style: { tone: "direct", flirt: 0.9, explicit: true, lower: true, clip: true, bang: 0.2, emojiRate: 0.1 }
  };
}

function addPhotoPreviewHtml(photos) {
  return `<div class="photo-row six">${[0, 1, 2, 3, 4, 5]
    .map(
      (i) => `<div class="photo-slot">
        ${photos[i] ? `<img src="${esc(latchStorage.resolvePhoto(photos[i], state.github))}" alt="" />` : ""}
        <label>${photos[i] ? "Change" : "Add"}<input type="file" accept="image/*" data-add-photo="${i}" /></label>
      </div>`
    )
    .join("")}</div>`;
}

function openAddProfile() {
  const draft = emptyCustom();
  const modal = $("modal");
  const paint = (status) => {
    modal.classList.remove("hidden");
    modal.innerHTML = `<div class="sheet sheet-full">
      <div class="sheet-bar">
        <button class="btn-ghost" id="cancel-m" aria-label="Close">←</button>
        <strong>Add a profile</strong>
      </div>
      <div class="sheet-scroll admin-form">
        <p class="muted">Grab reads the profile grid in debug Chrome — posts of people only, not your avatar or random page images. Keep <b>tools/ig-grab.ps1</b> running and stay logged into Instagram in that window.</p>
        <label>Instagram
          <input id="add-ig" value="${esc(draft.instagram)}" placeholder="https://instagram.com/name or a post link" />
        </label>
        <div class="row" style="justify-content:flex-start;margin:0">
          <button type="button" class="btn-primary" id="add-grab">Grab photos</button>
        </div>
        <p class="muted" id="add-status">${esc(status || "")}</p>
        <div id="add-photos">${addPhotoPreviewHtml(draft.photos)}</div>
        <label>Or paste photo URLs (one per line)
          <textarea id="add-urls" rows="3" placeholder="https://…"></textarea>
        </label>
        <label>Name<input id="add-name" value="${esc(draft.name)}" /></label>
        <div class="two">
          <label>Age<input id="add-age" type="number" min="18" max="99" value="${esc(draft.age)}" /></label>
          <label>City<input id="add-city" value="${esc(draft.city)}" /></label>
        </div>
        <label>Job<input id="add-job" value="${esc(draft.job)}" /></label>
        <div class="two">
          <label>Gender<select id="add-gender">${["women", "men", "nonbinary"]
            .map((g) => `<option value="${g}" ${draft.gender === g ? "selected" : ""}>${genderLabel(g)}</option>`)
            .join("")}</select></label>
          <label>Sexuality<select id="add-orientation">${ORIENTATIONS.map(
            ([v, l]) => `<option value="${v}" ${draft.orientation === v ? "selected" : ""}>${l}</option>`
          ).join("")}</select></label>
        </div>
        <label class="check"><input id="add-explicit" type="checkbox" ${draft.style.explicit ? "checked" : ""} /> goes along with explicit / sexual chat</label>
        ${draft.prompts
          .map((q, i) => `<label>${esc(q.q)}<textarea id="add-prompt-${i}" rows="2">${esc(q.a)}</textarea></label>`)
          .join("")}
      </div>
      <div class="sheet-foot">
        <button class="btn-ghost" id="cancel-add">Cancel</button>
        <button class="btn-primary" id="add-save">Add to the deck</button>
      </div>
    </div>`;
    const read = () => {
      draft.instagram = ($("add-ig") || {}).value || "";
      draft.name = ($("add-name") || {}).value || "";
      draft.age = Number(($("add-age") || {}).value || 26);
      draft.city = ($("add-city") || {}).value || draft.city;
      draft.job = ($("add-job") || {}).value || "";
      draft.gender = ($("add-gender") || {}).value || "women";
      draft.orientation = ($("add-orientation") || {}).value || "bisexual";
      draft.style.explicit = Boolean($("add-explicit") && $("add-explicit").checked);
      draft.style.flirt = draft.style.explicit ? 0.95 : 0.55;
      draft.prompts.forEach((q, i) => {
        q.a = ($(`add-prompt-${i}`) || {}).value || "";
      });
    };
    $("cancel-m").onclick = closeModal;
    $("cancel-add").onclick = closeModal;
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };
    modal.querySelectorAll("[data-add-photo]").forEach((el) => {
      el.onchange = async () => {
        if (!el.files[0]) return;
        try {
          draft.photos[Number(el.dataset.addPhoto)] = await latchStorage.keepPhoto(
            await latchStorage.compressImage(el.files[0], 560, 0.62),
            `${draft.id}-${el.dataset.addPhoto}`
          );
          read();
          paint("Photo added.");
        } catch (_) {
          toast("Couldn't read that photo");
        }
      };
    });
    $("add-grab").onclick = async () => {
      read();
      const parsed = parseInstagram(draft.instagram);
      if (parsed && parsed.handle && !draft.name) draft.name = handleToName(parsed.handle);
      const status = $("add-status");
      status.textContent = "Pulling photos…";
      try {
        const got = await pullInstagramPhotos(draft.instagram);
        for (let i = 0; i < got.photos.length; i += 1) {
          draft.photos[i] = await latchStorage.keepPhoto(got.photos[i], `${draft.id}-${i}`);
        }
        if (got.handle && !draft.name) draft.name = handleToName(got.handle);
        paint(
          got.note
            ? `${got.note} Got the profile photo — add the rest below.`
            : `Got ${got.photos.length} photo${got.photos.length === 1 ? "" : "s"}.`
        );
      } catch (err) {
        paint(err.message);
        toast(err.message);
      }
    };
    $("add-save").onclick = async () => {
      read();
      const extra = (($("add-urls") || {}).value || "")
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const src of extra) {
        const slot = draft.photos.findIndex((x) => !x);
        if (slot < 0) break;
        try {
          draft.photos[slot] = await latchStorage.keepPhoto(await latchStorage.compressImageUrl(src), `${draft.id}-${slot}`);
        } catch (_) {
          toast(`Couldn't load ${src.slice(0, 32)}…`);
        }
      }
      draft.photos = draft.photos.filter(Boolean).slice(0, 6);
      if (!draft.photos.length) {
        toast("Need at least one photo");
        return;
      }
      if (!draft.name.trim()) {
        toast("Give them a name");
        return;
      }
      draft.voice = customVoice(draft.name, draft.style.explicit);
      draft.likeNote = draft.style.explicit
        ? "already thinking about you. match me."
        : "Liked your profile.";
      state.customProfiles = [draft, ...(state.customProfiles || [])];
      closeModal();
      save();
      toast(`${draft.name} is in Discover`);
      setView("discover");
    };
  };
  paint("");
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

/* Prefill with the values chat actually uses (original + any saved tweak), and write
   on every change. The back arrow used to close without saving, which is why
   sexuality and flirtiness looked like they did nothing. */
function readPersonAdmin(base) {
  const val = (id) => ($(id)?.value || "").trim();
  const next = {
    name: val("a-name"),
    age: val("a-age"),
    city: val("a-city"),
    job: val("a-job"),
    gender: val("a-gender"),
    orientation: val("a-orientation"),
    intention: val("a-intention"),
    prompts: (base.prompts || []).map((_, i) => val(`a-prompt-${i}`)),
    style: {
      tone: val("a-tone"),
      flirt: Number(($("a-flirt") || {}).value || 50) / 100,
      emojiRate: Number(($("a-emoji") || {}).value || 15) / 100,
      bang: Number(($("a-bang") || {}).value || 25) / 100,
      lower: Boolean($("a-lower") && $("a-lower").checked),
      clip: Boolean($("a-clip") && $("a-clip").checked),
      explicit: Boolean($("a-explicit") && $("a-explicit").checked),
      pace: val("a-pace")
    }
  };
  if (!next.prompts.some(Boolean)) delete next.prompts;
  return next;
}

function persistPersonAdmin(base, opts = {}) {
  state.tweaks[base.id] = readPersonAdmin(base);
  save({ skipRemote: !opts.remote });
}

function openPersonAdmin(p) {
  const live = applyTweaks(roster().find((x) => x.id === p.id) || p);
  const style = live.style || {};
  const modal = $("modal");
  modal.classList.remove("hidden");
  modal.innerHTML = `<div class="sheet sheet-full">
    <div class="sheet-bar">
      <button class="btn-ghost" id="cancel-m" aria-label="Close">←</button>
      <strong>Admin · ${esc(live.name)}</strong>
    </div>
    <div class="sheet-scroll admin-form">
      <p class="muted">Changes save as you go and apply to the next message. After changing sexuality, old chat lines may still contradict — clear the conversation if they do.</p>
      <label>Name<input id="a-name" value="${esc(live.name)}" /></label>
      <div class="two">
        <label>Age<input id="a-age" type="number" min="18" max="99" value="${esc(live.age)}" /></label>
        <label>City<input id="a-city" value="${esc(live.city)}" /></label>
      </div>
      <label>Job<input id="a-job" value="${esc(live.job)}" /></label>
      <div class="two">
        <label>Gender<select id="a-gender">${["women", "men", "nonbinary"]
          .map((g) => `<option value="${g}" ${live.gender === g ? "selected" : ""}>${genderLabel(g)}</option>`)
          .join("")}</select></label>
        <label>Sexuality<select id="a-orientation">${ORIENTATIONS.map(
          ([v, l]) => `<option value="${v}" ${live.orientation === v ? "selected" : ""}>${l}</option>`
        ).join("")}</select></label>
      </div>
      <label>Looking for<input id="a-intention" value="${esc(live.intention)}" /></label>

      <h4>Personality</h4>
      <label>Chat tone<select id="a-tone">${TONES.map(
        (x) => `<option value="${x}" ${(style.tone || "playful") === x ? "selected" : ""}>${x[0].toUpperCase() + x.slice(1)}</option>`
      ).join("")}</select></label>
      <label>Flirtiness <span class="muted">${Math.round((style.flirt ?? 0.5) * 100)}%</span>
        <input id="a-flirt" type="range" min="0" max="100" value="${Math.round((style.flirt ?? 0.5) * 100)}" /></label>
      <label>Emoji <span class="muted">${Math.round((style.emojiRate ?? 0.15) * 100)}%</span>
        <input id="a-emoji" type="range" min="0" max="100" value="${Math.round((style.emojiRate ?? 0.15) * 100)}" /></label>
      <label>Exclamation marks <span class="muted">${Math.round((style.bang ?? 0.25) * 100)}%</span>
        <input id="a-bang" type="range" min="0" max="100" value="${Math.round((style.bang ?? 0.25) * 100)}" /></label>
      <label class="check"><input id="a-explicit" type="checkbox" ${style.explicit ? "checked" : ""} /> goes along with explicit / sexual chat</label>
      <label class="check"><input id="a-lower" type="checkbox" ${style.lower ? "checked" : ""} /> types in lowercase</label>
      <label class="check"><input id="a-clip" type="checkbox" ${style.clip ? "checked" : ""} /> keeps replies short</label>
      <label>Reply speed<select id="a-pace">${[
        ["fast", "Fast — replies immediately"],
        ["normal", "Normal"],
        ["slow", "Slow — makes you wait"]
      ]
        .map(([v, l]) => `<option value="${v}" ${(style.pace || "normal") === v ? "selected" : ""}>${l}</option>`)
        .join("")}</select></label>

      <h4>Prompts</h4>
      ${live.prompts
        .map((q, i) => `<label>${esc(q.q)}<textarea id="a-prompt-${i}" rows="2">${esc(q.a)}</textarea></label>`)
        .join("")}
    </div>
    <div class="sheet-foot">
      <button class="btn-ghost ${live.custom ? "danger" : ""}" id="a-reset">${live.custom ? "Delete this profile" : "Reset to original"}</button>
      <button class="btn-primary" id="a-done">Done</button>
    </div>
  </div>`;
  const finish = () => {
    persistPersonAdmin(p, { remote: true });
    closeModal();
    toast(`${(state.tweaks[p.id] && state.tweaks[p.id].name) || p.name} saved`);
    render();
  };
  $("cancel-m").onclick = finish;
  $("a-done").onclick = finish;
  const dirty = () => persistPersonAdmin(p);
  modal.querySelectorAll("input, select, textarea").forEach((el) => {
    el.addEventListener("input", dirty);
    el.addEventListener("change", dirty);
  });
  modal.querySelectorAll('input[type="range"]').forEach((r) => {
    r.addEventListener("input", () => {
      const out = r.parentElement.querySelector(".muted");
      if (out) out.textContent = `${r.value}%`;
    });
  });
  $("a-reset").onclick = () => {
    if (live.custom) {
      state.customProfiles = (state.customProfiles || []).filter((x) => x.id !== p.id);
      delete state.tweaks[p.id];
      state.matches = state.matches.filter((x) => x !== p.id);
      state.liked = state.liked.filter((x) => x !== p.id);
      delete state.threads[p.id];
      closeModal();
      save();
      toast(`${p.name} removed`);
      setView("discover");
      return;
    }
    delete state.tweaks[p.id];
    save();
    closeModal();
    toast(`${p.name} reset to original`);
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
  if (!state.liked.includes(id)) state.liked.push(id);
  save();
  matchNow(id, note ? "They liked your comment" : "It's a match", note);
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
  save({ skipRemote: canUseBrain() });
  render();
  queueBotReply(id, text);
}

async function queueBotReply(id, userText) {
  const p = profileById(id);
  const thread = state.threads[id] || [];

  state.pendingBots[id] = true;
  render();
  let lines = null;
  let via = "rules";
  if (canUseBrain()) {
    llmProgress = "Waiting for Hermes host…";
    render();
    try {
      lines = await askDesktopBrain(p, thread);
      if (lines && lines.length) via = "hermes";
    } catch (err) {
      toast(err.message);
    }
    llmProgress = "";
    if (!lines) {
      toast("Hermes host didn't answer — using built-in replies. Leave Latch open on the computer.");
      lines = latchConverse(p, userText, thread, state.user).lines;
      via = "rules";
    }
  } else {
    const useModel = window.latchLLM && latchLLM.active() && !latchLLM.isTightDevice();
    const stopProgress = useModel
      ? latchLLM.onProgress((text) => {
          llmProgress = text || "Downloading the free on-device model…";
          render();
        })
      : () => {};
    if (useModel) {
      llmProgress = "Loading Hermes on this device…";
      render();
      try {
        lines = await latchLLM.reply(p, thread, state.user);
        if (lines && lines.length) {
          via = latchLLM.config().provider || "llm";
          if (via === "local") latchLLM.setConfig({ localReady: true });
        }
      } catch (err) {
        lines = null;
        toast(err.message);
      } finally {
        llmProgress = "";
        stopProgress();
      }
    }
    if (!lines && !(useModel && latchLLM.config().provider === "local")) {
      lines = latchConverse(p, userText, thread, state.user).lines;
      via = "rules";
    }
  }
  if (!lines) {
    state.pendingBots[id] = false;
    render();
    return;
  }

  const queue = (lines || []).filter(Boolean).slice(0, 3);
  if (!queue.length) {
    state.pendingBots[id] = false;
    render();
    return;
  }
  const pace = { fast: 0.35, normal: 1, slow: 2.2 }[(p.style && p.style.pace) || "normal"] || 1;
  const sendNext = (i) => {
    state.pendingBots[id] = true;
    save({ skipRemote: true });
    render();
    const typing = Math.min(4200, queue[i].length * 28);
    const delay = ((i === 0 ? 800 : 400) + typing + Math.random() * 700) * pace;
    setTimeout(() => {
      if (!state.threads[id]) state.threads[id] = [];
      state.threads[id].push({ from: "them", text: queue[i], ts: Date.now(), via });
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
          ${["Looking for something serious", "Open to whatever", "Figuring it out", "Here for a good time"]
            .map((opt) => `<option ${u.intention === opt ? "selected" : ""}>${opt}</option>`)
            .join("")}
        </select>
      </label>
      <div class="wiz-nav">${back}${next}</div>`;
  } else {
    body = `<h2>Board sync</h2><p>Optional. Same token on the computer (<b>Hermes host</b>) and the phone (<b>Phone link</b>). Skip if you only want this device.</p>
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

(async () => {
  try {
    const raw = await latchStorage.loadState();
    state = migrate(raw || emptyState());
    await latchStorage.hydratePhotos(state);
    await latchStorage.parkInlinePhotos(state);
    latchStorage.writeLocal(state);
    renderOnboard();
    if (state.onboarded) {
      render();
      loadFromGithub();
      startBrainLoop();
      if (window.latchLLM && latchLLM.active() && !latchLLM.isTightDevice() && latchLLM.config().provider === "local") {
        latchLLM.ensureLocal().catch(() => {});
      }
    }
  } catch (err) {
    console.error(err);
    try {
      render();
    } catch (_) {}
    toast(err.message || "Reload the page — the last update broke the script.");
  }
})();
window.addEventListener("resize", () => {
  if (state.view === "messages" || state.view === "chat") render();
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("modal").classList.contains("hidden")) closeModal();
});
