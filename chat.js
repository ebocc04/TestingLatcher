/* Replies to what you said — vibe first, then a follow-up on the same beat. */
(function (global) {
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

  function used(thread) {
    return new Set((thread || []).filter((m) => m.from === "them").map((m) => m.text));
  }

  function fresh(options, thread) {
    const seen = used(thread);
    const pool = options.filter((x) => x && !seen.has(x));
    return pick(pool.length ? pool : options);
  }

  function clip(text) {
    const t = String(text || "").trim().replace(/\s+/g, " ");
    if (t.length <= 48) return t;
    return t.slice(0, 45).replace(/[,.;:!?\s]+$/, "") + "…";
  }

  function topics(text) {
    const t = text.toLowerCase();
    const found = [];
    const map = [
      ["hike", /\b(hik|trail|outdoors?|greenbelt|backpack|nature walk)\b/],
      ["snack", /\b(snack|trail mix|granola)\b/],
      ["food", /\b(taco|dinner|lunch|eat|hungry|dumpling|pastry|cookie|dessert|cook|food)\b/],
      ["coffee", /\b(coffee|latte|espresso|cafe)\b/],
      ["drink", /\b(wine|beer|drink|bar|negroni)\b/],
      ["music", /\b(music|album|song|vinyl|concert|record|playlist)\b/],
      ["work", /\b(work|job|shift|office|startup)\b/],
      ["date", /\b(hang out|get dinner|this week|meet up|go out|free friday|saturday)\b/],
      ["dog", /\b(dog|puppy|rescue)\b/],
      ["movie", /\b(movie|film|imdb)\b/],
      ["plant", /\b(plant|flower|garden|tomato)\b/]
    ];
    map.forEach(([name, re]) => {
      if (re.test(t)) found.push(name);
    });
    return found;
  }

  function vibe(text, them) {
    const t = text.toLowerCase();
    const tease = /\b(though|or what|or nah|aren't you|are you the|you the|snack)\b/.test(t);
    const flirt =
      tease ||
      /\b(cute|hot|sexy|beautiful|handsome|pretty|gorgeous|into you|crush|kiss|date me|smooth|flirt)\b/.test(t);
    const joke = tease || /\b(haha|lol|lmao|jk|kidding|funny|💀|😂)\b/.test(t) || (flirt && text.includes("?"));
    const greet = /^(hey|hi|hello|yo|sup|what'?s up)\b/i.test(text.trim()) && text.trim().length < 22;
    const realQ = text.includes("?") && !tease && /\b(what|where|when|why|how|which|do you|did you|favorite|who)\b/i.test(t);
    const dateAsk = /\b(hang out|get dinner|get drinks|this week|meet up|go out|when are you free)\b/i.test(t);
    return { t, them: (them || "").toLowerCase(), tease, flirt, joke, greet, realQ, dateAsk, topics: topics(text + " " + (them || "")) };
  }

  function answer(p, t) {
    if (/\b(job|work|do for a living)\b/.test(t)) return `I'm a ${p.job.toLowerCase()}. Off the clock I'm less impressive and more fun.`;
    if (/\b(live|city|where are you)\b/.test(t)) return `${p.city} — you?`;
    if (/\b(age|old are you)\b/.test(t)) return `${p.age}. Don't make it weird.`;
    if (/\b(looking for|serious|casual|want)\b/.test(t)) return `${p.intention}. That's the honest version.`;
    if (/\bsexuality|orientation|straight|gay|lesbian|bi\b/.test(t)) {
      return `I'm ${p.orientation}. If that works for you, keep talking.`;
    }
    return "";
  }

  function keywordHit(p, t) {
    const keys = Object.entries(p.voice.keywords || {});
    const hit = keys.find(([k]) => t.includes(k));
    return hit ? hit[1] : "";
  }

  function converse(p, userText, thread) {
    const them = last(thread, "them");
    const v = vibe(userText, them);
    const bit = clip(userText);
    const style = PERSONA[p.id] || "warm";

    if (v.greet) {
      return { lines: [fresh([pick(p.voice.greet), `Hey. ${p.prompts[0].a.split(".")[0]}.`], thread)] };
    }

    if (v.flirt && (v.topics.includes("snack") || v.topics.includes("hike") || v.tease)) {
      return {
        lines: [
          fresh(
            [
              `"${bit}" is insane and I'm not mad about it.`,
              "I said better snacks. I did not say I wasn't on the menu. You're welcome.",
              "Wow. You went for it. I'm choosing to be charmed.",
              "Keep the joke coming — that's the version of you I want on a trail."
            ],
            thread
          ),
          fresh(
            [
              "So are we actually hiking, or was that just the pickup?",
              "Greenbelt this weekend. I'll bring real food too.",
              "You're carrying the bag. That's the tax on that line."
            ],
            thread
          )
        ].slice(0, Math.random() < 0.75 ? 2 : 1)
      };
    }

    if (v.flirt || v.joke) {
      const line = fresh(
        [
          `Okay "${bit}" landed. Don't get cocky yet.`,
          "That's funny. I'm smiling at my phone like a loser.",
          "You're doing a bit and it's working.",
          pick(p.voice.reply)
        ],
        thread
      );
      const extra = v.tease
        ? fresh(["I mean… kinda. Next question.", "I'll take the fifth until drinks."], thread)
        : null;
      return { lines: extra ? [line, extra] : [line] };
    }

    if (v.dateAsk) {
      return {
        lines: [
          fresh(
            [
              "Yes. This week, not 'sometime.' Walk + something to eat.",
              "I'm free most evenings after work. You pick the night.",
              "Let's actually do it. I'll bring a plan with wiggle room."
            ],
            thread
          )
        ]
      };
    }

    if (v.realQ) {
      const a = answer(p, v.t) || keywordHit(p, v.t);
      return {
        lines: [
          a || `On that — ${p.prompts[0].a}`,
          fresh(["Your turn. Ask me something worse.", "Okay I answered. Don't leave me hanging."], thread)
        ]
      };
    }

    const topical = keywordHit(p, v.t) || (v.topics[0] && keywordHit(p, v.topics[0]));
    if (topical) {
      return {
        lines: [
          `${style === "dry" ? "Yeah." : "Okay."} ${topical}`,
          fresh([`You said "${bit}" — I want the rest of that.`, "Keep going. That actually interested me."], thread)
        ].slice(0, 2)
      };
    }

    if (userText.trim().length < 8) {
      return { lines: [fresh(["That's it? Give me the rest.", "Go on…", "Say the interesting part."], thread)] };
    }

    return {
      lines: [
        fresh(
          [
            `"${bit}" — I like how you talk. ${pick(p.voice.reply)}`,
            `Got it. ${p.prompts[1] ? p.prompts[1].a : "Tell me what a good weeknight looks like."}`,
            pick(p.voice.reply) + ` What made you say that?`
          ],
          thread
        )
      ]
    };
  }

  global.latchConverse = converse;
  global.latchPick = pick;
})(window);
