# Latch

A static dating-app demo inspired by prompt-based dating apps. Fictional people, Unsplash portraits (one source photo per person, cropped three ways so faces stay consistent).

Open `index.html`, or host the folder on **GitHub Pages**.

## First-run setup

The opening flow is a full profile: name, age, gender, who you want to see, photos, prompts, and basics.

## Saving (browser + GitHub)

The app always writes to `localStorage`. To keep the same board after you upload the site (or switch devices):

1. Create a GitHub repo and put these files in it.
2. Enable Pages (Settings → Pages → deploy `main` / root).
3. Create a **fine-grained personal access token** with **Contents: Read and write** on that repo only.
4. In Latch → Profile (or the last onboarding step), enter owner, repo, path `data/board.json`, and the token.
5. **Save to GitHub**. The site will create/update `data/board.json`.

The token is stored only in your browser (`latch-gh-token`). It is **not** written into `board.json`. Do not commit a token into the repo.

Photos are compressed to JPEG before save so the Contents API stays under size limits.

## Chat

Replies follow the last message and the vibe (joke, flirt, hiking, date ask). They no longer treat every `?` as a generic interview question.
