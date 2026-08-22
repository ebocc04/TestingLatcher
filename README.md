# Latch

A static dating-app demo inspired by prompt-based dating apps. Fictional people, Unsplash portraits (one source photo per person, cropped three ways so faces stay consistent).

Open `index.html`, or host the folder on **GitHub Pages**.

## First-run setup

The opening flow is a full profile: name, age, gender, who you want to see, photos, prompts, and basics.

## Saving (browser + GitHub)

The app always writes to `localStorage`. To keep the same board on this site:

1. Create a **fine-grained token** with **Contents: Read and write** on `ebocc04/TestingLatcher`.
2. In Latch → Profile, paste the token and tap **Connect**. The app already knows this repo.

The token stays in your browser. It is never written into `board.json`.

Photos are compressed to JPEG before save so the Contents API stays under size limits.

## Chat

Replies follow the last message and the vibe (joke, flirt, hiking, date ask). They no longer treat every `?` as a generic interview question.
