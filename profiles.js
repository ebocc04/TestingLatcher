/* All portraits are Unsplash photos (Unsplash License). People are fictional.
   Each profile uses ONE source photo with different crops so identity stays consistent. */
function latchShots(photoId) {
  const base = `https://images.unsplash.com/${photoId}`;
  return [
    `${base}?auto=format&fit=crop&w=900&h=1125&q=80&crop=faces&fp-y=0.22`,
    `${base}?auto=format&fit=crop&w=900&h=1200&q=80&fp-x=0.5&fp-y=0.4`,
    `${base}?auto=format&fit=crop&w=900&h=1125&q=80&crop=entropy&fp-y=0.58`
  ];
}

window.LATCH_PROFILES = [
  {
    id: "maya",
    name: "Maya",
    age: 27,
    gender: "women",
    city: "Austin",
    job: "Product designer at a climate startup",
    school: "RISD",
    height: "5'6\"",
    intention: "Looking for something serious",
    standout: true,
    likesYou: true,
    likeNote: "Your hiking prompt — same, but I bring better snacks.",
    photos: latchShots("photo-1534528741775-53994a69daeb"),
    prompts: [
      { q: "A life goal of mine", a: "Have a garden that actually produces tomatoes, not just vibes." },
      { q: "The way to win me over is", a: "Plan a walk with no destination and a playlist we both pretend we made." },
      { q: "I go crazy for", a: "People who remember small things I said three weeks ago." }
    ],
    voice: {
      greet: ["Hey — I liked your profile. You seem like you actually go outside.", "Hi. Tell me the most Austin thing about you that isn't breakfast tacos."],
      reply: [
        "That's genuinely cute. Don't make me like you too fast.",
        "Okay I smiled at my phone. Embarrassing.",
        "If we match energy like this in person I'm in trouble.",
        "Want to keep this going over coffee or are we still in the bit?"
      ],
      keywords: {
        hike: "Name a trail. I'll bring the snacks I bragged about.",
        coffee: "Yes. Tiny table, two drinks, no agenda.",
        taco: "Respect. What's your order, and don't say 'whatever looks good.'",
        work: "Design-brained people unite. What are you building lately?",
        dog: "I will immediately become a worse conversationalist around dogs. Fair warning."
      }
    }
  },
  {
    id: "jordan",
    name: "Jordan",
    age: 29,
    gender: "men",
    city: "Austin",
    job: "Sound engineer",
    school: "UT Austin",
    height: "6'0\"",
    intention: "Open to whatever",
    standout: true,
    likesYou: false,
    photos: latchShots("photo-1500648767791-00dcc994a43e"),
    prompts: [
      { q: "I'll fall for you if", a: "You can sit through a whole record without checking your phone." },
      { q: "My simple pleasures", a: "Late-night diner coffee and a booth nobody wants." },
      { q: "Unusual skill", a: "I can tell you what mic they used on a vocal in about four bars." }
    ],
    voice: {
      greet: ["Hey. Your profile didn't feel like a brochure. Rare.", "What's the last album you actually finished?"],
      reply: [
        "Noted. I like how you talk.",
        "We might get along. That's inconvenient.",
        "Alright, you're interesting. Don't waste it.",
        "If this turns into a real hang I vote vinyl bar, not a club."
      ],
      keywords: {
        music: "Give me three songs that explain you. No skipping.",
        concert: "Who did you see last? Be honest if it was mid.",
        coffee: "Diner coffee hits different. Name your spot.",
        work: "I live in dark rooms with too many cables. Glamorous.",
        vinyl: "Okay you get it."
      }
    }
  },
  {
    id: "priya",
    name: "Priya",
    age: 26,
    gender: "women",
    city: "Austin",
    job: "ER nurse",
    school: "Texas State",
    height: "5'4\"",
    intention: "Looking for something serious",
    standout: false,
    likesYou: true,
    likeNote: "Liked your 'Sunday morning' prompt.",
    photos: latchShots("photo-1544005313-94ddf0286df2"),
    prompts: [
      { q: "I want someone who", a: "Can handle a 12-hour story and still wants to hear the rest." },
      { q: "Typical Sunday", a: "Farmers market, overcaffeinated, maybe a nap I pretend I earned." },
      { q: "Together we could", a: "Become those people with a standing dumpling night." }
    ],
    voice: {
      greet: ["Hi — your profile felt calm. I needed that after a shift.", "Hey. How do you actually spend a free Sunday?"],
      reply: [
        "That's sweet. I'm smiling in scrubs which is a look.",
        "Okay you passed the not-weird test.",
        "I like this pace. Keep talking.",
        "If we meet, I vote dumplings. I wasn't kidding."
      ],
      keywords: {
        work: "Hospital stories are 40% chaos, 60% vending machine dinners.",
        sunday: "Market, coffee, and not looking at a clock. That's the dream.",
        dumpling: "Finally, a person of culture.",
        tired: "Same. We can be tired together, that's still a date.",
        kind: "Kindness is underrated and also the whole point."
      }
    }
  },
  {
    id: "leo",
    name: "Leo",
    age: 31,
    gender: "men",
    city: "Austin",
    job: "Architect",
    school: "Rice",
    height: "5'11\"",
    intention: "Looking for something serious",
    standout: true,
    likesYou: true,
    likeNote: "Your photo in the bookstore. I do that too, I just pretend I'm browsing.",
    photos: latchShots("photo-1506794778202-cad84cf45f1d"),
    prompts: [
      { q: "I'm looking for", a: "Someone who notices good light in a room and also knows when to leave a party." },
      { q: "Don't hate me if I", a: "Stop walking to look at a building like it's a celebrity." },
      { q: "The one thing I'd love to know about you", a: "What you argue about with friends — that's the real personality test." }
    ],
    voice: {
      greet: ["Hello. Your profile had taste. That's rarer than people admit.", "What kind of spaces make you feel like yourself?"],
      reply: [
        "I like how specific you are.",
        "That's a good answer. Most people dodge.",
        "We could talk for a while. I'd like that.",
        "Gallery + dinner is my default first-date pitch."
      ],
      keywords: {
        design: "Show me a building you love and I'll get annoying in a fun way.",
        book: "Bookstores are my cardio.",
        party: "I leave when the music gets ironic. That's my tell.",
        travel: "I plan trips around neighborhoods, not landmarks. Controversial?",
        coffee: "Yes, but a place with windows. I'm predictable."
      }
    }
  },
  {
    id: "nina",
    name: "Nina",
    age: 24,
    gender: "women",
    city: "Austin",
    job: "Pastry cook",
    school: "Culinary Institute",
    height: "5'5\"",
    intention: "Figuring it out",
    standout: false,
    likesYou: false,
    photos: latchShots("photo-1529626455594-4ff0802cfb7e"),
    prompts: [
      { q: "I'll pick the place if", a: "You pick the dessert. That's a personality test, sorry." },
      { q: "Green flags I look for", a: "You talk to service staff like they're people. Bar is on the floor." },
      { q: "My most irrational fear", a: "Running out of butter mid-laminate. Don't laugh." }
    ],
    voice: {
      greet: ["Hi hi. If we match I'm legally required to ask your pastry allegiance.", "Croissant or cookie. This matters."],
      reply: [
        "You might be fun. Dangerous.",
        "Okay I like you a little. Don't tell anyone.",
        "This is a good chat. Keep going.",
        "I get off late. Night walks + something sweet is my love language."
      ],
      keywords: {
        pastry: "Correct answer is always laminated dough. Fight me.",
        cookie: "Warm cookie people are trustworthy. That's science.",
        work: "I smell like vanilla and defeat after a double.",
        restaurant: "I know every back-of-house secret and will still order fries.",
        sweet: "I can make a tart that will ruin other tarts for you. Casual threat."
      }
    }
  },
  {
    id: "andre",
    name: "Andre",
    age: 33,
    gender: "men",
    city: "Austin",
    job: "High school basketball coach",
    school: "Texas A&M",
    height: "6'3\"",
    intention: "Looking for something serious",
    standout: false,
    likesYou: true,
    likeNote: "You seem like you'd trash-talk in a friendly way. I respect that.",
    photos: latchShots("photo-1507003211169-0a1dd7228f2d"),
    prompts: [
      { q: "I'm overly competitive about", a: "Board games, pickup, and who gets the better parking spot." },
      { q: "Let's debate", a: "Whether a first date should have a plan or a vibe." },
      { q: "A shower thought I recently had", a: "Most people need a hype friend more than a critic. I can be both." }
    ],
    voice: {
      greet: ["What's up. You seem like you'd keep up.", "Be honest: are you actually competitive or just say that?"],
      reply: [
        "Ha. Okay.",
        "I like that. Direct.",
        "We'd have a good time. I can already tell.",
        "Tacos after a walk. Simple. That's my pitch."
      ],
      keywords: {
        sport: "I'll watch anything live. Even bad basketball is still basketball.",
        game: "Catan brings out a version of me I don't apologize for.",
        work: "Coaching teens keeps you humble and loud.",
        plan: "I like a plan with room to wander. Best of both.",
        taco: "Always. That's not even a question in this city."
      }
    }
  },
  {
    id: "sofia",
    name: "Sofia",
    age: 28,
    gender: "women",
    city: "Austin",
    job: "Documentary editor",
    school: "NYU",
    height: "5'7\"",
    intention: "Looking for something serious",
    standout: true,
    likesYou: false,
    photos: latchShots("photo-1494790108377-be9c29b29330"),
    prompts: [
      { q: "I'm convinced that", a: "The best dates end with 'wait, one more story.'"},
      { q: "My love language is", a: "Voice notes that are way too long and photos of weird signs." },
      { q: "First round is on me if", a: "You let me pick a movie you haven't seen and don't check IMDb after." }
    ],
    voice: {
      greet: ["Hey. Your prompts felt written by a person, not a brand.", "What's a story you tell too often and still like?"],
      reply: [
        "That's cinematic. I mean that as a compliment.",
        "I want to hear the rest of that.",
        "You're good at this. Suspicious.",
        "Indie theater then a walk. That's the date. I'm not taking notes, you're taking notes."
      ],
      keywords: {
        movie: "Don't say Fight Club. Surprise me.",
        film: "I cut other people's lives together all day. Yours can stay messy.",
        story: "Yes. Start in the middle. I like that.",
        travel: "I collect places that feel like a scene, not a postcard.",
        music: "Score of a night matters. Don't @ me."
      }
    }
  },
  {
    id: "kai",
    name: "Kai",
    age: 25,
    gender: "men",
    city: "Austin",
    job: "Environmental scientist",
    school: "Colorado State",
    height: "5'10\"",
    intention: "Open to whatever",
    standout: false,
    likesYou: false,
    photos: latchShots("photo-1463453091185-61582044d556"),
    prompts: [
      { q: "Typical Sunday", a: "Trail in the morning, something fried after, zero guilt." },
      { q: "The dumber the better", a: "Roadside attractions. I will pull over for a giant peach." },
      { q: "I recently discovered that", a: "I'm a morning person only if coffee is involved. So, not really." }
    ],
    voice: {
      greet: ["Hey. You look like you'd survive a poorly planned hike.", "Giant peach: pull over or keep driving?"],
      reply: [
        "Cool. You're funnier than your photos suggested. In a good way.",
        "Alright I'm invested.",
        "This is easy. I like easy.",
        "Sunrise hike is ambitious. Sunset hike is honest. Pick one."
      ],
      keywords: {
        hike: "Greenbelt or something farther? I have opinions.",
        nature: "Bugs, dirt, good light. That's a date.",
        coffee: "Required. I will not pretend otherwise.",
        travel: "National parks over resorts. Always.",
        peach: "You pull over. That's how I know you're not boring."
      }
    }
  },
  {
    id: "elena",
    name: "Elena",
    age: 30,
    gender: "women",
    city: "Austin",
    job: "Immigration lawyer",
    school: "UT Law",
    height: "5'8\"",
    intention: "Looking for something serious",
    standout: true,
    likesYou: true,
    likeNote: "You seem thoughtful. That's the whole app for me.",
    photos: latchShots("photo-1531746020798-e6953c6c4f2e"),
    prompts: [
      { q: "I'm looking for", a: "A partner, not a project, not a placeholder." },
      { q: "The key to my heart is", a: "Curiosity without an interrogation vibe." },
      { q: "Let's make sure we're on the same page about", a: "Kindness as a default, not a mood." }
    ],
    voice: {
      greet: ["Hi. I liked that you didn't perform too hard.", "What are you actually hoping this app is for?"],
      reply: [
        "That's a real answer. Thank you.",
        "I could talk to you for a while.",
        "You're making this feel less like an app. Nice trick.",
        "Wine bar with actual conversation. I know, shocking concept."
      ],
      keywords: {
        work: "I argue for people. Off the clock I want softness.",
        serious: "Same page. I'm not collecting situationships.",
        kind: "Yes. That's the filter.",
        book: "I read more briefs than novels lately. Recommend me something human.",
        wine: "I have opinions about natural wine and I will share them unprompted."
      }
    }
  },
  {
    id: "omar",
    name: "Omar",
    age: 27,
    gender: "men",
    city: "Austin",
    job: "Chef de partie",
    school: "None, learned in kitchens",
    height: "5'9\"",
    intention: "Figuring it out",
    standout: false,
    likesYou: false,
    photos: latchShots("photo-1519085360753-af0119f7cbe7"),
    prompts: [
      { q: "I'll fall for you if", a: "You can hang in a loud kitchen and still be gentle after." },
      { q: "My simple pleasures", a: "Family meal at 4pm and a cold drink on the back dock." },
      { q: "Dating me is like", a: "Weird hours, great food, and I will plate your leftovers like a bit." }
    ],
    voice: {
      greet: ["Hey. If we match I'll cook. That's not a line, that's a threat.", "What's the last thing you ate that you still think about?"],
      reply: [
        "Okay you can stay.",
        "I like your taste. Literally maybe.",
        "This is good. Don't disappear after a good chat, the classic move.",
        "Late dinner after service. If you can do 10:30 we might work."
      ],
      keywords: {
        food: "Tell me a dish you love and I'll tell you how I'd ruin/improve it.",
        cook: "I will. Even if it's just eggs. Eggs tell the truth.",
        work: "Service is a sport. Dating has to feel like the opposite.",
        spice: "I can do heat. Can you?",
        taco: "I have a ranking. It's controversial and correct."
      }
    }
  },
  {
    id: "avery",
    name: "Avery",
    age: 26,
    gender: "women",
    city: "Austin",
    job: "UX researcher",
    school: "UChicago",
    height: "5'6\"",
    intention: "Open to whatever",
    standout: false,
    likesYou: true,
    likeNote: "Your prompt about bad first dates made me laugh out loud on a bus.",
    photos: latchShots("photo-1488426862026-3ee34a7d66df"),
    prompts: [
      { q: "The hallmark of a good relationship is", a: "Inside jokes that would make no sense in a deposition." },
      { q: "I'm overly competitive about", a: "Trivia. It's a problem. I have a spreadsheet. That's two problems." },
      { q: "Worst idea I've ever had", a: "A 'quick' pottery class. I made a bowl that is also a metaphor." }
    ],
    voice: {
      greet: ["Hi. I research humans for work and still downloaded this. Irony.", "On a scale of 1–10 how chaotic is your group chat?"],
      reply: [
        "That's funny. I'm keeping you.",
        "Okay, you're quick. I like quick.",
        "We'd be annoying together in the best way.",
        "Trivia night is a real suggestion. Don't run."
      ],
      keywords: {
        trivia: "I will destroy you and then buy you a drink. Romance.",
        work: "I ask strangers questions all day. Your turn to ask me one.",
        pottery: "The bowl leans. Like me after two negronis.",
        funny: "Humor is the filter. Everything else is negotiable.",
        book: "I underline too much. Judge me."
      }
    }
  },
  {
    id: "mateo",
    name: "Mateo",
    age: 32,
    gender: "men",
    city: "Austin",
    job: "Photojournalist",
    school: "SVA",
    height: "5'11\"",
    intention: "Looking for something serious",
    standout: true,
    likesYou: false,
    photos: latchShots("photo-1492562080023-ab3db95bfbce"),
    prompts: [
      { q: "I want someone who", a: "Sees the same strange details I do and doesn't need them explained." },
      { q: "Together we could", a: "Get lost on purpose and call it research." },
      { q: "I'm weirdly attracted to", a: "People who wave at dogs in cars." }
    ],
    voice: {
      greet: ["Hey. Your photos felt unposed. That's a compliment.", "What do you notice first in a room?"],
      reply: [
        "I like that answer more than I expected.",
        "You're easy to talk to. Careful.",
        "This is the good part of the app.",
        "Golden hour walk downtown. Camera optional. Talking required."
      ],
      keywords: {
        photo: "I shoot people, not products. Big difference.",
        travel: "I pack light and stay too long.",
        dog: "Car dogs are the highest form of life.",
        art: "Museums are dates if you don't rush the gift shop.",
        light: "Good light is a personality trait."
      }
    }
  },
  {
    id: "hana",
    name: "Hana",
    age: 23,
    gender: "women",
    city: "Austin",
    job: "Florist",
    school: "ACC",
    height: "5'3\"",
    intention: "Figuring it out",
    standout: false,
    likesYou: false,
    photos: latchShots("photo-1487412720507-e7ab37603c6f"),
    prompts: [
      { q: "The way to win me over is", a: "Bring me a weird grocery-store flower and commit to the bit." },
      { q: "My simple pleasures", a: "Early shop, quiet, stems in buckets, a song on repeat." },
      { q: "I go crazy for", a: "Soft people with a little edge. Not the reverse." }
    ],
    voice: {
      greet: ["Hi. If this goes well I might send you a picture of ranunculus. That's intimacy.", "Favorite flower, no overthinking."],
      reply: [
        "That's tender. I like tender.",
        "Okay you're sweet. I'm shy about it.",
        "We can keep talking. I want to.",
        "Nursery + coffee. Peak date. Don't fight me."
      ],
      keywords: {
        flower: "Ranunculus. Peony in season. Anything weird always.",
        plant: "I can keep your plant alive. That's not a small offer.",
        quiet: "Quiet dates are elite.",
        music: "I loop the same three songs while I work. Judge the playlist later.",
        sweet: "I am. And also I have shears. Balance."
      }
    }
  },
  {
    id: "devon",
    name: "Devon",
    age: 34,
    gender: "men",
    city: "Austin",
    job: "Startup PM, recovering musician",
    school: "Berkeley",
    height: "6'1\"",
    intention: "Looking for something serious",
    standout: false,
    likesYou: true,
    likeNote: "You seem like you'd call me on my nonsense. Please do.",
    photos: latchShots("photo-1472099645785-5658abf4ff4e"),
    prompts: [
      { q: "I'm looking for", a: "Someone who makes weeknights feel like they count." },
      { q: "I'll fall for you if", a: "You have a point of view and you can change it." },
      { q: "Don't hate me if I", a: "Turn a casual question into a 20-minute conversation." }
    ],
    voice: {
      greet: ["Hey. Trying this in good faith. You?", "What does a good weeknight look like for you?"],
      reply: [
        "That's a solid answer.",
        "I like talking to you.",
        "You're making a case for this app.",
        "Weeknight dinner that isn't a screen. Revolutionary, I know."
      ],
      keywords: {
        work: "Startups ate my twenties. I'm trying to have a thirties.",
        music: "I still write songs I don't play for anyone. That's a yellow flag maybe.",
        serious: "Same. Tired of almosts.",
        dinner: "I cook simply and well. Or I order and pretend.",
        travel: "I like trips with a reason, even a small one."
      }
    }
  },
  {
    id: "luca",
    name: "Luca",
    age: 29,
    gender: "men",
    city: "Austin",
    job: "Barista / ceramicist",
    school: "Self-taught",
    height: "5'10\"",
    intention: "Open to whatever",
    standout: true,
    likesYou: false,
    photos: latchShots("photo-1539571696357-5a69c17a67c6"),
    prompts: [
      { q: "Dating me is like", a: "Slow mornings, clay on everything, and I will remember how you take your coffee." },
      { q: "Green flags I look for", a: "You have a craft, even a tiny one." },
      { q: "A life goal of mine", a: "A studio with a window that doesn't leak." }
    ],
    voice: {
      greet: ["Hey. How do you take your coffee? This is not small talk.", "Do you make anything with your hands?"],
      reply: [
        "That's a good sign.",
        "I like your pace.",
        "We might be compatible. Quietly.",
        "Coffee, then the studio if you're curious. No pressure pottery."
      ],
      keywords: {
        coffee: "I can pull a shot that will ruin cafe coffee for you. Sorry in advance.",
        ceramic: "Mugs are intimate. You use them every day.",
        craft: "Yes. That's the whole personality.",
        morning: "Mornings are the best part if nobody ruins them.",
        quiet: "Quiet is a feature."
      }
    }
  },
  {
    id: "sasha",
    name: "Sasha",
    age: 27,
    gender: "women",
    city: "Austin",
    job: "Policy analyst",
    school: "Georgetown",
    height: "5'7\"",
    intention: "Looking for something serious",
    standout: false,
    likesYou: false,
    photos: latchShots("photo-1524504388940-b1c1722653e1"),
    prompts: [
      { q: "Let's make sure we're on the same page about", a: "Ambition that still leaves room for a Tuesday night on the couch." },
      { q: "The one thing I'd love to know about you", a: "What you do when you're not trying to impress anyone." },
      { q: "I recently discovered that", a: "I like dancing in kitchens more than clubs. Age or wisdom? Unclear." }
    ],
    voice: {
      greet: ["Hi. Your profile didn't feel like a pitch deck. Relief.", "What are you like on a random Tuesday?"],
      reply: [
        "That's exactly what I wanted to hear.",
        "You're thoughtful. I notice.",
        "Keep going. I'm here.",
        "Walk + a place with a good booth. That's my entire personality."
      ],
      keywords: {
        work: "Policy is slow. Dating shouldn't be a hearing.",
        tuesday: "Leftovers, a show, maybe a call. Real life.",
        dance: "Kitchen dancing is non-negotiable.",
        serious: "Yes. I have better things to do than almost-date.",
        travel: "I plan just enough and leave holes on purpose."
      }
    }
  }
];

window.PROMPT_BANK = [
  "A life goal of mine",
  "The way to win me over is",
  "I go crazy for",
  "I'll fall for you if",
  "My simple pleasures",
  "Unusual skill",
  "I want someone who",
  "Typical Sunday",
  "Together we could",
  "I'm looking for",
  "Don't hate me if I",
  "The one thing I'd love to know about you",
  "I'll pick the place if",
  "Green flags I look for",
  "I'm overly competitive about",
  "Let's debate",
  "I'm convinced that",
  "My love language is",
  "The dumber the better",
  "The key to my heart is",
  "Dating me is like",
  "The hallmark of a good relationship is",
  "Worst idea I've ever had",
  "I'm weirdly attracted to"
];
