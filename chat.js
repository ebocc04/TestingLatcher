/* Conversation engine: follows the last beat, not random templates. */
(function (global) {
  const STYLE = {
    playful: { laugh: "lol okay", warm: "I'm smiling at my phone.", push: "Don't make me like you this fast." },
    dry: { laugh: "Ha.", warm: "That's not nothing.", push: "You might be interesting." },
    warm: { laugh: "That made me laugh.", warm: "That's really sweet.", push: "I like talking to you." },
    thoughtful: { laugh: "That's funny in a specific way.", warm: "I like how you said that.", push: "We could talk for a while." },
    direct: { laugh: "Ha. Okay.", warm: "I like that.", push: "We'd have a good time." },
    witty: { laugh: "I'm keeping that.", warm: "You're quick. I like quick.", push: "We'd be annoying together in the best way." },
    soft: { laugh: "That's cute. I'm shy about it.", warm: "That's tender.", push: "I want to keep talking." },
    easy: { laugh: "You're funnier than your photos.", warm: "This is easy. I like easy.", push: "Alright I'm invested." },
    grounded: { laugh: "Okay that was good.", warm: "That's a real answer.", push: "You're making this feel less like an app." },
    quiet: { laugh: "That was a good one.", warm: "I like your pace.", push: "We might be compatible. Quietly." }
  };

  const PERSONA = {
    maya: "playful",
    jordan: "dry",
    priya: "warm",
    leo: "thoughtful",
    nina: "playful",
    andre: "direct",
    sofia: "thoughtful",
    kai: "easy",
    elena: "grounded",
    omar: "direct",
    avery: "witty",
    mateo: "thoughtful",
    hana: "soft",
    devon: "grounded",
    luca: "quiet",
    sasha: "warm"
  };

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function last(thread, from) {
    for (let i = (thread || []).length - 1; i >= 0; i--) {
      if (!from || thread[i].from === from) return thread[i].text;
    }
    return "";
  }

  function usedSet(thread) {
    return new Set((thread || []).filter((m) => m.from === "them").map((m) => m.text));
  }

  function unused(options, thread) {
    const used = usedSet(thread);
    const fresh = options.filter((x) => x && !used.has(x));
    return pick(fresh.length ? fresh : options);
  }

  function has(t, re) {
    return re.test(t);
  }

  function analyze(userText, thread) {
    const t = userText.toLowerCase();
    const them = last(thread, "them").toLowerCase();
    const teasing =
      has(t, /\b(though|or what|or nah|or just|don't you|aren't you|am i|are you the|you the)\b/) ||
      has(t, /\bsnack\b/) ||
      has(t, /\b(menu|dessert|package deal)\b/);
    const flirt =
      teasing ||
      has(t, /\b(cute|hot|sexy|beautiful|handsome|pretty|gorgeous|into you|crush|kiss|date me|take you|steal you|smooth|charming|flirt|attracted)\b/) ||
      has(t, /\bare you\b.*\b(free|single|the)\b/);
    const joke =
      teasing ||
      has(t, /\b(haha|hahaha|lol|lmao|jk|lmaoo|funny|joke|kidding|bit\b|💀|😂|😭)\b/) ||
      (flirt && userText.includes("?"));
    const hike = has(t, /\b(hik|trail|outdoors?|nature|greenbelt|walk|backpack)\b/) || has(them, /\b(hik|trail|snack)\b/);
    const food = has(t, /\b(snack|taco|coffee|food|dinner|lunch|eat|hungry|dumpling|pastry|cookie|dessert|cook|wine|drink)\b/);
    const dateAsk = has(t, /\b(hang out|get dinner|get drinks|this week|free\b|down to|meet up|go out|when can)\b/);
    const greeting = has(t, /^(hey|hi|hello|yo|sup|what'?s up)\b/) && t.length < 24;
    const realQ =
      userText.includes("?") &&
      !teasing &&
      has(t, /\b(what|where|when|why|how|which|do you|did you|are you|favorite|who)\b/);
    return { t, them, teasing, flirt, joke, hike, food, dateAsk, greeting, realQ };
  }

  function topicReply(p, a) {
    const keys = Object.entries(p.voice.keywords || {});
    const hits = keys.filter(([k]) => a.t.includes(k) || a.them.includes(k));
    if (hits.length) return hits[0][1];
    return "";
  }

  function answerFromProfile(p, t) {
    if (has(t, /\b(job|work|do for a living)\b/)) return `I ${p.job.toLowerCase().startsWith("i ") ? p.job : "work as " + p.job.toLowerCase()}. Off the clock I'm more fun, I promise.`;
    if (has(t, /\b(live|city|where)\b/)) return `${p.city}. You?`;
    if (has(t, /\b(age|old)\b/)) return `${p.age}. Why, you writing a census?`;
    if (has(t, /\b(looking for|want|serious|casual)\b/)) return p.intention + ". Matching energy preferred.";
    if (has(t, /\bfavorite\b/) && has(t, /\b(food|eat|dish)\b/)) return topicReply(p, { t: "food taco", them: "" }) || "Whatever's salty and shared.";
    return "";
  }

  function converse(p, userText, thread) {
    const a = analyze(userText, thread);
    const s = STYLE[PERSONA[p.id] || "warm"];
    const lines = [];

    if (a.greeting) {
      lines.push(unused([pick(p.voice.greet), `Hey — ${s.warm}`], thread));
      return { lines, vibe: "warm" };
    }

    if (a.flirt && (a.food || a.hike || a.teasing)) {
      lines.push(
        unused(
          [
            "I said better snacks, not that I'd be the trail dessert. I'm also not *not* saying that.",
            "Wow. You went straight there. I'm choosing to be charmed.",
            "Depends. I pack well — and yes, I heard what I just said.",
            "That's shameless. Keep going, I can take a joke if it's good.",
            "Okay you're the hiking and the bit. I'll allow it."
          ],
          thread
        )
      );
      lines.push(
        unused(
          [
            "So: actual hike, or do you only flirt about the outdoors?",
            "Greenbelt this weekend? I'll bring real food too, don't worry.",
            "If we go, you're carrying the bag. That's the tax on that line."
          ],
          thread
        )
      );
      return { lines: lines.slice(0, Math.random() < 0.7 ? 2 : 1), vibe: "flirty" };
    }

    if (a.flirt || a.joke) {
      lines.push(
        unused(
          [
            s.laugh + " That landed.",
            s.warm + " You're doing a bit and it's working.",
            "Okay that was smooth. I'm not mad about it.",
            pick(p.voice.reply),
            "You're funnier in the chat than people usually are. Dangerous."
          ],
          thread
        )
      );
      if (a.realQ || a.teasing) {
        lines.push(unused(["Yes. Next question.", "I mean… kinda. Don't get cocky yet.", "I'll take the fifth until the second date."], thread));
      }
      return { lines: lines.slice(0, a.teasing ? 2 : 1), vibe: "flirty" };
    }

    if (a.dateAsk) {
      lines.push(
        unused(
          [
            "I'm free after work most evenings. Walk + something to eat is my default.",
            "Yes. Let's actually do it — this week, not 'sometime.'",
            "I like a plan with wiggle room. You pick the day, I'll pick the place."
          ],
          thread
        )
      );
      return { lines, vibe: "date" };
    }

    if (a.realQ) {
      const answered = answerFromProfile(p, a.t) || topicReply(p, a);
      lines.push(
        answered ||
          unused(
            [
              `On that: ${p.prompts[0].a}`,
              "Short answer: yes. Longer answer over a drink.",
              `Mostly ${p.city} things. I'll get specific if you do.`
            ],
            thread
          )
      );
      lines.push(unused(["Your turn — give me a real one back.", "Okay I answered. Don't leave me hanging."], thread));
      return { lines, vibe: "curious" };
    }

    const topical = topicReply(p, a);
    if (topical && !usedSet(thread).has(topical)) {
      lines.push(topical);
      return { lines, vibe: "topic" };
    }

    if (userText.trim().length < 10) {
      lines.push(unused(["That's it? Give me the rest of the thought.", "Go on…", "Okay but say more. I like when people commit."], thread));
      return { lines, vibe: "nudge" };
    }

    lines.push(
      unused(
        [
          s.warm + " " + pick(["Tell me the last thing that actually made your week.", "What do you do when you're not on this app?", p.prompts[1]?.a ? `Unrelated: ${p.prompts[1].a}` : "Keep talking."]),
          pick(p.voice.reply),
          `${s.push} What does a good ${["Thursday", "Sunday", "weeknight"][Math.floor(Math.random() * 3)]} look like for you?`
        ],
        thread
      )
    );
    return { lines: [lines[0]], vibe: "continue" };
  }

  global.latchConverse = converse;
  global.latchPick = pick;
})(window);
