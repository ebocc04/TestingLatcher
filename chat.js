/* Conversation engine.

   Every reply is planned against the whole thread, not the last message. Before
   answering we re-read the conversation: what you've told this person, what they
   already told you, which of your questions they still owe an answer to, what's
   been agreed about meeting up, and how much energy you're bringing. Only then do
   we choose moves (answer / react / disclose / offer / ask).

   The rules that keep it from reading like a bot:
     - a question always gets a real answer, including one you asked two messages ago
     - nothing already said in this thread gets said again
     - one question per turn, never two turns running, never right after they asked one
     - no praising your message instead of engaging with it, and never quoting you back
     - line choice is seeded on the state of the thread, so a reply is reproducible
       rather than a fresh dice roll every render

   Voice is applied last as a fixed per-person transform, so a match always texts
   with the same casing, punctuation and emoji habits. */
(function (global) {
  const VOICE = {
    maya: { tone: "playful", bang: 0.35, emoji: ["🙂"], emojiRate: 0.12 },
    jordan: { tone: "dry", bang: 0, clip: true },
    priya: { tone: "warm", bang: 0.5, emoji: ["😂", "🙂"], emojiRate: 0.2 },
    leo: { tone: "thoughtful", bang: 0.1 },
    nina: { tone: "playful", lower: true, bang: 0.3, emoji: ["😭", "🙃"], emojiRate: 0.28, clip: true },
    andre: { tone: "direct", bang: 0.25, clip: true },
    sofia: { tone: "thoughtful", bang: 0.05 },
    kai: { tone: "easy", lower: true, bang: 0.2, emoji: ["🙂"], emojiRate: 0.1 },
    elena: { tone: "grounded", bang: 0.15 },
    omar: { tone: "direct", bang: 0.4, clip: true },
    avery: { tone: "witty", bang: 0.2 },
    mateo: { tone: "thoughtful", bang: 0.1 },
    hana: { tone: "soft", bang: 0.3, emoji: ["🌷", "🙂"], emojiRate: 0.3, ellipsis: 0.3 },
    devon: { tone: "dry", bang: 0.1 },
    luca: { tone: "quiet", lower: true, bang: 0.05, ellipsis: 0.35, clip: true },
    sasha: { tone: "warm", bang: 0.35, emoji: ["🙂"], emojiRate: 0.12 }
  };

  const DEFAULT_VOICE = { tone: "warm", bang: 0.25 };

  /* p.style holds per-person overrides from the admin sheet. Empty strings mean
     "keep the original", so they're stripped before merging. */
  function voiceOf(p) {
    const base = VOICE[p.id] || DEFAULT_VOICE;
    if (!p.style) return base;
    const over = {};
    Object.entries(p.style).forEach(([k, val]) => {
      if (val !== "" && val !== undefined && val !== null) over[k] = val;
    });
    const merged = { ...base, ...over };
    if (over.emojiRate !== undefined && !merged.emoji) merged.emoji = ["🙂"];
    return merged;
  }

  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const shape = (s) => norm(s).split(" ").slice(0, 5).join(" ");
  const words = (s) => norm(s).split(" ").filter(Boolean);

  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /* Deterministic on the state of the thread: the same conversation always gets the
     same reply, so a match reads as consistent instead of randomised. Anything this
     person already said in this thread drops out of the pool. */
  function choose(options, ctx, salt) {
    const pool = options.filter(Boolean);
    if (!pool.length) return "";
    const open = pool.filter((o) => !ctx.said.has(shape(o)));
    const use = open.length ? open : pool;
    return use[hash(`${ctx.key}|${salt}`) % use.length];
  }

  const roll = (ctx, salt, p) => hash(`${ctx.key}|${salt}`) % 100 < Math.round(p * 100);

  /* ---------- what counts as what ---------- */

  const GENDERS = [
    ["women", /\b(women|woman|girls?|female|females|ladies|lady|chicks?)\b/i],
    ["men", /\b(men|man|guys?|male|males|dudes?|boys?)\b/i],
    ["nonbinary", /\b(non-?binary|nb|enby)\b/i]
  ];

  const genderIn = (text) => (GENDERS.find(([, re]) => re.test(text || "")) || [""])[0];

  const ORIENT_LABEL = {
    straight: "straight",
    gay: "gay",
    lesbian: "a lesbian",
    bisexual: "bi",
    pansexual: "pan",
    queer: "queer"
  };

  function attractedTo(p) {
    const o = String(p.orientation || "").toLowerCase();
    if (o === "straight") return new Set([p.gender === "men" ? "women" : "men"]);
    if (o === "gay") return new Set([p.gender === "women" ? "women" : "men"]);
    if (o === "lesbian") return new Set(["women"]);
    return new Set(["women", "men", "nonbinary"]);
  }

  const RE = {
    greet: /^(hey+|hi+|hello|yo|sup|howdy|what'?s up|whats up|morning|good morning|evening)\b/i,
    bye: /\b(goodnight|good ?night|gtg|got to go|gotta go|talk later|talk tomorrow|heading out|i'?m out|ttyl)\b|\bnight[.!\s]*$/i,
    lowEffort: /^(k|ok|okay|kk|lol|lmao|haha+|hah|nice|cool|word|same|true|fr|fair|yeah|yep|yup|sure|nothing much|nm|hbu|wbu)[.!?]*$/i,
    plans: /\b(hang out|hangout|meet up|link up|free (this|on|next|tonight|tomorrow)|this weekend|when are you free)\b|\b(we should|let'?s|wanna|want to|down to|up for)\b[^.?!]{0,24}\b(grab|get|do|try|hit|go|meet|see)\b|\b(grab|get)\b[^.?!]{0,12}\b(drinks?|coffee|dinner|lunch|food|bite|tacos?|beer)\b/i,
    flirt: /\b(cute|hot|sexy|beautiful|gorgeous|handsome|adorable|smooth|charming|into you|crush|kiss|flirt|dangerous|trouble|out of my league|marry|my type|your type)\b/i,
    tease: /\b(or nah|or what|sure about that|bold|confident|allegedly|prove it|says you)\b|\bare you the\b/i,
    joke: /(\b(haha+|hah|lol|lmao|lmfao|jk|kidding|joking|dying|deceased|screaming)\b|💀|😂|🤣|😭)/i,
    compliment: /\b(you seem|you'?re (funny|cool|sweet|interesting|smart|great|the best)|i like (you|your)|good (answer|taste|point)|well played)\b/i,
    negative: /\b(not really|nah|no thanks|not interested|meh|i'?m good|maybe not|too busy|don'?t think so)\b/i,
    sexual: /\b(nudes|nude|sex|hookup|hook up|dtf|netflix and chill|in bed|naked|smash)\b/i,
    thanks: /\b(thank you|thanks|ty|appreciate it)\b/i,
    aboutThem: /\b(you|your|u|ur|yours)\b/i,
    day: /\b(mon|tues|wednes|thurs|fri|satur|sun)day\b|\btonight\b|\btomorrow\b/i,
    impliedQ: /\b(do|did|are|is|can|could|would|have|whats|what'?s|hows|how'?s)\s+(you|u|ur|your)\b/i,
    confirm: /\b(works|works for me|sounds good|i'?m free|let'?s do|down for|deal|perfect|see you then|what time|where at|where should we|where do you want|which place)\b/i,
    /* "you?" hands my question back to me. "are you?" is still aimed at me — those
       need opposite answers, so they're matched separately. */
    nudgeAsk: /^(so |well |and )?(are|do|did|is|have|can|would|will)\s+(you|u)\s*\??$/i,
    nudge: /^(and )?(you|u|hbu|wbu|yourself|so|well|and|but)\s*\??$|^\?+$/i,
    eitherOr: /\b([a-z]{3,})\s+or\s+([a-z]{3,})\b/i,
    /* "lol what?" is not a question about me, it's a request to explain myself. */
    confused: /^(lol |lmao |haha |wait |uh |um |huh )*(what|huh|wdym|what do you mean|come again|you what|sorry)[?.!]*$/i,
    yesNo: /^(do|did|does|are|is|was|were|have|has|had|can|could|would|will|should|you telling me|dont you|don'?t you|didn'?t you|aren'?t you)\b/i,
    neverTried: /\bnever\s+(tried|been|had|done|seen)\b|\bnever tried\b/i
  };

  /* A question, however it's punctuated. Order matters: first match wins. */
  const QUESTIONS = [
    [
      "orientation",
      /\b(are|r) (you|u) (bi|bisexual|straight|gay|lesbian|queer|pan)\b|\b(you|u|ur|your|you'?re|youre)\b[^.?!]{0,24}\b(into|like|likes|date|dating|attracted to|go for)\b[^.?!]{0,16}\b(women|woman|men|man|girls?|guys?|dudes?|boys?|ladies|non-?binary|nb)\b|\byour (sexuality|orientation)\b|\bwhich way do you\b/i
    ],
    ["type", /\b(my|i'?m your|am i your) type\b|\bwhat'?s your type\b|\bwhat are you into\b/i],
    ["howAreYou", /\bhow (are|r) (you|u)\b|\bhow'?s it going\b|\bhow (was|is) your day\b|\bhow you doing\b/i],
    ["job", /\bwhat do you do\b|\byour job\b|\bwhat'?s your job\b|\bfor a living\b|\bwhere do you work\b/i],
    ["city", /\bwhere (do you|you) live\b|\bwhere are you (from|based)\b|\bwhat part of town\b/i],
    ["age", /\bhow old\b|\byour age\b/i],
    ["intention", /\bwhat are you looking for\b|\bhere for\b|\bserious or\b|\bwhat do you want\b/i],
    ["name", /\bwhat'?s your name\b|\byour name\b/i],
    ["apps", /\bhow (long|many).*(hinge|app|apps|here)\b|\bnew (to|on) (this|hinge|apps)\b/i],
    ["weekend", /\bweekend\b.*\?|\bwhat are you up to\b|\bplans (this|for)\b/i],
    ["school", /\b(where did you|did you) (go to school|study)\b|\byour school\b|\bcollege\b/i],
    ["height", /\bhow tall\b|\byour height\b/i],
    ["food", /\b(favou?rite|favorite) (food|restaurant|place to eat)\b|\bbest taco\b/i],
    ["music", /\b(favou?rite|favorite) (music|band|artist|album|song)\b|\bwhat do you listen to\b/i],
    ["movie", /\b(favou?rite|favorite) (movie|film|show)\b|\bwhat do you watch\b/i],
    ["pets", /\bpets?\b|\bdo you have a (dog|cat)\b/i],
    ["story", /\bwhat'?s your (deal|story)\b|\btell me about you\b|\byourself\b/i]
  ];

  function askedWhat(text) {
    const t = String(text || "");
    /* "I'm into women" is them telling me about themselves, not asking. */
    const hit = QUESTIONS.find(([, re]) => re.test(t));
    return hit ? hit[0] : "";
  }

  const TOPICS = [
    ["hike", /\b(hik(e|ing)|trail|greenbelt|outdoors?|camp(ing)?|backpack)\b/i],
    ["coffee", /\b(coffee|latte|espresso|cafe|cold brew)\b/i],
    ["taco", /\b(taco|tacos|breakfast taco)\b/i],
    ["food", /\b(dinner|lunch|cook(ing)?|food|restaurant|eat|pizza|dumpling|pastry|dessert|bbq|ramen|sushi|noodles?|burger|brunch|bakery|menu|cookie|croissant)\b/i],
    ["drink", /\b(beer|wine|whiskey|negroni|cocktail|bar|brewery)\b/i],
    ["music", /\b(music|band|album|song|vinyl|record|concert|playlist|guitar)\b/i],
    ["work", /\b(work|job|shift|office|startup|deadline|meeting|client|code|coding|engineer)\b/i],
    ["dog", /\b(dog|puppy|rescue|cat)\b/i],
    ["movie", /\b(movie|film|show|series|watching)\b/i],
    ["plant", /\b(plant|flower|garden|tomato)\b/i],
    ["travel", /\b(travel|trip|flight|abroad|vacation)\b/i],
    ["run", /\b(run(ning)?|gym|lift|climb(ing)?|yoga|bike|basketball|soccer)\b/i],
    ["book", /\b(book|reading|novel|author)\b/i],
    ["sleep", /\b(tired|sleep|nap|exhausted|insomnia)\b/i]
  ];

  const topicOf = (text) => (TOPICS.find(([, re]) => re.test(text || "")) || [""])[0];

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

  /* Does this line of mine actually answer that kind of question? Used to work out
     what I still owe them, so "are you?" two messages later lands correctly. */
  function answers(p, kind, text) {
    const t = String(text || "").toLowerCase();
    switch (kind) {
      case "orientation":
        return /\b(bi|bisexual|straight|gay|lesbian|queer|pan)\b/.test(t) || /\bincluded\b/.test(t);
      case "type":
        return /\btype\b|\bincluded\b|\binto\b/.test(t);
      case "job":
        return words(p.job).some((w) => w.length > 3 && t.includes(w));
      case "city":
        return t.includes(String(p.city).toLowerCase());
      case "age":
        return t.includes(String(p.age));
      case "height":
        return t.includes(String(p.height).replace(/["']/g, "").slice(0, 1));
      case "school":
        return !p.school || t.includes(String(p.school).toLowerCase());
      case "intention":
        return t.includes(String(p.intention).toLowerCase().slice(0, 14));
      default:
        /* No signature to check: assume the reply dealt with it rather than nagging. */
        return true;
    }
  }

  /* ---------- reading the whole thread ---------- */

  function readThread(p, thread, userText, me) {
    const all = (thread || []).filter((m) => m && m.text);
    /* app.js appends your message before asking for a reply; don't count it twice. */
    const history = all.length && all[all.length - 1].from === "me" && all[all.length - 1].text === userText ? all.slice(0, -1) : all;
    const mine = history.filter((m) => m.from === "me");
    const theirs = history.filter((m) => m.from === "them");
    const myText = mine.map((m) => m.text).concat(userText || "").join("\n");

    const ctx = {
      key: `${p.id}:${history.length}`,
      me: me || null,
      turns: mine.length + 1,
      said: new Set(theirs.map((m) => shape(m.text))),
      theirs,
      facts: {},
      answeredKinds: new Set(),
      pendingAsk: ""
    };

    let hit;
    if ((hit = /\bi(?:'m| am|m)\s+(?:a|an)\s+((?:[a-z\-]+ ?){1,3})/i.exec(myText)) && !ADJ_STOP.test(hit[1])) {
      ctx.facts.job = phrase(hit[1]);
    }
    if ((hit = /\bi\s+work\s+(?:as|at|in|for)\s+(?:a |an |the )?((?:[a-z\-]+ ?){1,3})/i.exec(myText))) {
      ctx.facts.job = ctx.facts.job || phrase(hit[1]);
    }
    if ((hit = /\bi\s+live\s+in\s+([a-z][a-z \-]{2,20})/i.exec(myText))) ctx.facts.city = hit[1].trim();
    const likes = [...myText.matchAll(/\bi\s+(?:really\s+)?(?:love|like|am into|'m into)\s+((?:[a-z\-]+ ?){1,3})/gi)]
      .map((x) => phrase(x[1]))
      .filter((x) => x && !ADJ_STOP.test(x));
    if (likes.length) ctx.facts.like = likes[likes.length - 1];

    /* Topics in order, so the bot can pick up something from earlier instead of only
       reacting to the last line. */
    ctx.topic = topicOf(userText);
    ctx.history = mine
      .map((m) => topicOf(m.text))
      .filter(Boolean)
      .filter((t) => t !== ctx.topic);
    ctx.earlier = ctx.history.length ? ctx.history[ctx.history.length - 1] : "";
    ctx.anyTopic = ctx.topic || ctx.earlier;

    /* Every question of theirs, and whether any of my later lines actually answered
       it. The most recent unanswered one is what "are you?" refers to. */
    let pending = "";
    history.forEach((m, i) => {
      if (m.from !== "me") return;
      const kind = askedWhat(m.text);
      if (!kind) return;
      ctx.lastAskKind = kind;
      const replied = history.slice(i + 1, i + 4).filter((x) => x.from === "them");
      if (replied.some((x) => answers(p, kind, x.text))) ctx.answeredKinds.add(kind);
      else pending = kind;
    });
    ctx.pendingAsk = pending;

    const lastTheirs = theirs.length ? theirs[theirs.length - 1].text : "";
    /* "Croissant or cookie." is a question with a full stop on it. */
    ctx.eitherOr = RE.eitherOr.exec(lastTheirs);
    ctx.botAskedLast = /\?/.test(lastTheirs) || !!ctx.eitherOr;
    ctx.botAsk = ctx.botAskedLast ? lastTheirs : "";
    ctx.askedRecently = theirs.slice(-2).some((m) => m.text.includes("?"));

    /* Match their energy: short texters get short replies. */
    const lens = mine.concat([{ text: userText || "" }]).map((m) => String(m.text).length);
    ctx.avgLen = lens.reduce((a, b) => a + b, 0) / (lens.length || 1);
    ctx.brief = ctx.avgLen < 26;
    ctx.flirtLevel = mine.filter((m) => RE.flirt.test(m.text)).length + (RE.flirt.test(userText || "") ? 1 : 0);

    /* A plan exists once a day or a time has been floated by either of us. */
    const planText = history.map((m) => m.text).join("\n");
    ctx.planned = /\b(mon|tues|wednes|thurs|fri|satur|sun)day\b|\btonight\b|\btomorrow\b|\bthis week\b|\bweekend\b|\d\s?(ish|pm)/i.test(planText);
    ctx.venueSet = theirs.some((m) => /\b(place|spot|bar|trailhead|patio|table)\b/i.test(m.text));
    ctx.stage = ctx.turns <= 1 ? "open" : ctx.turns <= 4 ? "warming" : "flowing";
    return ctx;
  }

  /* ---------- intent ---------- */

  function classify(text, ctx) {
    const t = String(text || "").trim();
    if (RE.bye.test(t)) return "bye";
    if (RE.sexual.test(t)) return "sexual";
    if (RE.confused.test(t)) return "confused";
    /* A nudge means: answer the thing I already asked you. */
    if (RE.nudgeAsk.test(t)) return ctx.pendingAsk ? "pending" : "reaffirm";
    if (RE.nudge.test(t) && ctx.pendingAsk) return "pending";
    if (askedWhat(t)) return "asked";
    /* "friday works" is logistics whether or not a day was named before. */
    if ((ctx.planned || RE.confirm.test(t)) && (RE.day.test(t) || RE.confirm.test(t))) return "logistics";
    if (ctx.planned && RE.plans.test(t)) return "logistics";
    if (RE.plans.test(t)) return "plans";
    if (RE.nudge.test(t)) return "bounce";
    if (RE.lowEffort.test(t)) return "lowEffort";
    if (RE.greet.test(t) && t.length < 24 && ctx.turns <= 1) return "greet";
    if (t.includes("?") || RE.impliedQ.test(t)) return "asked";
    if (RE.tease.test(t) || RE.flirt.test(t)) return "flirt";
    if (RE.compliment.test(t)) return "compliment";
    if (RE.joke.test(t)) return "joke";
    if (RE.negative.test(t)) return "cool";
    if (RE.thanks.test(t)) return "thanks";
    if (ctx.botAskedLast) return "answered";
    return "statement";
  }

  /* ---------- answers ---------- */

  function orientationAnswer(p, ctx, text) {
    const label = ORIENT_LABEL[String(p.orientation).toLowerCase()] || String(p.orientation);
    const set = attractedTo(p);
    const target = genderIn(text) || (ctx.me && ctx.me.gender) || "";
    const repeat = ctx.answeredKinds.has("orientation");

    if (target && set.has(target)) {
      if (repeat) return choose([`Still ${label}. Still yes.`, `Asked and answered — ${label}, ${target} included.`], ctx, "orient-rep");
      return choose(
        [
          `${label[0].toUpperCase()}${label.slice(1)}, so yes — ${target} very much included.`,
          `I'm ${label}. ${target[0].toUpperCase()}${target.slice(1)} are the reason I'm on here.`,
          `Yes. ${label[0].toUpperCase()}${label.slice(1)}, and you're asking the right question.`
        ],
        ctx,
        "orient-yes"
      );
    }
    if (target) {
      const mine = [...set][0];
      /* Asking "and you?" straight after turning someone down is not a good look. */
      ctx.turnedDown = true;
      return choose(
        [`I'm ${label}, so ${mine} — sorry to be the one to say it.`, `${label[0].toUpperCase()}${label.slice(1)}, so it's ${mine} for me.`],
        ctx,
        "orient-no"
      );
    }
    return `I'm ${label}. Not a subtle profile, that one.`;
  }

  function typeAnswer(p, ctx) {
    const g = ctx.me && ctx.me.gender;
    const set = attractedTo(p);
    const yes = g && set.has(g);
    return choose(
      [
        yes ? `On paper, very. In practice you keep talking like this and it's not close.` : `Honestly? Not the usual, but I'm not precious about it.`,
        `My type is whoever answers a question properly. You're doing fine.`,
        `Funny, sharp, does what they said they'd do. So far, yes.`
      ],
      ctx,
      "type"
    );
  }

  function answerFor(p, kind, ctx, text) {
    const first = p.prompts[0] ? p.prompts[0].a : "";
    switch (kind) {
      case "orientation":
        return orientationAnswer(p, ctx, text);
      case "type":
        return typeAnswer(p, ctx);
      case "howAreYou":
        return choose(
          [
            `Good — long day, but the kind I chose. You?`,
            `Decent. Post-work, pre-dinner, mildly feral. How about you?`,
            `Fine, honestly. Better now that this is happening.`
          ],
          ctx,
          "how"
        );
      case "job":
        return `${p.job}. ${choose(
          [`Annoying parts, real parts, I like it.`, `Good days and days I'd hand to anyone.`, `It's more admin than people think.`],
          ctx,
          "job"
        )}`;
      case "city":
        return ctx.facts.city ? `${p.city}. You said ${ctx.facts.city} — how far is that, realistically?` : `${p.city}. Whereabouts are you?`;
      case "age":
        return `${p.age}.`;
      case "intention":
        return `${p.intention}. ${choose(
          [`Rather say it now than three weeks in.`, `I'm not going to pretend otherwise to seem chill.`],
          ctx,
          "intent"
        )}`;
      case "name":
        return `${p.name}. Which you can see, but I appreciate the manners.`;
      case "apps":
        return choose(
          [
            `Couple of months, on and off. Bad at the small talk part, good at the actual date part.`,
            `Long enough to know I'd rather meet than type for two weeks.`
          ],
          ctx,
          "apps"
        );
      case "weekend":
        return `Nothing locked in. ${first}`;
      case "school":
        return p.school ? `${p.school}. Feels like a different person went there.` : `Nowhere interesting.`;
      case "height":
        return `${p.height}. The most important fact about me, clearly.`;
      case "food":
        return p.voice.keywords.taco || p.voice.keywords.food || SELF.food;
      case "music":
        return p.voice.keywords.music || SELF.music;
      case "movie":
        return p.voice.keywords.movie || SELF.movie;
      case "pets":
        return p.voice.keywords.dog || SELF.dog;
      case "story":
        return `${p.job}, ${p.city}, ${p.age}. Beyond the resume: ${first.toLowerCase()}`;
      default:
        return "";
    }
  }

  /* Said in their own words when a question lands outside the profile's keywords —
     a plausible answer beats pasting a prompt in as a non-answer. */
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
    run: `Three times a week if I'm honest, five if I'm lying.`,
    travel: `Anywhere I can walk all day and eat badly.`,
    plant: `Alive, mostly. One is thriving out of spite.`,
    sleep: `Late, and I regret it every morning at six.`
  };

  /* Profile keywords, matched on whole words so "are you" can't trip a "bar" entry. */
  function keywordAnswer(p, text) {
    const t = String(text || "");
    const entries = Object.entries((p.voice && p.voice.keywords) || {});
    const hit = entries.find(([k]) => new RegExp(`\\b${k.replace(/[^a-z0-9]/gi, "")}\\w*\\b`, "i").test(t));
    if (hit) return hit[1];
    const topic = topicOf(t);
    if (!topic) return "";
    const byTopic = entries.find(([k]) => k === topic);
    return byTopic ? byTopic[1] : SELF[topic] || "";
  }

  /* Volunteer something when they've asked me to share — "you?", "hbu". Prompt answers
     are deliberately excluded: pasted out of context they read like a brochure, which
     is how a bot gives itself away. */
  function disclose(p, ctx) {
    const topical = ctx.anyTopic && SELF[ctx.anyTopic];
    return (
      topical ||
      choose([`Quiet week, honestly. Work, gym, too much of my phone.`, `Not much — which is why this is the best part of my night.`], ctx, "disclose")
    );
  }

  /* They asked something I can't parse. Answer like a person: commit to something
     light, or admit I need more. Anything is better than reciting a fact about myself. */
  function genericAnswer(p, ctx, text) {
    if (RE.neverTried.test(text)) {
      return choose([`Never properly. You offering to teach me?`, `Nope. Judge me, it's fine.`], ctx, "never");
    }
    if (RE.yesNo.test(String(text).trim())) {
      return choose(
        [`Depends on the day, honestly.`, `Ha — yes. I'm not that mysterious.`, `Not really, no. Should I be?`],
        ctx,
        "yesno"
      );
    }
    return choose([`Say more — I want to answer that properly.`, `That's a bigger question than you meant it to be.`], ctx, "vague");
  }

  /* "lol what?" — explain myself instead of changing the subject. */
  function clarify(p, ctx) {
    if (ctx.eitherOr) {
      return `The ${ctx.eitherOr[1]} or ${ctx.eitherOr[2]} thing. Pick one, it's a real question.`;
    }
    if (ctx.anyTopic) return `The ${ctx.anyTopic} thing. I stand by it, but I hear myself.`;
    return choose([`Ignore me, I'm being weird. How's your night going?`, `That made more sense in my head. Moving on.`], ctx, "clarify");
  }

  /* They answered my question and there's no fact or topic to grab — respond to how
     they said it. Numbers, absolutes and hedges are all worth a comment. */
  function reactToShape(ctx, text) {
    const pct = /(\d{1,3}(?:\.\d+)?)\s?%/.exec(text);
    if (pct) {
      const n = Number(pct[1]);
      if (n > 0 && n < 100) {
        const rest = Math.round((100 - n) * 100) / 100;
        return `That ${rest}% is doing a lot of work in that sentence.`;
      }
      return `${pct[0]}. No notes, that's commitment.`;
    }
    if (/\b(always|never|every time|100)\b/i.test(text)) return choose([`Absolutes. Bold of you.`, `No hedging at all. I respect it.`], ctx, "abs");
    if (/\b(mostly|kinda|kind of|sometimes|i guess|usually|depends)\b/i.test(text)) {
      return choose([`That's a diplomatic way to put it.`, `"Mostly." Okay, I'll allow it.`], ctx, "hedge");
    }
    if (genderIn(text)) return choose([`Noted, and good — that was the actual question.`, `Right answer.`], ctx, "gender-ack");
    return "";
  }

  const FOLLOW_UP = {
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

  /* When they tell me something, respond to what they said. Answering with my own
     taste in tacos — the SELF lines above — only makes sense if they asked. */
  const REACT = {
    work: [`That's not a week, that's a hostage situation.`, `A client who keeps changing his mind is its own genre of tired.`],
    hike: [`A trail on a Sunday is the reset button. Jealous.`, `Outside fixes about 60% of things, I'm convinced.`],
    coffee: [`Correct order of operations for a day, honestly.`, `I respect a person with a coffee routine.`],
    taco: [`Now I'm hungry and it's entirely your fault.`, `Dangerous topic to bring up with me.`],
    food: [`Now I'm hungry and it's entirely your fault.`, `That's the kind of detail I actually wanted.`],
    drink: [`Noted for later, obviously.`, `That's a good order. You pass.`],
    music: [`Okay, that says more about you than your prompts do.`, `I'd have guessed something worse, no offence.`],
    dog: [`Immediate yes from me. Dogs first, everything else after.`, `You're going to send a photo eventually, I can feel it.`],
    movie: [`Adding it to the list I never get through.`, `Good — I need something to watch that isn't the same four films.`],
    plant: [`Keeping things alive counts as a personality trait, I've decided.`, `Impressive. Mine survive on neglect and luck.`],
    travel: [`Okay, that's a good answer. Where next?`, `That's the kind of trip I'd actually take.`],
    run: [`Genuinely impressive, and slightly annoying.`, `That's more discipline than I've got this month.`],
    book: [`I'm stealing that recommendation.`, `Two started, one finished — that's my average, so respect.`],
    sleep: [`Rough. Sleep is the one thing I refuse to negotiate on.`, `That's a bad trade and you know it.`]
  };

  function reactToStatement(p, ctx, text) {
    /* A fact about them beats a topic reaction — people notice when you catch it. */
    const f = ctx.facts;
    const low = String(text).toLowerCase();
    /* Them naming what they want deserves an answer in kind, not a joke about food. */
    if (/\bi (just )?want\b|\bi'?m looking for\b|\bi need someone\b|\bmy type is\b/i.test(text)) {
      return choose(
        [`${p.intention}, so we're reading from the same page.`, `That's a low bar and somehow still rare. I'm in.`],
        ctx,
        "wants"
      );
    }
    if (f.job && low.includes(f.job)) {
      return choose(
        [`${f.job[0].toUpperCase()}${f.job.slice(1)} — that tracks with how you type.`, `Okay, ${f.job}. Organised, or barely holding it together?`],
        ctx,
        "job-react"
      );
    }
    if (f.city && low.includes(f.city.toLowerCase())) return `${f.city}. That's close enough to be dangerous.`;
    if (f.like && low.includes(f.like)) return `${f.like[0].toUpperCase()}${f.like.slice(1)} — okay, tell me how that started.`;
    if (/\b(unreal|amazing|incredible|so good|the best|insane|fire|delicious|obsessed)\b/i.test(text)) {
      const t = topicOf(text);
      if (t === "food" || t === "taco") return `Where? Name it, I'm going this week.`;
      if (t === "music") return `Send it to me. I'll actually listen.`;
      if (t === "movie") return `Adding it. Was it good-good or just fun?`;
    }
    const t = topicOf(text);
    return t && REACT[t] ? choose(REACT[t], ctx, `react-${t}`) : "";
  }

  /* They lobbed my own question back at me, so answer it. */
  function answerOwn(p, ctx) {
    const ask = (ctx.botAsk || "").toLowerCase();
    if (ctx.eitherOr) {
      const a = ctx.eitherOr[1];
      const b = ctx.eitherOr[2];
      return `${a[0].toUpperCase()}${a.slice(1)}, obviously. ${b[0].toUpperCase()}${b.slice(1)} is for people with something to prove.`;
    }
    if (/day|going/.test(ask)) {
      return choose(
        [`Long, but it's ending better than it started.`, `Busy, then quiet, which is my preferred order.`],
        ctx,
        "own-day"
      );
    }
    if (/looking for/.test(ask)) return `${p.intention}. Same question, same honesty.`;
    if (/tuesday|weeknight|week/.test(ask)) return p.prompts[1] ? p.prompts[1].a : `Quiet, usually. I like a slow evening.`;
    return (ctx.anyTopic && SELF[ctx.anyTopic]) || disclose(p, ctx);
  }

  /* They're pushing for an answer I already gave. Don't re-answer from scratch. */
  function reaffirm(p, ctx) {
    const kind = ctx.lastAskKind;
    if (kind === "orientation" || kind === "type") {
      const label = ORIENT_LABEL[String(p.orientation).toLowerCase()] || p.orientation;
      return choose([`Yes — ${label}, like I said. You're allowed to relax.`, `I did answer. ${label[0].toUpperCase()}${label.slice(1)}, and interested.`], ctx, "reaff");
    }
    if (kind) return `I did answer that. Ask me a harder one.`;
    return "";
  }

  /* Asked a factual question, answered it, and don't know their version yet — the
     natural move is to hand the same question straight back. */
  function reciprocal(kind, ctx) {
    if (ctx.answeredKinds.has(kind)) return "";
    if (kind === "age") return `You? Ballpark is fine.`;
    if (kind === "job" && !ctx.facts.job) return `What about you — what do you do all day?`;
    if (kind === "city" && !ctx.facts.city) return `Whereabouts are you?`;
    if (kind === "intention") return `What are you looking for? Same honesty rules.`;
    if (kind === "orientation" || kind === "type") return ctx.turnedDown ? "" : `You?`;
    if (kind === "howAreYou") return `And you? Real answer, not "good."`;
    return "";
  }

  function followUp(p, ctx) {
    /* Calling back to something from earlier is what makes it feel like one
       conversation rather than sixteen unrelated turns. */
    const callback =
      ctx.stage === "flowing" && ctx.earlier && FOLLOW_UP[ctx.earlier] ? FOLLOW_UP[ctx.earlier] : "";
    return choose(
      [
        ctx.topic && FOLLOW_UP[ctx.topic],
        callback,
        ctx.facts.job && ctx.turns >= 3 && `What's the part of ${ctx.facts.job} nobody outside it understands?`,
        ctx.facts.like && ctx.turns >= 3 && `How did you get into ${ctx.facts.like}?`,
        `What does a good Tuesday look like for you?`,
        `What are you into lately that you'd talk about for an hour?`,
        `What's the last thing that genuinely annoyed you? Small and petty preferred.`
      ],
      ctx,
      "follow"
    );
  }

  function offerPlan(p, ctx, said) {
    const t = topicOf(said) || ctx.anyTopic;
    if (t === "coffee") return `Coffee then. I know the place. Saturday morning?`;
    if (t === "hike") return `${p.city === "Austin" ? "Greenbelt" : "Some trail"}, early, before it's an oven. Sunday?`;
    if (t === "drink") return `One drink somewhere with a patio. Thursday?`;
    if (t === "food" || t === "taco") return `Dinner then. I'll pick, you veto. Friday?`;
    return choose(
      [`I'd rather meet than type. Thursday or Saturday?`, `Drink or a walk this week — which night is bad for you?`],
      ctx,
      "offer"
    );
  }

  function venue(p, ctx, said) {
    const spot =
      {
        coffee: `There's a coffee place on the east side with a patio`,
        drink: `Small bar off Rainey, quiet enough to actually talk`,
        food: `Taco spot on South 1st, no line before 7`,
        taco: `Taco spot on South 1st, no line before 7`,
        hike: `Barton Creek trailhead, the shady side`,
        music: `That bar on Red River with the good back room`
      }[topicOf(said) || ctx.anyTopic] || `A wine bar near me that isn't trying too hard`;
    if (ctx.venueSet) return choose([`Same place I said. 7.`, `Same spot, 7 — I'll get there first.`], ctx, "venue-rep");
    return `${spot}. ${choose([`7ish?`, `Say 7, and text me if you're running late.`], ctx, "venue")}`;
  }

  function flirtBack(p, ctx) {
    const heat = ctx.flirtLevel >= 2 || ctx.turns >= 5;
    return choose(
      [
        heat ? `Keep talking like that and I'll clear my Thursday.` : `Smooth. I'm choosing to be charmed.`,
        heat ? `You're going to make this very easy for me, aren't you.` : `That worked, and I'm annoyed it worked.`,
        `Okay, confident. I'm into it.`
      ],
      ctx,
      "flirt"
    );
  }

  /* I asked "croissant or cookie" and they picked one — say something about the pick. */
  function pickedSide(ctx, text) {
    const chosen = [ctx.eitherOr[1], ctx.eitherOr[2]].find((w) => new RegExp(`\\b${w}`, "i").test(text));
    if (!chosen) return "";
    const cap = `${chosen[0].toUpperCase()}${chosen.slice(1)}`;
    return choose(
      [`${cap}. Correct answer, obviously.`, `${cap} people are trustworthy. That's science.`, `Good. I'd have thought less of you for the other one.`],
      ctx,
      "either"
    );
  }

  /* ---------- planning the turn ---------- */

  function planMoves(p, ctx, intent, text) {
    const canAsk = !ctx.askedRecently && !/\?/.test(text || "");
    const out = [];
    const push = (line) => {
      if (line) out.push(line);
    };

    if (intent === "bye") {
      push(choose([`Night. This was a good one.`, `Go sleep. I'll be here, being charming later.`], ctx, "bye"));
      return out;
    }
    if (intent === "sexual") {
      push(choose([`Bold. I'm going to pretend you're funny instead.`, `Slow down — buy me a drink first.`], ctx, "sex"));
      return out;
    }
    if (intent === "greet") {
      push(choose([`Hey you.`, `Hi — good, you made it.`, `Hey. First decent conversation today.`], ctx, "greet"));
      if (canAsk) push(choose([`How's your day actually going?`, `What kind of day are you having?`], ctx, "day"));
      return out;
    }
    if (intent === "pending") {
      push(answerFor(p, ctx.pendingAsk, ctx, text) || disclose(p, ctx));
      return out;
    }
    if (intent === "reaffirm") {
      push(reaffirm(p, ctx) || answerFor(p, ctx.lastAskKind, ctx, text) || genericAnswer(p, ctx, text));
      return out;
    }
    if (intent === "confused") {
      push(clarify(p, ctx));
      return out;
    }
    if (intent === "asked") {
      const kind = askedWhat(text);
      const flirty = RE.flirt.test(text) || RE.tease.test(text);
      if (flirty && kind) push(flirtBack(p, ctx));
      push(answerFor(p, kind, ctx, text) || keywordAnswer(p, text) || genericAnswer(p, ctx, text));
      if (canAsk && !/\?$/.test(out[out.length - 1] || "")) push(reciprocal(kind, ctx) || (roll(ctx, "bounce", 0.5) ? followUp(p, ctx) : ""));
      return out;
    }
    if (intent === "logistics") {
      const day = (RE.day.exec(text) || [])[0];
      if (day) push(`${day[0].toUpperCase()}${day.slice(1).toLowerCase()} it is.`);
      else if (!/\bwhere\b|\bwhat time\b|\bwhich place\b/i.test(text)) push(`Okay, locked in.`);
      push(venue(p, ctx, text));
      return out;
    }
    if (intent === "plans") {
      push(choose([`Yes. I was going to ask, you beat me to it.`, `Finally, someone who just asks.`], ctx, "plans"));
      push(offerPlan(p, ctx, text));
      return out;
    }
    if (intent === "bounce") {
      /* "you?" means different things depending on who asked last. */
      if (ctx.botAskedLast) push(answerOwn(p, ctx));
      else push(reaffirm(p, ctx) || disclose(p, ctx));
      return out;
    }
    if (intent === "flirt") {
      const heat = voiceOf(p).flirt ?? 0.5;
      /* Dialled down, they stay friendly and steer back to conversation. */
      push(heat < 0.25 ? choose([`Ha. Noted.`, `You're bold, I'll give you that.`], ctx, "cool-flirt") : flirtBack(p, ctx));
      if (heat > 0.4 && ctx.flirtLevel >= 2 && !ctx.planned && roll(ctx, "plan", heat)) push(offerPlan(p, ctx, text));
      else if (canAsk && roll(ctx, "ask", 0.4)) push(followUp(p, ctx));
      return out;
    }
    if (intent === "joke") {
      push(
        choose(
          [
            voiceOf(p).tone === "dry" ? `That's funny. Annoyingly.` : `Okay that got me.`,
            `I laughed out loud, which is embarrassing in public.`
          ],
          ctx,
          "joke"
        )
      );
      const topical = keywordAnswer(p, text);
      if (topical) push(topical);
      else if (canAsk) push(followUp(p, ctx));
      return out;
    }
    if (intent === "compliment") {
      push(choose([`Careful, I'll believe you.`, `That's a nice thing to say. I'm keeping it.`], ctx, "comp"));
      if (canAsk && roll(ctx, "comp-ask", 0.5)) push(followUp(p, ctx));
      return out;
    }
    if (intent === "lowEffort") {
      push(choose([`That's all I get?`, `Okay, one word guy.`, `Hm. Give me something to work with.`], ctx, "low"));
      if (canAsk) push(followUp(p, ctx));
      return out;
    }
    if (intent === "cool") {
      push(choose([`Fair enough. No pressure from me.`, `All good — rather you say that than fake it.`], ctx, "cool"));
      return out;
    }
    if (intent === "thanks") {
      push(choose([`Anytime.`, `Of course.`], ctx, "thanks"));
      return out;
    }

    /* answered / statement: engage with the substance of what they said, then either
       ask something or offer something of my own. Never praise the message itself. */
    if (intent === "answered" && ctx.eitherOr) push(pickedSide(ctx, text));
    push(reactToStatement(p, ctx, text));
    if (!out.length && intent === "answered") push(reactToShape(ctx, text));
    if (!out.length) push(keywordAnswer(p, text));
    /* Last resort is a short human beat, not a fact about myself nobody asked for. */
    if (!out.length) push(canAsk ? followUp(p, ctx) : choose([`Okay, noted.`, `Right.`, `Fair.`], ctx, "beat"));
    else if (canAsk && !ctx.brief && roll(ctx, "tail", 0.6)) push(followUp(p, ctx));
    return out;
  }

  function stylize(text, v, index) {
    let s = String(text || "").trim();
    if (!s) return s;
    const reaction = !index && !/\?$/.test(s);
    if (v.clip && index && /[.!?]\s+\S/.test(s)) s = s.split(/(?<=[.!?])\s+/)[0];
    if (v.tone === "dry" || v.tone === "quiet" || v.tone === "thoughtful") s = s.replace(/!+/g, ".");
    else if (reaction && v.bang && /[.]$/.test(s) && Math.random() < v.bang) s = s.replace(/\.$/, "!");
    if (v.ellipsis && /[.]$/.test(s) && Math.random() < v.ellipsis) s = s.replace(/\.$/, "…");
    if (reaction && v.emoji && v.emojiRate && Math.random() < v.emojiRate) s = `${s} ${v.emoji[0]}`;
    if (v.lower) s = s.toLowerCase();
    return s;
  }

  function converse(p, userText, thread, me) {
    const v = voiceOf(p);
    const ctx = readThread(p, thread, userText, me);
    const intent = classify(userText, ctx);
    let lines = planMoves(p, ctx, intent, userText).filter(Boolean);

    /* Never repeat myself, and match their energy on length. */
    const seen = new Set();
    lines = lines.filter((l) => {
      const k = shape(l);
      if (seen.has(k) || ctx.said.has(k)) return false;
      seen.add(k);
      return true;
    });
    /* Match their energy on length — but never at the cost of an actual answer or a
       plan, which are the moves that carry the conversation. */
    const CASUAL = new Set(["statement", "answered", "joke", "compliment", "flirt", "lowEffort", "greet"]);
    if (ctx.brief && CASUAL.has(intent)) lines = lines.slice(0, 1);
    lines = lines.slice(0, 2);
    if (!lines.length) lines = [disclose(p, ctx) || followUp(p, ctx)];

    return { lines: lines.map((l, i) => stylize(l, v, i)), intent, ctx };
  }

  global.latchConverse = converse;
  global.latchPick = (a) => a[Math.floor(Math.random() * a.length)];
  global.latchReadThread = readThread;
})(typeof window !== "undefined" ? window : globalThis);
