/* Conversation engine.

   A reply is planned, not sampled. Each turn we read the intent of your message,
   rebuild what this person already knows about you from the thread, then pick a
   sequence of moves (react / answer / offer / ask). Two rules keep it from feeling
   like a bot: a direct question always gets a direct answer, and only one move per
   turn is allowed to be a question, so nobody interrogates you.

   Voice is applied last, as a fixed per-person transform, so a given match always
   texts with the same energy, casing and punctuation habits. */
(function (global) {
  const VOICE = {
    maya: { tone: "playful", bang: 0.35, emoji: ["🙂"], emojiRate: 0.12, double: 0.45 },
    jordan: { tone: "dry", bang: 0, double: 0.15, clip: true },
    priya: { tone: "warm", bang: 0.5, emoji: ["😂", "🙂"], emojiRate: 0.2, double: 0.4 },
    leo: { tone: "thoughtful", bang: 0.1, double: 0.2 },
    nina: { tone: "playful", lower: true, bang: 0.3, emoji: ["😭", "🙃"], emojiRate: 0.28, double: 0.6, clip: true },
    andre: { tone: "direct", bang: 0.25, double: 0.2, clip: true },
    sofia: { tone: "thoughtful", bang: 0.05, double: 0.25 },
    kai: { tone: "easy", lower: true, bang: 0.2, emoji: ["🙂"], emojiRate: 0.1, double: 0.35 },
    elena: { tone: "grounded", bang: 0.15, double: 0.2 },
    omar: { tone: "direct", bang: 0.4, double: 0.3, clip: true },
    avery: { tone: "witty", bang: 0.2, double: 0.4 },
    mateo: { tone: "thoughtful", bang: 0.1, double: 0.2 },
    hana: { tone: "soft", bang: 0.3, emoji: ["🌷", "🙂"], emojiRate: 0.3, ellipsis: 0.3, double: 0.45 },
    devon: { tone: "dry", bang: 0.1, double: 0.2 },
    luca: { tone: "quiet", lower: true, bang: 0.05, ellipsis: 0.35, double: 0.2, clip: true },
    sasha: { tone: "warm", bang: 0.35, emoji: ["🙂"], emojiRate: 0.12, double: 0.35 }
  };

  const DEFAULT_VOICE = { tone: "warm", bang: 0.25, double: 0.3 };

  const DAY_ASKS = [
    `How's your day actually going?`,
    `What kind of day are you having?`,
    `Good day or a get-me-out-of-here day?`
  ];

  const rand = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rand(a.length)];
  const chance = (p) => Math.random() < p;
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const shape = (s) => norm(s).split(" ").slice(0, 5).join(" ");

  /* Prefer wording this person hasn't used yet in this thread. */
  function fresh(options, thread) {
    const said = new Set((thread || []).filter((m) => m.from === "them").map((m) => shape(m.text)));
    const open = options.filter((o) => o && !said.has(shape(o)));
    return pick(open.length ? open : options.filter(Boolean));
  }

  function quote(text) {
    const t = String(text || "").trim().replace(/\s+/g, " ");
    return t.length <= 42 ? t : t.slice(0, 39).replace(/[,.;:!?\s]+$/, "") + "…";
  }

  const RE = {
    greet: /^(hey+|hi+|hello|yo|sup|howdy|what'?s up|whats up|morning|good morning|evening)\b/i,
    bye: /\b(goodnight|good ?night|gtg|got to go|gotta go|talk later|talk tomorrow|heading out|i'?m out|ttyl)\b|\bnight[.!\s]*$/i,
    lowEffort: /^(k|ok|okay|kk|lol|lmao|haha+|hah|nice|cool|word|same|true|fr|fair|yeah|yep|yup|sure|nothing much|nm|hbu|wbu|you\?|u\?)[.!?]*$/i,
    plans: /\b(hang out|hangout|grab (a |some )?(drink|drinks|coffee|dinner|food|bite)|get (drinks|dinner|coffee|food)|meet up|link up|see you|free (this|on|next|tonight|tomorrow)|this week|this weekend|tomorrow|tonight|friday|saturday|sunday|when are you free|what are you doing)\b/i,
    flirt: /\b(cute|hot|sexy|beautiful|gorgeous|handsome|adorable|smooth|charming|into you|crush|kiss|flirt|dangerous|trouble|out of my league|marry)\b/i,
    tease: /\b(or nah|or what|are you the|you the|sure about that|bold|confident|allegedly|prove it|says you)\b|\bare you\b.*\bthough\b/i,
    joke: /(\b(haha+|hah|lol|lmao|lmfao|jk|kidding|joking|dying|deceased|screaming)\b|💀|😂|🤣|😭)/i,
    compliment: /\b(you seem|you'?re (funny|cool|sweet|interesting|smart|great|the best)|i like (you|that|your)|good (answer|taste|point)|well played)\b/i,
    negative: /\b(not really|nah|no thanks|not interested|meh|i'?m good|maybe not|too busy|don'?t think so)\b/i,
    sexual: /\b(nudes|nude|sex|hookup|hook up|dtf|netflix and chill|in bed|naked|smash)\b/i,
    thanks: /\b(thank you|thanks|ty|appreciate it)\b/i,
    aboutThem: /\b(you|your|u|ur|yours)\b/i,
    day: /\b(mon|tues|wednes|thurs|fri|satur|sun)day\b|\btonight\b|\btomorrow\b/i,
    /* Plenty of people skip the question mark. */
    impliedQ: /\b(do|did|are|is|can|could|would|have|whats|what'?s|hows|how'?s)\s+(you|u|ur|your)\b/i,
    confirm: /\b(works|works for me|sounds good|i'?m free|let'?s do|down for|deal|perfect|see you then|what time|where at|where should we|where do you want|which place)\b|\bwhere\b.*\?/i,
    /* "you?" is a request to answer my own question back at me. */
    bounce: /^(you|u|hbu|wbu|and you|what about you|yourself)\s*\??$/i
  };

  const QUESTIONS = [
    [/\bhow (are|r) (you|u)\b|\bhow'?s it going\b|\bhow (was|is) your day\b|\bhow you doing\b/i, "howAreYou"],
    [/\bwhat do you do\b|\byour job\b|\bwhat'?s your job\b|\bfor a living\b|\bwhat do you work\b/i, "job"],
    [/\bwhere (do you|you) live\b|\bwhere are you (from|based)\b|\bwhat part of town\b/i, "city"],
    [/\bhow old\b|\byour age\b/i, "age"],
    [/\bwhat are you looking for\b|\bhere for\b|\bserious or\b|\bwhat do you want\b/i, "intention"],
    [/\bwhat'?s your name\b|\byour name\b/i, "name"],
    [/\bhow (long|many).*(hinge|app|apps|here)\b|\bnew (to|on) (this|hinge|apps)\b/i, "apps"],
    [/\bweekend\b.*\?|\bwhat are you up to\b|\bplans (this|for)\b/i, "weekend"],
    [/\b(where did you|did you) (go to school|study)\b|\byour school\b|\bcollege\b/i, "school"],
    [/\bhow tall\b|\byour height\b/i, "height"],
    [/\b(favou?rite|favorite) (food|restaurant|place to eat)\b|\bbest taco\b/i, "food"],
    [/\b(favou?rite|favorite) (music|band|artist|album|song)\b|\bwhat do you listen to\b/i, "music"],
    [/\b(favou?rite|favorite) (movie|film|show)\b|\bwhat do you watch\b/i, "movie"],
    [/\bpets?\b|\bdo you have a (dog|cat)\b/i, "pets"],
    [/\bwhat'?s your (deal|story)\b|\btell me about you\b|\byourself\b/i, "story"]
  ];

  function askedWhat(text) {
    const hit = QUESTIONS.find(([re]) => re.test(text));
    return hit ? hit[1] : "";
  }

  const ADJ_STOP = /^(little|bit|lot|big|huge|small|fan|mess|bad|good|great|nice|sorry|tired|hungry|bored|busy|fine|ok|okay|weirdo|idiot)\b/i;
  const CLAUSE_STOP = /^(so|and|but|because|who|that|which|then|though|right|now|today|at|in|for|with|from|on|to)$/i;

  /* Trim a captured phrase at the first connective — "a software engineer so mostly
     staring at a screen" is a sentence, not a job. */
  function phrase(raw) {
    const out = [];
    for (const w of String(raw || "").trim().split(/\s+/)) {
      if (!w || CLAUSE_STOP.test(w)) break;
      out.push(w);
      if (out.length === 3) break;
    }
    return out.join(" ").toLowerCase();
  }

  /* What this person could reasonably remember about you from the thread. */
  function memory(thread) {
    const mine = (thread || []).filter((m) => m.from === "me");
    const text = mine.map((m) => m.text).join("\n");
    const m = {
      turns: mine.length,
      facts: {},
      topic: "",
      lastAsk: ""
    };

    let hit;
    if ((hit = /\bi(?:'m| am|m)\s+(?:a|an)\s+((?:[a-z\-]+ ?){1,3})/i.exec(text)) && !ADJ_STOP.test(hit[1])) {
      m.facts.job = phrase(hit[1]);
    }
    if ((hit = /\bi\s+work\s+(?:as|at|in|for)\s+(?:a |an |the )?((?:[a-z\-]+ ?){1,3})/i.exec(text))) {
      m.facts.job = m.facts.job || phrase(hit[1]);
    }
    if ((hit = /\bi\s+live\s+in\s+([a-z][a-z \-]{2,20})/i.exec(text))) m.facts.city = hit[1].trim();
    const likes = [...text.matchAll(/\bi\s+(?:really\s+)?(?:love|like|am into|'m into)\s+((?:[a-z\-]+ ?){1,3})/gi)]
      .map((x) => phrase(x[1]))
      .filter((x) => x && !ADJ_STOP.test(x));
    if (likes.length) m.facts.like = likes[likes.length - 1];

    /* Only the last couple of messages count as "what we're talking about" —
       a trail mentioned eight messages ago is not the current topic. */
    m.topic = mine
      .slice(-2)
      .map((x) => topicOf(x.text))
      .filter(Boolean)
      .pop() || "";

    const theirs = (thread || []).filter((x) => x.from === "them");
    m.askedRecently = theirs.slice(-2).some((x) => x.text.includes("?"));
    m.lastAsk = theirs.length && theirs[theirs.length - 1].text.includes("?") ? theirs[theirs.length - 1].text : "";
    m.said = new Set(theirs.map((x) => shape(x.text)));
    /* A plan is on the table only once a day or time has been floated — an opener
       that happens to mention coffee is not a date. */
    m.planned = theirs.some((x) =>
      /\b(mon|tues|wednes|thurs|fri|satur|sun)day\b|\btonight\b|\btomorrow\b|\bthis week\b|\bweekend\b|\d\s?(ish|pm)/i.test(x.text)
    );
    /* Fall back to whatever the conversation has been about when the last message
       is pure logistics with no subject of its own. */
    m.anyTopic = (thread || [])
      .map((x) => topicOf(x.text))
      .filter(Boolean)
      .pop() || "";
    return m;
  }

  const TOPICS = [
    ["hike", /\b(hik(e|ing)|trail|greenbelt|outdoors?|camp(ing)?|backpack)\b/i],
    ["coffee", /\b(coffee|latte|espresso|cafe|cold brew)\b/i],
    ["taco", /\b(taco|tacos|breakfast taco)\b/i],
    ["food", /\b(dinner|lunch|cook(ing)?|food|restaurant|eat|pizza|dumpling|pastry|dessert|bbq|ramen|sushi|noodles?|burger|brunch|bakery|menu)\b/i],
    ["drink", /\b(beer|wine|whiskey|negroni|cocktail|bar|brewery)\b/i],
    ["music", /\b(music|band|album|song|vinyl|record|concert|show|playlist|guitar)\b/i],
    ["work", /\b(work|job|shift|office|startup|deadline|meeting|client|code|coding|engineer)\b/i],
    ["dog", /\b(dog|puppy|rescue|cat)\b/i],
    ["movie", /\b(movie|film|show|series|watching)\b/i],
    ["plant", /\b(plant|flower|garden|tomato)\b/i],
    ["travel", /\b(travel|trip|flight|abroad|vacation)\b/i],
    ["run", /\b(run(ning)?|gym|lift|climb(ing)?|yoga|bike|basketball|soccer)\b/i],
    ["book", /\b(book|reading|novel|author)\b/i],
    ["sleep", /\b(tired|sleep|nap|exhausted|insomnia)\b/i]
  ];

  function topicOf(text) {
    const hit = TOPICS.find(([, re]) => re.test(text || ""));
    return hit ? hit[0] : "";
  }

  function intentOf(text, mem) {
    const t = String(text || "").trim();
    if (RE.bye.test(t)) return "bye";
    if (RE.sexual.test(t)) return "sexual";
    /* Once a meet-up is on the table, day names mean logistics, not a fresh invite. */
    if (mem.planned && (RE.day.test(t) || RE.confirm.test(t) || RE.plans.test(t))) return "logistics";
    if (RE.plans.test(t)) return "plans";
    if (RE.bounce.test(t) || (/\b(you|u)\s*\?$/i.test(t) && t.length < 26)) return "bounce";
    if (RE.lowEffort.test(t)) return "lowEffort";
    if (RE.greet.test(t) && t.length < 24 && mem.turns <= 1) return "greet";
    /* A teasing question is a flirt, not a request for information. */
    if (RE.tease.test(t) || (RE.flirt.test(t) && t.length < 70)) return "flirt";
    if (t.includes("?") || RE.impliedQ.test(t)) return RE.aboutThem.test(t) ? "askMe" : "question";
    if (RE.flirt.test(t)) return "flirt";
    if (RE.compliment.test(t)) return "compliment";
    if (RE.joke.test(t)) return "joke";
    if (RE.negative.test(t)) return "cool";
    if (RE.thanks.test(t)) return "thanks";
    if (mem.lastAsk) return "answered";
    return "statement";
  }

  /* Concrete answers. A question never gets deflected — that was the old tell. */
  function answerFor(p, kind, mem) {
    const first = p.prompts[0] ? p.prompts[0].a : "";
    switch (kind) {
      case "howAreYou":
        return pick([
          `Good — long day, but the kind I chose. You?`,
          `Decent. Post-work, pre-dinner, mildly feral. How about you?`,
          `Fine, honestly. Better now that this is happening.`
        ]);
      case "job":
        return `${p.job}. ${pick([
          `Annoying parts, real parts, I like it.`,
          `Good days and days I'd hand to anyone.`,
          `It's more admin than people think.`,
          `Ask me on a bad day and you'll get a different answer.`
        ])}`;
      case "city":
        return mem.facts.city
          ? `${p.city}. You said ${mem.facts.city} — how far is that from me, realistically?`
          : `${p.city}. Whereabouts are you?`;
      case "age":
        return `${p.age}.`;
      case "intention":
        return `${p.intention}. ${pick([
          `Rather say it now than three weeks in.`,
          `I'm not going to pretend otherwise to seem chill.`,
          `That's the honest version, take it or leave it.`
        ])}`;
      case "name":
        return `${p.name}. Which you can see, but I appreciate the manners.`;
      case "apps":
        return pick([
          `Couple of months, on and off. I'm bad at the small talk part and good at the actual date part.`,
          `Long enough to know I'd rather meet than type for two weeks.`
        ]);
      case "weekend":
        return `Nothing locked in. ${first}`;
      case "school":
        return p.school ? `${p.school}. Feels like a different person went there.` : `Nowhere interesting.`;
      case "height":
        return `${p.height}. The most important fact about me, clearly.`;
      case "food":
        return p.voice.keywords.taco || p.voice.keywords.food || `Anything I didn't have to plan. I'm easy about food and picky about company.`;
      case "music":
        return p.voice.keywords.music || `Depends on the hour. I'll make you a playlist you'll pretend to like.`;
      case "movie":
        return p.voice.keywords.movie || `I rewatch the same four films instead of picking a new one. It's a flaw.`;
      case "pets":
        return p.voice.keywords.dog || `No pets, borrow other people's constantly.`;
      case "story":
        return `${p.job}, ${p.city}, ${p.age}. Beyond the resume: ${first.toLowerCase()}`;
      default:
        return "";
    }
  }

  function reactTo(p, text, mem, intent, thread) {
    const tone = (VOICE[p.id] || DEFAULT_VOICE).tone;
    const dry = tone === "dry" || tone === "quiet";

    if (intent === "joke") {
      return fresh(
        [
          dry ? `That's funny. Annoyingly.` : `Okay that got me.`,
          `I laughed out loud, which is embarrassing in public.`,
          `You're funnier than your profile let on.`
        ],
        thread
      );
    }
    if (intent === "compliment") {
      return fresh(
        [
          dry ? `Careful, I'll believe you.` : `That's a nice thing to say. I'm keeping it.`,
          `Okay, flattery noted and welcomed.`
        ],
        thread
      );
    }
    /* Only echo a fact back on the turn they actually said it. */
    const justSaid = mem.facts.job && String(text || "").toLowerCase().includes(mem.facts.job);
    if (intent === "answered" && justSaid) {
      return fresh(
        [
          `${mem.facts.job} — that tracks with how you type.`,
          `Okay, ${mem.facts.job}. So you're either very organised or barely holding it together.`
        ],
        thread
      );
    }
    return "";
  }

  /* One question per turn, and never two turns in a row. */
  function followUp(p, mem, thread) {
    const t = mem.topic;
    const byTopic = {
      hike: `What's your actual pace — talk the whole way, or silent and fast?`,
      coffee: `Where do you go when you want to sit for two hours and not be rushed?`,
      taco: `Okay but what's the order? Be specific.`,
      food: `Are you a cook or a menu-scholar?`,
      drink: `First round somewhere loud or somewhere we can hear each other?`,
      music: `What have you had on repeat this week? No curating.`,
      work: `Is it the good kind of busy or the kind you complain about?`,
      dog: `Photo. Immediately. I don't make the rules.`,
      movie: `What's the last thing you watched that you're still thinking about?`,
      plant: `Are they thriving or are you lying to yourself?`,
      travel: `Where were you happiest — not the prettiest, the happiest.`,
      run: `How early are we talking, and do you make it a personality?`,
      book: `What are you reading, and are you actually finishing it?`,
      sleep: `What kept you up? Fun reason or bad reason?`
    };
    const options = [
      t && byTopic[t],
      mem.facts.job && mem.turns >= 3 && `What's the part of ${mem.facts.job} nobody outside it understands?`,
      `What does a good Tuesday look like for you?`,
      `What are you into lately that you'd talk about for an hour?`,
      `What's something you did this week that you'd do again?`,
      `What's the last thing that genuinely annoyed you? Small and petty preferred.`
    ].filter(Boolean);
    const unasked = options.filter((o) => !mem.said.has(shape(o)));
    return unasked.length ? unasked[0] : pick(options);
  }

  function offerPlan(p, mem, thread, said) {
    const t = topicOf(said) || mem.topic || mem.anyTopic;
    if (t === "coffee") return `Coffee then. I know the place. Saturday morning?`;
    if (t === "hike") return `${p.city === "Austin" ? "Greenbelt" : "Some trail"}, early, before it's an oven. Sunday?`;
    if (t === "drink") return `One drink somewhere with a patio. Thursday?`;
    if (t === "food" || t === "taco") return `Dinner then. I'll pick, you veto. Friday?`;
    return fresh(
      [
        `Let's just do it — drink or a walk, this week. Which night is bad for you?`,
        `I'd rather meet than type. Thursday or Saturday?`,
        `Coffee this weekend. Low stakes, easy out if I'm a nightmare.`
      ],
      thread
    );
  }

  /* Emoji and exclamation belong on a reaction, not on an answer or an invitation. */
  function venue(p, mem, said) {
    const spot = {
      coffee: `There's a coffee place on the east side with a patio`,
      drink: `Small bar off Rainey, quiet enough to actually talk`,
      food: `Taco spot on South 1st, no line before 7`,
      taco: `Taco spot on South 1st, no line before 7`,
      hike: `Barton Creek trailhead, the shady side`,
      music: `That bar on Red River with the good back room`
    }[topicOf(said) || mem.topic || mem.anyTopic] || `A wine bar near me that isn't trying too hard`;
    const line = `${spot}. ${pick([`7ish?`, `Say 7, and text me if you're running late.`, `Around 7 — I'll grab the table.`])}`;
    /* Don't re-pitch a place already named. */
    if ([...mem.said].some((s) => s.startsWith(shape(spot).split(" ").slice(0, 3).join(" ")))) {
      return pick([`Same place I said. 7.`, `Same spot, 7. I'll get there first.`]);
    }
    return line;
  }

  function stylize(text, v, index) {
    let s = String(text || "").trim();
    if (!s) return s;
    const reaction = !index && !/\?$/.test(s);
    if (v.tone === "dry" || v.tone === "quiet" || v.tone === "thoughtful") {
      s = s.replace(/!+/g, ".");
    } else if (reaction && v.bang && /[.]$/.test(s) && chance(v.bang)) {
      s = s.replace(/\.$/, "!");
    }
    if (v.ellipsis && /[.]$/.test(s) && chance(v.ellipsis)) s = s.replace(/\.$/, "…");
    if (reaction && v.emoji && v.emojiRate && chance(v.emojiRate)) s = `${s} ${pick(v.emoji)}`;
    if (v.lower) s = s.toLowerCase();
    return s;
  }

  function converse(p, userText, thread) {
    const v = VOICE[p.id] || DEFAULT_VOICE;
    const mem = memory(thread);
    const intent = intentOf(userText, mem);
    const kind = askedWhat(userText);
    const canAsk = !mem.askedRecently;
    const lines = [];

    if (intent === "bye") {
      lines.push(fresh([`Night. This was a good one.`, `Go sleep. I'll be here, being charming later.`], thread));
      return { lines: lines.map((l) => stylize(l, v)) };
    }

    if (intent === "sexual") {
      lines.push(
        fresh(
          [
            `Bold opener. I'm going to pretend you're funny instead.`,
            `Slow down — buy me a drink and read a book first.`
          ],
          thread
        )
      );
      return { lines: lines.map((l) => stylize(l, v)) };
    }

    if (intent === "greet") {
      lines.push(fresh([`Hey you.`, `Hi — good, you made it.`, `Hey. You're the first decent conversation today.`], thread));
      if (canAsk) lines.push(fresh(DAY_ASKS, thread));
      return { lines: lines.map((l) => stylize(l, v)) };
    }

    if (intent === "bounce") {
      lines.push(answerOwn(p, mem, thread));
      return { lines: lines.map((l, i) => stylize(l, v, i)) };
    }

    if (intent === "logistics") {
      const day = (RE.day.exec(userText) || [])[0];
      const asksWhere = /\bwhere\b|\bwhat time\b|\bwhich place\b/i.test(userText);
      if (day) lines.push(`${day[0].toUpperCase()}${day.slice(1).toLowerCase()} it is.`);
      else if (!asksWhere) lines.push(`Okay, locked in.`);
      lines.push(venue(p, mem, userText));
      return { lines: lines.map((l, i) => stylize(l, v, i)) };
    }

    if (intent === "plans") {
      lines.push(
        fresh([`Yes. I was going to ask, you beat me to it.`, `Deal.`, `Finally, someone who just asks.`], thread)
      );
      lines.push(offerPlan(p, mem, thread, userText));
      return { lines: lines.map((l) => stylize(l, v)) };
    }

    /* A question is answered even when it arrives wrapped in a joke. */
    const asked = kind || (userText.includes("?") && RE.aboutThem.test(userText));
    if (intent === "flirt" && asked) {
      lines.push(flirtBack(p, mem, userText, thread));
      lines.push(
        answerFor(p, kind, mem) ||
          keywordAnswer(p, userText) ||
          fresh(
            [
              `And yes, obviously. Next question.`,
              `I'll neither confirm nor deny until you buy me something.`,
              `Depends how the date goes.`
            ],
            thread
          )
      );
      return { lines: lines.map((l, i) => stylize(l, v, i)) };
    }

    if (intent === "askMe" || intent === "question") {
      const a = answerFor(p, kind, mem) || keywordAnswer(p, userText) || `${p.prompts[0].a}`;
      lines.push(a);
      if (canAsk && !/\?$/.test(a) && chance(0.6)) lines.push(bounceBack(p, kind, mem, thread));
      return { lines: lines.map((l, i) => stylize(l, v, i)) };
    }

    if (intent === "flirt") {
      lines.push(flirtBack(p, mem, userText, thread));
      if (mem.turns >= 3 && !mem.planned && chance(0.5)) lines.push(offerPlan(p, mem, thread, userText));
      else if (canAsk && chance(0.4)) lines.push(followUp(p, mem, thread));
      return { lines: lines.map((l, i) => stylize(l, v, i)) };
    }

    if (intent === "lowEffort") {
      const flat = fresh([`That's all I get?`, `Okay, one word guy.`, `Hm. Give me something to work with.`], thread);
      lines.push(v.clip ? flat : `${flat}`);
      if (canAsk) lines.push(followUp(p, mem, thread));
      return { lines: lines.map((l) => stylize(l, v)) };
    }

    if (intent === "cool") {
      lines.push(fresh([`Fair enough. No pressure from me.`, `All good. I'd rather you say that than fake it.`], thread));
      return { lines: lines.map((l) => stylize(l, v)) };
    }

    if (intent === "thanks") {
      lines.push(fresh([`Anytime.`, `Of course.`], thread));
      return { lines: lines.map((l) => stylize(l, v)) };
    }

    /* Whatever they just said outranks anything remembered from earlier. */
    const topical = keywordAnswer(p, userText);
    const react = reactTo(p, userText, mem, intent, thread);
    if (react) lines.push(react);
    if (topical) lines.push(topical);
    if (!lines.length) lines.push(mirror(p, userText, mem, thread));

    if (canAsk && lines.length < 3 && chance(0.7)) lines.push(followUp(p, mem, thread));

    return { lines: lines.slice(0, chance(v.double) ? 3 : 2).map((l, i) => stylize(l, v, i)) };
  }

  /* They lobbed my own question back, so answer it. */
  function answerOwn(p, mem, thread) {
    const ask = (mem.lastAsk || "").toLowerCase();
    if (/day|going/.test(ask)) {
      return fresh(
        [
          `Long, but it's ending better than it started.`,
          `Mine was fine. Busy, then quiet, which is my preferred order.`,
          `Good, actually. Off work, on the couch, talking to you.`
        ],
        thread
      );
    }
    if (/looking for/.test(ask)) return `${p.intention}. Same question, same honesty.`;
    if (/tuesday|weeknight|week/.test(ask)) return p.prompts[1] ? p.prompts[1].a : `Quiet, usually. I like a slow evening.`;
    const topical = mem.anyTopic && SELF[mem.anyTopic];
    return topical || fresh([`Same, honestly. Low-key week, nothing exciting.`, `Not much either. That's why this is nice.`], thread);
  }

  function flirtBack(p, mem, userText, thread) {
    const heat = mem.turns >= 4;
    return fresh(
      [
        heat ? `You're going to make this very easy for me, aren't you.` : `Smooth. I'm choosing to be charmed.`,
        chance(0.3) ? `"${quote(userText)}" — noted, filed, reread.` : `That worked, and I'm annoyed it worked.`,
        heat ? `Keep talking like that and I'll clear my Thursday.` : `You're doing a bit and it's landing.`,
        `Okay, confident. I'm into it.`
      ],
      thread
    );
  }

  /* Said in their own words when a question lands outside the profile's keywords.
     Better a plausible answer than a prompt pasted in as a non-answer. */
  const SELF = {
    coffee: `Iced americano, extra shot, regardless of the weather. I'm not proud of it.`,
    taco: `Migas, corn tortilla, too much salsa. I have opinions about the salsa.`,
    food: `I cook about four things well and order the rest.`,
    drink: `Something with gin, or a beer if the place is loud.`,
    music: `Whatever's been on repeat that week. Right now it's embarrassing and I'll still play it for you.`,
    movie: `I rewatch the same few instead of starting something new. It's a flaw.`,
    hike: `Slow, talkative, stops for every dog and viewpoint.`,
    dog: `No dog, and I say hello to every single one. It's a problem.`,
    work: `Busy in the normal way. It pays for the fun parts.`,
    book: `Two started, one finished, that's my average.`,
    run: `Three times a week if I'm being honest, five if I'm lying.`,
    travel: `Anywhere I can walk all day and eat badly.`,
    plant: `Alive, mostly. One is thriving out of spite.`,
    sleep: `Late, and I regret it every morning at six.`
  };

  function keywordAnswer(p, text) {
    const t = String(text || "").toLowerCase();
    const entries = Object.entries(p.voice.keywords || {});
    const hit = entries.find(([k]) => t.includes(k));
    if (hit) return hit[1];
    const topic = topicOf(text);
    if (!topic) return "";
    const byTopic = entries.find(([k]) => k === topic);
    return byTopic ? byTopic[1] : SELF[topic] || "";
  }

  function bounceBack(p, kind, mem, thread) {
    if (kind === "job" && !mem.facts.job) return `What about you — what do you do all day?`;
    if (kind === "city" && !mem.facts.city) return `Where are you?`;
    if (kind === "howAreYou") return `And you? Real answer, not "good."`;
    if (kind === "intention") return `What are you looking for? Same honesty rules.`;
    return followUp(p, mem, thread);
  }

  /* Nothing matched: engage with the substance of what they said. */
  function mirror(p, userText, mem, thread) {
    const words = norm(userText).split(" ").filter(Boolean);
    if (words.length <= 3) return fresh([`Say more.`, `Go on…`], thread);

    /* Enthusiasm deserves curiosity, not a compliment on their answer. */
    if (/\b(unreal|amazing|incredible|so good|the best|insane|fire|delicious|obsessed)\b/i.test(userText)) {
      const t = topicOf(userText);
      if (t === "food") return fresh([`Where? Name it, I'm going this week.`, `Okay, I need the name and your order.`], thread);
      if (t === "music") return fresh([`Send it to me. I'll actually listen.`, `Who? I'll have it on by tonight.`], thread);
      if (t === "movie") return fresh([`Adding it. Was it good-good or just fun?`, `Okay, that's on the list.`], thread);
    }
    return fresh(
      [
        `Okay, that's a better answer than most.`,
        `See, that's the kind of thing I wanted to know.`,
        `I like that you actually answered instead of doing the app thing.`,
        `Noted. You're more interesting than your prompts, no offence to your prompts.`,
        `"${quote(userText)}" — okay, you have my attention.`,
        `Right, and now I have follow-up questions I'm saving for in person.`,
        `That's a good detail. People usually give me the boring version.`
      ],
      thread
    );
  }

  global.latchConverse = converse;
  global.latchPick = pick;
})(window);
