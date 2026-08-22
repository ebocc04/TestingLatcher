(function (global) {
  const STATE_KEY = "latch-state-v2";
  const LEGACY_KEY = "latch-state-v1";
  const TOKEN_KEY = "latch-gh-token";

  function toB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach((b) => {
      bin += String.fromCharCode(b);
    });
    return btoa(bin);
  }

  function fromB64(b64) {
    const bin = atob(String(b64).replace(/\s/g, ""));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function compressImage(file, max = 720, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, max / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read that image"));
      };
      img.src = url;
    });
  }

  async function compressImageUrl(src, max = 560, quality = 0.62) {
    const blob = await fetchImageBlob(src);
    const file = new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" });
    return compressImage(file, max, quality);
  }

  async function fetchImageBlob(src) {
    const tryFetch = async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      return res.blob();
    };
    try {
      return await tryFetch(src);
    } catch (_) {
      return tryFetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(src)}`);
    }
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token.trim());
    else localStorage.removeItem(TOKEN_KEY);
  }

  function ghHeaders(token) {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  function inferTarget() {
    const fallback = {
      owner: "ebocc04",
      repo: "TestingLatcher",
      branch: "main",
      path: "data/board.json",
      sha: null,
      photoShas: {}
    };
    try {
      const host = (location.hostname || "").toLowerCase();
      if (!host.endsWith(".github.io")) return fallback;
      const owner = host.split(".")[0];
      const seg = location.pathname.split("/").filter(Boolean)[0];
      return {
        owner,
        repo: seg || `${owner}.github.io`,
        branch: "main",
        path: "data/board.json",
        sha: null,
        photoShas: {}
      };
    } catch (_) {
      return fallback;
    }
  }

  function friendlyGhError(status, message) {
    if (status === 401) return "That token was rejected. Paste a new one.";
    if (status === 403) return "This token can't write the repo. Give it Contents: Read and write.";
    if (status === 404) return "Can't see the repo with this token. Enable Contents access for this repository.";
    return message || `GitHub error (${status})`;
  }

  async function readGhJson(res) {
    const text = await res.text();
    if (!String(text || "").trim()) {
      throw new Error(res.ok ? "GitHub sent an empty reply. Try Connect again." : friendlyGhError(res.status));
    }
    try {
      return JSON.parse(text);
    } catch (_) {
      throw new Error(friendlyGhError(res.status, "GitHub reply was not JSON."));
    }
  }

  async function blobContent(github, sha, token) {
    const res = await fetch(`https://api.github.com/repos/${github.owner}/${github.repo}/git/blobs/${sha}`, {
      headers: ghHeaders(token)
    });
    if (!res.ok) throw new Error(friendlyGhError(res.status, (await readGhJson(res).catch(() => ({}))).message));
    const blob = await readGhJson(res);
    return blob.content || "";
  }

  async function connect(token) {
    const clean = String(token || "").trim();
    if (!clean) throw new Error("Paste a token first");
    setToken(clean);
    const target = inferTarget();
    const who = await fetch("https://api.github.com/user", { headers: ghHeaders(clean) });
    if (!who.ok) throw new Error(friendlyGhError(who.status, (await readGhJson(who).catch(() => ({}))).message));
    const user = await readGhJson(who);
    let repoRes = await fetch(`https://api.github.com/repos/${target.owner}/${target.repo}`, {
      headers: ghHeaders(clean)
    });
    if (repoRes.status === 404 && user.login && user.login !== target.owner) {
      target.owner = user.login;
      repoRes = await fetch(`https://api.github.com/repos/${target.owner}/${target.repo}`, {
        headers: ghHeaders(clean)
      });
    }
    if (!repoRes.ok) throw new Error(friendlyGhError(repoRes.status, (await readGhJson(repoRes).catch(() => ({}))).message));
    const board = await pullBoard(target);
    return { login: user.login, target, board };
  }

  async function pullBoard(github) {
    const token = getToken();
    if (!token || !github?.owner || !github?.repo) return null;
    const path = encodeURIComponent(github.path || "data/board.json").replace(/%2F/g, "/");
    const url = `https://api.github.com/repos/${github.owner}/${github.repo}/contents/${path}?ref=${encodeURIComponent(github.branch || "main")}`;
    const res = await fetch(url, { headers: ghHeaders(token) });
    if (res.status === 404) return { missing: true, sha: null, data: null };
    if (!res.ok) {
      const err = await readGhJson(res).catch(() => ({}));
      throw new Error(friendlyGhError(res.status, err.message));
    }
    const body = await readGhJson(res);
    let encoded = body.content || "";
    /* Files over ~1MB come back with a sha and no content. Blobs API still has the file. */
    if (!encoded.trim() && body.sha) encoded = await blobContent(github, body.sha, token);
    if (!encoded.trim()) {
      throw new Error("GitHub sent an empty board. Hit Connect again — photos are stored as separate files now.");
    }
    let data;
    try {
      data = JSON.parse(fromB64(encoded));
    } catch (_) {
      throw new Error("Couldn't read the saved board. Connect again so photos can move out of board.json.");
    }
    return { missing: false, sha: body.sha, data };
  }

  async function pushBoard(github, payload, sha, attempt) {
    const token = getToken();
    if (!token || !github?.owner || !github?.repo) return null;
    const path = encodeURIComponent(github.path || "data/board.json").replace(/%2F/g, "/");
    const url = `https://api.github.com/repos/${github.owner}/${github.repo}/contents/${path}`;
    const content = toB64(JSON.stringify(payload, null, 2));
    const res = await fetch(url, {
      method: "PUT",
      headers: { ...ghHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Update Latch board",
        content,
        branch: github.branch || "main",
        sha: sha || undefined
      })
    });
    if ((res.status === 409 || res.status === 422) && (attempt || 0) < 1) {
      const again = await pullBoard(github);
      if (!again || again.missing) throw new Error("GitHub conflict — try Save again");
      return pushBoard(github, payload, again.sha, (attempt || 0) + 1);
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(friendlyGhError(res.status, err.message));
    }
    const body = await res.json();
    return body.content?.sha || body.sha;
  }

  function readLocal() {
    const raw = localStorage.getItem(STATE_KEY) || localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  const photoCache = new Map();
  const isDataUrl = (s) => /^data:image\//i.test(s || "");
  const isIdb = (s) => /^idb:/i.test(s || "");
  const rawB64 = (dataUrl) => String(dataUrl || "").replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("latch-photos", 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos");
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbOp(storeName, mode, fn) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, mode);
          const req = fn(tx.objectStore(storeName));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
          tx.oncomplete = () => db.close();
        })
    );
  }

  const photoOp = (mode, fn) => idbOp("photos", mode, fn);
  const kvOp = (mode, fn) => idbOp("kv", mode, fn);

  async function keepPhoto(dataUrl, hint) {
    if (!dataUrl) return "";
    if (!isDataUrl(dataUrl)) return dataUrl;
    let stored = dataUrl;
    if (dataUrl.length > 120000) {
      try {
        stored = await compressImageUrl(dataUrl, 560, 0.62);
      } catch (_) {}
    }
    const key = String(hint || `p-${Date.now().toString(36)}`).replace(/[^a-z0-9._-]+/gi, "-");
    await photoOp("readwrite", (store) => store.put(stored, key));
    const ref = `idb:${key}`;
    photoCache.set(ref, stored);
    return ref;
  }

  function publicPhotoUrl(src, github) {
    if (!src || isDataUrl(src) || isIdb(src)) return "";
    if (/^https?:\/\//i.test(src)) return src;
    const g = github || inferTarget();
    const rel = String(src).replace(/^\.\//, "").replace(/^\/+/, "");
    if (!rel || !g.owner || !g.repo) return rel;
    return `https://raw.githubusercontent.com/${g.owner}/${g.repo}/${g.branch || "main"}/${rel}`;
  }

  function resolvePhoto(src, github) {
    if (!src) return "";
    if (photoCache.has(src)) return photoCache.get(src);
    if (isDataUrl(src)) return src;
    if (isIdb(src)) {
      const key = src.slice(4);
      return photoCache.get(src) || publicPhotoUrl(`data/photos/${key}.jpg`, github);
    }
    return publicPhotoUrl(src, github) || src;
  }

  function walkPhotos(state, visit) {
    const jobs = [];
    const each = (arr, prefix) => {
      if (!arr) return;
      arr.forEach((src, i) => {
        if (src) jobs.push(Promise.resolve(visit(arr, i, src, prefix)));
      });
    };
    each(state.user && state.user.photos, "user");
    (state.customProfiles || []).forEach((p) => each(p.photos, p.id));
    return Promise.all(jobs);
  }

  async function hydratePhotos(state) {
    await walkPhotos(state, async (_arr, _i, src) => {
      if (!src || photoCache.has(src)) return;
      const key = isIdb(src) ? src.slice(4) : /^data\/photos\//i.test(src) ? src : "";
      if (!key) return;
      const data = await photoOp("readonly", (store) => store.get(key));
      if (data) photoCache.set(src, data);
    });
  }

  async function parkInlinePhotos(state) {
    await walkPhotos(state, async (arr, i, src, prefix) => {
      if (isDataUrl(src)) arr[i] = await keepPhoto(src, `${prefix}-${i}`);
    });
  }

  async function putPhotoFile(github, relPath, dataUrl, attempt) {
    const token = getToken();
    const url = `https://api.github.com/repos/${github.owner}/${github.repo}/contents/${relPath}`;
    github.photoShas = github.photoShas || {};
    let sha = github.photoShas[relPath];
    if (!sha) {
      const ex = await fetch(`${url}?ref=${encodeURIComponent(github.branch || "main")}`, { headers: ghHeaders(token) });
      if (ex.ok) sha = (await readGhJson(ex)).sha;
    }
    const res = await fetch(url, {
      method: "PUT",
      headers: { ...ghHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Latch photo ${relPath}`,
        content: rawB64(dataUrl),
        branch: github.branch || "main",
        sha: sha || undefined
      })
    });
    if ((res.status === 409 || res.status === 422) && (attempt || 0) < 1) {
      const ex = await fetch(`${url}?ref=${encodeURIComponent(github.branch || "main")}`, { headers: ghHeaders(token) });
      if (ex.ok) github.photoShas[relPath] = (await readGhJson(ex)).sha;
      else delete github.photoShas[relPath];
      return putPhotoFile(github, relPath, dataUrl, (attempt || 0) + 1);
    }
    if (!res.ok) {
      const err = await readGhJson(res).catch(() => ({}));
      throw new Error(friendlyGhError(res.status, err.message));
    }
    const body = await readGhJson(res);
    github.photoShas[relPath] = body.content?.sha || body.sha;
    photoCache.set(relPath, dataUrl);
    await photoOp("readwrite", (store) => store.put(dataUrl, relPath));
    return relPath;
  }

  async function asDataUrl(data) {
    if (!data) return "";
    if (typeof data === "string") return data;
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(data);
      });
    }
    return "";
  }

  async function dataForUpload(src) {
    if (isDataUrl(src)) return src;
    if (isIdb(src)) return asDataUrl(photoCache.get(src) || (await photoOp("readonly", (store) => store.get(src.slice(4)))));
    return "";
  }

  function isLocalPhoto(src) {
    return Boolean(src && (isDataUrl(src) || isIdb(src)));
  }

  function countFilePhotos(state) {
    let n = 0;
    walkPhotos(state, (_arr, _i, src) => {
      if (src && !isLocalPhoto(src)) n += 1;
    });
    return n;
  }

  async function offloadPhotos(state, github) {
    if (!getToken() || !github?.owner || !github?.repo) {
      throw new Error("Connect GitHub so photos can follow you to other devices.");
    }
    const flush = async (arr, prefix) => {
      if (!arr) return;
      for (let i = 0; i < arr.length; i += 1) {
        const src = arr[i];
        if (!isLocalPhoto(src)) continue;
        const data = await dataForUpload(src);
        if (!isDataUrl(data)) {
          throw new Error("A photo is only on this phone/computer. Add it again, then Save.");
        }
        const id = String(prefix).replace(/[^a-z0-9._-]+/gi, "-") || "pic";
        arr[i] = await putPhotoFile(github, `data/photos/${id}-${i}.jpg`, data);
      }
    };
    await flush(state.user && state.user.photos, "user");
    for (const p of state.customProfiles || []) await flush(p.photos, p.id);
  }

  function slimValue(value) {
    if (typeof value === "string") return isDataUrl(value) ? "" : value;
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(slimValue);
    const out = {};
    Object.keys(value).forEach((k) => {
      out[k] = k === "pendingBots" ? {} : slimValue(value[k]);
    });
    return out;
  }

  function dropLocalBoard() {
    try {
      localStorage.removeItem(STATE_KEY);
    } catch (_) {}
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch (_) {}
  }

  async function loadState() {
    try {
      const fromIdb = await kvOp("readonly", (store) => store.get("board"));
      if (fromIdb && typeof fromIdb === "object") return fromIdb;
    } catch (_) {}
    return readLocal();
  }

  async function persist(state) {
    const slim = slimValue({ ...state, pendingBots: {} });
    await kvOp("readwrite", (store) => store.put(slim, "board"));
    dropLocalBoard();
  }

  function writeLocal(state) {
    persist(state).catch(() => {});
  }

  async function clearBoard() {
    photoCache.clear();
    dropLocalBoard();
    try {
      await photoOp("readwrite", (store) => store.clear());
    } catch (_) {}
    try {
      await kvOp("readwrite", (store) => store.clear());
    } catch (_) {}
  }

  global.latchStorage = {
    STATE_KEY,
    TOKEN_KEY,
    compressImage,
    compressImageUrl,
    inferTarget,
    connect,
    getToken,
    setToken,
    pullBoard,
    pushBoard,
    readLocal,
    loadState,
    writeLocal,
    clearBoard,
    keepPhoto,
    resolvePhoto,
    hydratePhotos,
    parkInlinePhotos,
    offloadPhotos,
    countFilePhotos,
    isLocalPhoto
  };
})(window);
