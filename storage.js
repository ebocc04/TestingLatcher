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
      sha: null
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
        sha: null
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
      throw new Error("The saved board is too big for GitHub to send (photos). Connect still works after a smaller save.");
    }
    let data;
    try {
      data = JSON.parse(fromB64(encoded));
    } catch (_) {
      throw new Error("Couldn't read the saved board. Photos probably bloated it — save fewer shots and Connect again.");
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

  function writeLocal(state) {
    const copy = { ...state, pendingBots: {} };
    localStorage.setItem(STATE_KEY, JSON.stringify(copy));
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
    writeLocal
  };
})(window);
