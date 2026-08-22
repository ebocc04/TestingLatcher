# Latch

A static dating-app demo inspired by prompt-based dating apps. Fictional people, Pexels portraits — each person's photos come from one shoot, so it's the same face every time.

Open `index.html`, or host the folder on **GitHub Pages**.

Local preview: `powershell -ExecutionPolicy Bypass -File tools/serve.ps1` → http://localhost:8765/

> Bump the `?v=` on the `<script>` and `<link>` tags in `index.html` whenever you deploy. GitHub Pages caches assets for ten minutes and stale JS looks exactly like a broken app.

## First-run setup

The opening flow is a full profile: name, age, gender, who you want to see, photos, prompts, and basics.

## Saving (browser + GitHub)

The app always writes to `localStorage`. To keep the same board on this site:

1. Create a **fine-grained token** with **Contents: Read and write** on `ebocc04/TestingLatcher`.
2. In Latch → Profile, paste the token and tap **Connect**. The app already knows this repo.

The token stays in your browser. It is never written into `board.json`.

Photos are compressed to JPEG before save so the Contents API stays under size limits.

## Chat

Two engines. With a Groq API key, replies come from a language model that reads the whole conversation; without one, the built-in rule engine handles it.

### Language model (recommended)

Profile → **Chat engine** → paste a [Groq key](https://console.groq.com/keys) → **Connect**. Groq sends CORS headers, so this static site calls the API directly with no server or proxy. The key is stored in `localStorage` only — it never enters app state or `board.json`, so the GitHub sync can't commit it.

The model list is fetched from your account rather than hardcoded, because Groq retires model IDs on a schedule (the Llama chat models were shut down in August 2026). Default is `openai/gpt-oss-20b`.

Each person's system prompt is compiled from their profile *and* their admin overrides, so chat tone, flirtiness, emoji, lowercase and reply length steer the model. `llm.js` returns `null` on a missing key, a failed request or an empty reply, and `app.js` falls back to the rule engine.

### Built-in engine (no key, offline)

`chat.js` plans each reply against the whole thread rather than the last message. Before answering it works out what you've said about yourself, which of its questions you answered, which of *your* questions it still owes an answer to, whether a date is already agreed, and how long your messages are. Rules it holds to: a question always gets a real answer (including "are you?" two messages later), one question per turn at most, nothing said twice in a thread, and no quoting your message back at you.

Voice is a fixed per-person transform — casing, exclamation marks, emoji, reply length — so a match texts consistently.

### Reading transcripts

`tools/chat-test.html` runs scripted conversations through the real engine and prints them with the intent it picked for each turn. Add `?who=nina` to filter. Use it instead of clicking through the UI when changing `chat.js`.

## Admin

- **Chat → ☰** — view the full profile, customize the person, clear the conversation, or unmatch.
- **Customize this person** overrides name, age, city, job, gender, sexuality, intention and prompts, plus personality: chat tone, flirtiness, emoji and exclamation rates, lowercase, short replies, reply speed. Overrides live in `state.tweaks[id]` and are layered over `profiles.js` on read, so they apply everywhere at once. **Reset** restores the original.
- **Profile → Admin** — reset likes/matches/chats, reset all customized people, start over keeping your profile (setup reopens prefilled), or erase everything.
