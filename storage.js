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

  async function pullBoard(github) {
    const token = getToken();
    if (!token || !github?.owner || !github?.repo) return null;
    const path = encodeURIComponent(github.path || "data/board.json").replace(/%2F/g, "/");
    const url = `https://api.github.com/repos/${github.owner}/${github.repo}/contents/${path}?ref=${encodeURIComponent(github.branch || "main")}`;
    const res = await fetch(url, { headers: ghHeaders(token) });
    if (res.status === 404) return { missing: true, sha: null, data: null };
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `GitHub read failed (${res.status})`);
    }
    const body = await res.json();
    const data = JSON.parse(fromB64(body.content));
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
      throw new Error(err.message || `GitHub write failed (${res.status})`);
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
    getToken,
    setToken,
    pullBoard,
    pushBoard,
    readLocal,
    writeLocal
  };
})(window);
