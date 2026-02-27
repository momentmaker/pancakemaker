export interface DemoExpense {
  description: string
  amount: number
  categoryIndex: number
  panelIndex: number
  dayOffset: number
}

export interface DemoCategory {
  name: string
  color: string
  routeType: 'personal' | 'business'
}

export interface DemoPanel {
  name: string
  currency: string
  recurrenceType: 'monthly' | 'annual' | null
  isDefault: boolean
  routeType: 'personal' | 'business'
}

export interface DemoPersona {
  slug: string
  name: string
  emoji: string
  tagline: string
  categories: DemoCategory[]
  panels: DemoPanel[]
  expenses: DemoExpense[]
}

const NEON_COLORS = {
  cyan: '#00ffcc',
  magenta: '#ff6b9d',
  violet: '#c084fc',
  amber: '#fbbf24',
  lime: '#a3e635',
  orange: '#fb923c',
  blue: '#60a5fa',
  rose: '#fb7185',
  teal: '#2dd4bf',
  pink: '#f472b6',
  emerald: '#34d399',
  red: '#f87171',
  indigo: '#818cf8',
  yellow: '#facc15',
  sky: '#38bdf8',
}

function spreadExpensesAcrossMonths(
  expenses: Omit<DemoExpense, 'dayOffset'>[],
  monthWeights: number[],
): DemoExpense[] {
  const result: DemoExpense[] = []
  for (const expense of expenses) {
    const monthIndex = Math.floor(Math.random() * monthWeights.length)
    const monthDaysAgo = monthWeights[monthIndex]
    const dayVariation = Math.floor(Math.random() * 25)
    result.push({ ...expense, dayOffset: -(monthDaysAgo + dayVariation) })
  }
  return result
}

function buildPersonaExpenses(
  currentMonthExpenses: Omit<DemoExpense, 'dayOffset'>[],
  historicalTemplates: Omit<DemoExpense, 'dayOffset'>[],
): DemoExpense[] {
  const current = currentMonthExpenses.map((e) => ({
    ...e,
    dayOffset: -Math.floor(Math.random() * 25),
  }))

  const historical = spreadExpensesAcrossMonths(historicalTemplates, [30, 60, 90, 120, 150])

  return [...current, ...historical]
}

const chaosGoblin: DemoPersona = {
  slug: 'chaos-goblin',
  name: 'Chaos Goblin',
  emoji: '\u{1F47A}',
  tagline: 'impulse control is a social construct',
  categories: [
    { name: 'Chaos Tax', color: NEON_COLORS.magenta, routeType: 'personal' },
    { name: 'Midnight Snacks', color: NEON_COLORS.amber, routeType: 'personal' },
    { name: 'Emotional Purchases', color: NEON_COLORS.violet, routeType: 'personal' },
    { name: 'Regret Insurance', color: NEON_COLORS.cyan, routeType: 'personal' },
    { name: '"Treat Yourself"', color: NEON_COLORS.lime, routeType: 'personal' },
    { name: 'Cursed Objects', color: NEON_COLORS.orange, routeType: 'personal' },
    { name: 'Transportation Incidents', color: NEON_COLORS.blue, routeType: 'personal' },
    { name: 'Subscription Shame', color: NEON_COLORS.rose, routeType: 'personal' },
    { name: 'Chaos Consulting', color: NEON_COLORS.teal, routeType: 'business' },
    { name: 'Emergency Supplies', color: NEON_COLORS.pink, routeType: 'business' },
  ],
  panels: [
    {
      name: 'Daily Chaos',
      currency: 'USD',
      recurrenceType: null,
      isDefault: true,
      routeType: 'personal',
    },
    {
      name: 'Monthly Subscriptions',
      currency: 'USD',
      recurrenceType: 'monthly',
      isDefault: false,
      routeType: 'personal',
    },
    {
      name: 'Freelance Chaos',
      currency: 'USD',
      recurrenceType: null,
      isDefault: true,
      routeType: 'business',
    },
    {
      name: 'Monthly Biz',
      currency: 'USD',
      recurrenceType: 'monthly',
      isDefault: false,
      routeType: 'business',
    },
  ],
  expenses: buildPersonaExpenses(
    [
      {
        description: '3am Amazon order: life-size cardboard cutout of myself',
        amount: 8999,
        categoryIndex: 2,
        panelIndex: 0,
      },
      {
        description: 'Uber home from Uber home from Uber home',
        amount: 4723,
        categoryIndex: 6,
        panelIndex: 0,
      },
      {
        description: "Bought a sword at the Renaissance fair (I don't fence)",
        amount: 13400,
        categoryIndex: 5,
        panelIndex: 0,
      },
      {
        description: 'Locksmith because I locked my keys inside AGAIN',
        amount: 17500,
        categoryIndex: 3,
        panelIndex: 0,
      },
      {
        description: 'Emotional support plant #47 (the other 46 are dead)',
        amount: 1299,
        categoryIndex: 2,
        panelIndex: 0,
      },
      {
        description: 'Midnight grocery run: only cheese and candles',
        amount: 3467,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: 'Bought a kayak on Facebook Marketplace at 1am',
        amount: 20000,
        categoryIndex: 5,
        panelIndex: 0,
      },
      {
        description: 'Apologized with donuts (whole office, again)',
        amount: 5600,
        categoryIndex: 0,
        panelIndex: 0,
      },
      {
        description: 'Bulk glitter (5 lbs) - no reason',
        amount: 2850,
        categoryIndex: 5,
        panelIndex: 0,
      },
      {
        description: 'Streaming service I forgot I had (month 14)',
        amount: 1599,
        categoryIndex: 7,
        panelIndex: 1,
      },
      {
        description: 'Emergency pizza fund (self-imposed tax)',
        amount: 2500,
        categoryIndex: 0,
        panelIndex: 0,
      },
      {
        description: 'Chaos consulting — client wanted "more chaos"',
        amount: 45000,
        categoryIndex: 8,
        panelIndex: 2,
      },
      {
        description: 'Emergency office snacks (entire vending machine)',
        amount: 8700,
        categoryIndex: 9,
        panelIndex: 2,
      },
    ],
    [
      {
        description: 'Impulse tattoo (it says "no ragrets")',
        amount: 15000,
        categoryIndex: 2,
        panelIndex: 0,
      },
      {
        description: 'Towed for parking in a "creative" spot',
        amount: 28500,
        categoryIndex: 6,
        panelIndex: 0,
      },
      {
        description: '4am waffle house run (drove 45 min)',
        amount: 1847,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: 'Replaced phone screen (dropped it celebrating)',
        amount: 22900,
        categoryIndex: 3,
        panelIndex: 0,
      },
      {
        description: 'Mystery subscription box (still mysterious)',
        amount: 3999,
        categoryIndex: 7,
        panelIndex: 1,
      },
      {
        description: 'Bought matching outfits for me and the cat',
        amount: 6700,
        categoryIndex: 4,
        panelIndex: 0,
      },
      {
        description: 'Locksmith again (different door this time)',
        amount: 15000,
        categoryIndex: 3,
        panelIndex: 0,
      },
      {
        description: '2am eBay bid: vintage lava lamp collection',
        amount: 8900,
        categoryIndex: 5,
        panelIndex: 0,
      },
      {
        description: 'Gas station sushi (I knew better)',
        amount: 899,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: 'Confetti cannon for no occasion',
        amount: 2400,
        categoryIndex: 0,
        panelIndex: 0,
      },
    ],
  ),
}

const techBro: DemoPersona = {
  slug: 'tech-bro',
  name: 'Tech Bro',
  emoji: '\u{1F4BB}',
  tagline: 'disrupting my bank account',
  categories: [
    { name: 'Biohacking', color: NEON_COLORS.cyan, routeType: 'personal' },
    { name: 'Optimization Gear', color: NEON_COLORS.violet, routeType: 'personal' },
    { name: '"Networking"', color: NEON_COLORS.amber, routeType: 'personal' },
    { name: 'Coffee (Specialty)', color: NEON_COLORS.orange, routeType: 'personal' },
    { name: 'Standing Desk Accessories', color: NEON_COLORS.lime, routeType: 'personal' },
    { name: 'Athleisure', color: NEON_COLORS.blue, routeType: 'personal' },
    { name: 'Crypto Losses (Educational)', color: NEON_COLORS.magenta, routeType: 'personal' },
    { name: 'SaaS Expenses', color: NEON_COLORS.teal, routeType: 'business' },
    { name: 'Startup Costs', color: NEON_COLORS.rose, routeType: 'business' },
  ],
  panels: [
    {
      name: 'Daily Optimization',
      currency: 'USD',
      recurrenceType: null,
      isDefault: true,
      routeType: 'personal',
    },
    {
      name: 'Monthly Stack',
      currency: 'USD',
      recurrenceType: 'monthly',
      isDefault: false,
      routeType: 'personal',
    },
    {
      name: 'Startup Daily',
      currency: 'USD',
      recurrenceType: null,
      isDefault: true,
      routeType: 'business',
    },
    {
      name: 'SaaS Monthly',
      currency: 'USD',
      recurrenceType: 'monthly',
      isDefault: false,
      routeType: 'business',
    },
  ],
  expenses: buildPersonaExpenses(
    [
      {
        description: "Cold plunge tub (it's a deduction if I podcast from it)",
        amount: 429900,
        categoryIndex: 0,
        panelIndex: 0,
      },
      {
        description: '47 browser tabs worth of nootropics',
        amount: 18900,
        categoryIndex: 0,
        panelIndex: 0,
      },
      {
        description: 'Oura Ring replacement (lost in cold plunge)',
        amount: 34900,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: 'Third monitor for monitoring my other monitors',
        amount: 89900,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: 'Single-origin Ethiopian pour-over (one cup)',
        amount: 1400,
        categoryIndex: 3,
        panelIndex: 0,
      },
      {
        description: "Patagonia vest (it's a uniform at this point)",
        amount: 17900,
        categoryIndex: 5,
        panelIndex: 0,
      },
      {
        description: 'NFT of a pancake (floor price: $0)',
        amount: 25000,
        categoryIndex: 6,
        panelIndex: 0,
      },
      {
        description: 'Networking dinner (I pitched the waiter)',
        amount: 23000,
        categoryIndex: 2,
        panelIndex: 0,
      },
      { description: 'AI SaaS subscription #12', amount: 9900, categoryIndex: 7, panelIndex: 3 },
      {
        description: 'Co-working space (I work from home)',
        amount: 35000,
        categoryIndex: 8,
        panelIndex: 2,
      },
    ],
    [
      {
        description: 'Standing desk treadmill attachment',
        amount: 59900,
        categoryIndex: 4,
        panelIndex: 0,
      },
      {
        description: 'Yerba mate bulk order (48 cans)',
        amount: 7200,
        categoryIndex: 3,
        panelIndex: 0,
      },
      {
        description: 'Blue light glasses (4th pair)',
        amount: 12900,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: 'Conference ticket (for the networking)',
        amount: 79900,
        categoryIndex: 2,
        panelIndex: 0,
      },
      {
        description: 'Allbirds replacements (wool wore thin from pacing)',
        amount: 14000,
        categoryIndex: 5,
        panelIndex: 0,
      },
      {
        description: 'Crypto "learning experience" #7',
        amount: 50000,
        categoryIndex: 6,
        panelIndex: 0,
      },
      { description: 'Whoop band subscription', amount: 3000, categoryIndex: 0, panelIndex: 1 },
      {
        description: "Domain name I'll never use: synergy.ai",
        amount: 4999,
        categoryIndex: 8,
        panelIndex: 2,
      },
    ],
  ),
}

const catParent: DemoPersona = {
  slug: 'cat-parent',
  name: 'Cat Parent',
  emoji: '\u{1F408}',
  tagline: 'financially supporting a creature that ignores me',
  categories: [
    { name: 'Cat Food (Gourmet)', color: NEON_COLORS.amber, routeType: 'personal' },
    { name: 'Cat Furniture', color: NEON_COLORS.violet, routeType: 'personal' },
    { name: 'Cat Healthcare', color: NEON_COLORS.cyan, routeType: 'personal' },
    { name: 'Cat Fashion', color: NEON_COLORS.magenta, routeType: 'personal' },
    { name: 'Cat Entertainment', color: NEON_COLORS.lime, routeType: 'personal' },
    { name: "Human Food (Whatever's Left)", color: NEON_COLORS.orange, routeType: 'personal' },
    { name: 'Cat Insurance', color: NEON_COLORS.blue, routeType: 'personal' },
    { name: 'Pet Photography', color: NEON_COLORS.rose, routeType: 'business' },
    { name: 'Cat Influencer Costs', color: NEON_COLORS.teal, routeType: 'business' },
  ],
  panels: [
    {
      name: 'Daily Cat Tax',
      currency: 'USD',
      recurrenceType: null,
      isDefault: true,
      routeType: 'personal',
    },
    {
      name: 'Monthly Cat Bills',
      currency: 'USD',
      recurrenceType: 'monthly',
      isDefault: false,
      routeType: 'personal',
    },
    {
      name: 'Lord Biscuit LLC',
      currency: 'USD',
      recurrenceType: null,
      isDefault: true,
      routeType: 'business',
    },
  ],
  expenses: buildPersonaExpenses(
    [
      {
        description: 'Organic wild-caught salmon pate (cat ate 2 bites)',
        amount: 899,
        categoryIndex: 0,
        panelIndex: 0,
      },
      {
        description: 'Cat tree that Lord Biscuit refuses to use',
        amount: 28900,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: 'Replacement couch (Lord Biscuit claimed the original)',
        amount: 120000,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: 'Emergency vet: ate a rubber band (again)',
        amount: 68000,
        categoryIndex: 2,
        panelIndex: 0,
      },
      {
        description: 'Cat DNA test (results: 100% menace)',
        amount: 9900,
        categoryIndex: 2,
        panelIndex: 0,
      },
      {
        description: 'Instant ramen (the cat ate my dinner budget)',
        amount: 349,
        categoryIndex: 5,
        panelIndex: 0,
      },
      {
        description: 'My actual groceries for the week',
        amount: 4150,
        categoryIndex: 5,
        panelIndex: 0,
      },
      {
        description: 'Cat bow tie collection (he has more than me)',
        amount: 3499,
        categoryIndex: 3,
        panelIndex: 0,
      },
      { description: 'Pet insurance premium', amount: 4500, categoryIndex: 6, panelIndex: 1 },
      {
        description: 'Professional cat photoshoot',
        amount: 25000,
        categoryIndex: 7,
        panelIndex: 2,
      },
      { description: 'Cat Instagram ad spend', amount: 5000, categoryIndex: 8, panelIndex: 2 },
    ],
    [
      {
        description: 'Heated cat bed (he sleeps on my laptop instead)',
        amount: 7999,
        categoryIndex: 4,
        panelIndex: 0,
      },
      { description: 'Catnip subscription box', amount: 2999, categoryIndex: 4, panelIndex: 1 },
      {
        description: 'Cat fountain (he drinks from the toilet anyway)',
        amount: 4599,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: 'Vet visit: "he\'s just dramatic" — $400',
        amount: 40000,
        categoryIndex: 2,
        panelIndex: 0,
      },
      {
        description: 'Sardines (for the cat, I swear)',
        amount: 1299,
        categoryIndex: 0,
        panelIndex: 0,
      },
      { description: 'Dollar store ramen (week 3)', amount: 200, categoryIndex: 5, panelIndex: 0 },
      {
        description: 'Cat Halloween costume (he hated it)',
        amount: 2499,
        categoryIndex: 3,
        panelIndex: 0,
      },
      {
        description: 'Automatic laser toy (entertains me more than him)',
        amount: 3499,
        categoryIndex: 4,
        panelIndex: 0,
      },
    ],
  ),
}

const aspiringChef: DemoPersona = {
  slug: 'aspiring-chef',
  name: 'Aspiring Chef',
  emoji: '\u{1F468}\u200D\u{1F373}',
  tagline: 'burning money and also the garlic',
  categories: [
    { name: 'Kitchen Gadgets (Used Once)', color: NEON_COLORS.amber, routeType: 'personal' },
    { name: 'Fancy Ingredients', color: NEON_COLORS.lime, routeType: 'personal' },
    { name: 'Cooking Classes', color: NEON_COLORS.cyan, routeType: 'personal' },
    { name: 'Takeout (After Cooking Fails)', color: NEON_COLORS.magenta, routeType: 'personal' },
    { name: 'Kitchen Damage', color: NEON_COLORS.orange, routeType: 'personal' },
    { name: 'Cookbooks (Decorative)', color: NEON_COLORS.violet, routeType: 'personal' },
    { name: 'Apology Dinners', color: NEON_COLORS.rose, routeType: 'personal' },
    { name: 'Food Blog Costs', color: NEON_COLORS.teal, routeType: 'business' },
    { name: 'Catering Supplies', color: NEON_COLORS.blue, routeType: 'business' },
  ],
  panels: [
    {
      name: 'Daily Kitchen',
      currency: 'USD',
      recurrenceType: null,
      isDefault: true,
      routeType: 'personal',
    },
    {
      name: 'Monthly Subscriptions',
      currency: 'USD',
      recurrenceType: 'monthly',
      isDefault: false,
      routeType: 'personal',
    },
    {
      name: 'Food Blog',
      currency: 'USD',
      recurrenceType: null,
      isDefault: true,
      routeType: 'business',
    },
  ],
  expenses: buildPersonaExpenses(
    [
      {
        description: 'Truffle oil (used it on mac & cheese, no regrets)',
        amount: 3800,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: 'Pasta maker (used once, now a bookend)',
        amount: 18900,
        categoryIndex: 0,
        panelIndex: 0,
      },
      {
        description: 'Uber Eats after smoke alarm went off',
        amount: 4700,
        categoryIndex: 3,
        panelIndex: 0,
      },
      {
        description: 'Replacement smoke detector (3rd this year)',
        amount: 2999,
        categoryIndex: 4,
        panelIndex: 0,
      },
      {
        description: "Japanese knife that I'm terrified to use",
        amount: 32000,
        categoryIndex: 0,
        panelIndex: 0,
      },
      {
        description: 'Sourdough starter supplies (RIP Gerald, day 3)',
        amount: 2200,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: 'Took neighbors to dinner after the smoke incident',
        amount: 15600,
        categoryIndex: 6,
        panelIndex: 0,
      },
      {
        description: 'Food photography lighting kit',
        amount: 12900,
        categoryIndex: 7,
        panelIndex: 2,
      },
      {
        description: 'Meal kit subscription (I never cook them)',
        amount: 7999,
        categoryIndex: 3,
        panelIndex: 1,
      },
    ],
    [
      {
        description: 'Sous vide machine (used it as a bath warmer)',
        amount: 19900,
        categoryIndex: 0,
        panelIndex: 0,
      },
      {
        description: 'Saffron (0.5g, cost more than rent)',
        amount: 2499,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: 'Italian cooking class (set off their alarm too)',
        amount: 15000,
        categoryIndex: 2,
        panelIndex: 0,
      },
      {
        description: 'Kitchen fire extinguisher (upgrade to pro model)',
        amount: 8900,
        categoryIndex: 4,
        panelIndex: 0,
      },
      {
        description: 'Doordash after failed beef wellington',
        amount: 3800,
        categoryIndex: 3,
        panelIndex: 0,
      },
      {
        description: "The French Laundry cookbook (it's a coffee table book now)",
        amount: 7500,
        categoryIndex: 5,
        panelIndex: 0,
      },
      {
        description: 'Apology cake for the neighbors (store-bought)',
        amount: 4500,
        categoryIndex: 6,
        panelIndex: 0,
      },
    ],
  ),
}

const gymBro: DemoPersona = {
  slug: 'gym-bro',
  name: 'Gym Bro',
  emoji: '\u{1F4AA}',
  tagline: "gains aren't free (emotionally or financially)",
  categories: [
    { name: 'Protein (All Forms)', color: NEON_COLORS.lime, routeType: 'personal' },
    { name: 'Gym Gear', color: NEON_COLORS.cyan, routeType: 'personal' },
    { name: 'Recovery Science', color: NEON_COLORS.violet, routeType: 'personal' },
    { name: 'Mirror Selfie Equipment', color: NEON_COLORS.magenta, routeType: 'personal' },
    { name: 'Supplement Stack', color: NEON_COLORS.amber, routeType: 'personal' },
    { name: 'Meal Prep Industrial Complex', color: NEON_COLORS.orange, routeType: 'personal' },
    { name: 'Gym Membership Collection', color: NEON_COLORS.blue, routeType: 'personal' },
    { name: 'Personal Training Biz', color: NEON_COLORS.teal, routeType: 'business' },
    { name: 'Supplement Brand', color: NEON_COLORS.rose, routeType: 'business' },
  ],
  panels: [
    {
      name: 'Daily Gains',
      currency: 'USD',
      recurrenceType: null,
      isDefault: true,
      routeType: 'personal',
    },
    {
      name: 'Monthly Memberships',
      currency: 'USD',
      recurrenceType: 'monthly',
      isDefault: false,
      routeType: 'personal',
    },
    {
      name: 'Training Biz',
      currency: 'USD',
      recurrenceType: null,
      isDefault: true,
      routeType: 'business',
    },
  ],
  expenses: buildPersonaExpenses(
    [
      {
        description: 'Protein powder: cookies & cream (5lb tub, 3rd this month)',
        amount: 6499,
        categoryIndex: 0,
        panelIndex: 0,
      },
      {
        description: 'Gym membership #1 (the serious one)',
        amount: 7900,
        categoryIndex: 6,
        panelIndex: 1,
      },
      {
        description: 'Gym membership #2 (the one with the sauna)',
        amount: 4900,
        categoryIndex: 6,
        panelIndex: 1,
      },
      {
        description: "Gym membership #3 (it's near Chipotle)",
        amount: 2999,
        categoryIndex: 6,
        panelIndex: 1,
      },
      {
        description: 'Creatine gummies (regular creatine is for casuals)',
        amount: 3499,
        categoryIndex: 4,
        panelIndex: 0,
      },
      {
        description: 'Custom "GAINS O\'CLOCK" LED neon sign for home gym',
        amount: 18900,
        categoryIndex: 3,
        panelIndex: 0,
      },
      {
        description: "Chicken breast: 40 lbs (it's meal prep Sunday every Sunday)",
        amount: 9800,
        categoryIndex: 5,
        panelIndex: 0,
      },
      {
        description: 'Foam roller that made me cry in public',
        amount: 4500,
        categoryIndex: 2,
        panelIndex: 0,
      },
      {
        description: 'Shaker bottle #14 (they multiply in my car)',
        amount: 1299,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: 'Lifting belt with my name embroidered on it',
        amount: 9500,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: 'Pre-workout so strong it should be illegal',
        amount: 5499,
        categoryIndex: 4,
        panelIndex: 0,
      },
      {
        description: '"REST DAY" tank top (I don\'t take rest days)',
        amount: 2800,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: 'Massage gun (I use it during Zoom calls)',
        amount: 29900,
        categoryIndex: 2,
        panelIndex: 0,
      },
      {
        description: "BCAAs (I don't know what they do but the gym guys said so)",
        amount: 3200,
        categoryIndex: 4,
        panelIndex: 0,
      },
      {
        description: 'Bulk meal prep containers (200 pack)',
        amount: 4500,
        categoryIndex: 5,
        panelIndex: 0,
      },
      {
        description: 'Client training session equipment',
        amount: 15000,
        categoryIndex: 7,
        panelIndex: 2,
      },
    ],
    [
      {
        description: 'Wrist wraps (my old ones smelled sentient)',
        amount: 2499,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: 'Protein pancake mix (brand loyalty)',
        amount: 1899,
        categoryIndex: 0,
        panelIndex: 0,
      },
      {
        description: 'Gym mirror for the garage (6ft)',
        amount: 24900,
        categoryIndex: 3,
        panelIndex: 0,
      },
      {
        description: 'Cryotherapy session (felt nothing, paid everything)',
        amount: 8500,
        categoryIndex: 2,
        panelIndex: 0,
      },
      {
        description: 'Rice: 50lb bag (meal prep is a lifestyle)',
        amount: 3200,
        categoryIndex: 5,
        panelIndex: 0,
      },
      {
        description: 'Knee sleeves (matching set, obviously)',
        amount: 5900,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: 'Egg whites: 10 dozen (I am the bulk section)',
        amount: 4800,
        categoryIndex: 0,
        panelIndex: 0,
      },
      {
        description: 'Supplement brand logo design',
        amount: 35000,
        categoryIndex: 8,
        panelIndex: 2,
      },
    ],
  ),
}

const astrologyGirl: DemoPersona = {
  slug: 'astrology-girl',
  name: 'Astrology Girl',
  emoji: '\u{2728}',
  tagline: "it's not my fault, mercury is in retrograde",
  categories: [
    { name: 'Crystal Collection', color: NEON_COLORS.violet, routeType: 'personal' },
    { name: 'Birth Chart Services', color: NEON_COLORS.cyan, routeType: 'personal' },
    { name: 'Moon Phase Supplies', color: NEON_COLORS.amber, routeType: 'personal' },
    { name: 'Sage & Smudging', color: NEON_COLORS.lime, routeType: 'personal' },
    { name: 'Tarot Infrastructure', color: NEON_COLORS.magenta, routeType: 'personal' },
    { name: 'Zodiac Fashion', color: NEON_COLORS.rose, routeType: 'personal' },
    { name: 'Mercury Retrograde Emergency Fund', color: NEON_COLORS.orange, routeType: 'personal' },
    { name: 'Astrology Readings Biz', color: NEON_COLORS.teal, routeType: 'business' },
    { name: 'Crystal Shop Inventory', color: NEON_COLORS.blue, routeType: 'business' },
  ],
  panels: [
    {
      name: 'Daily Vibes',
      currency: 'USD',
      recurrenceType: null,
      isDefault: true,
      routeType: 'personal',
    },
    {
      name: 'Monthly Cosmic',
      currency: 'USD',
      recurrenceType: 'monthly',
      isDefault: false,
      routeType: 'personal',
    },
    {
      name: 'Starlight LLC',
      currency: 'USD',
      recurrenceType: null,
      isDefault: true,
      routeType: 'business',
    },
  ],
  expenses: buildPersonaExpenses(
    [
      {
        description: 'Birth chart reading (3rd opinion, the other 2 were wrong)',
        amount: 12000,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: 'Amethyst the size of my head (it called to me)',
        amount: 34000,
        categoryIndex: 0,
        panelIndex: 0,
      },
      {
        description: 'Moon water bottles (full moon batch, 12-pack)',
        amount: 4800,
        categoryIndex: 2,
        panelIndex: 0,
      },
      {
        description: 'Sage bundle (my apartment smells like a forest fire)',
        amount: 1899,
        categoryIndex: 3,
        panelIndex: 0,
      },
      {
        description: 'Custom zodiac nail art (each finger is a different sign)',
        amount: 8500,
        categoryIndex: 5,
        panelIndex: 0,
      },
      {
        description: 'Mercury retrograde survival kit (candles, crystals, wine)',
        amount: 6700,
        categoryIndex: 6,
        panelIndex: 0,
      },
      {
        description: 'Rose quartz for my desk, car, bathroom, and pocket',
        amount: 15600,
        categoryIndex: 0,
        panelIndex: 0,
      },
      {
        description: 'Tarot deck #9 (each deck has a different energy, okay?)',
        amount: 4200,
        categoryIndex: 4,
        panelIndex: 0,
      },
      {
        description: 'Co-Star premium (I need the daily notifications to function)',
        amount: 499,
        categoryIndex: 1,
        panelIndex: 1,
      },
      {
        description: 'Canceled first date (his moon was in Scorpio, absolutely not)',
        amount: 0,
        categoryIndex: 6,
        panelIndex: 0,
      },
      {
        description: "Aura photography session (I'm mostly purple, duh)",
        amount: 7500,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: "Retrograde-proof phone case (it's just a regular phone case)",
        amount: 3999,
        categoryIndex: 6,
        panelIndex: 0,
      },
      {
        description: 'Zodiac compatibility chart for my coworkers (HR was concerned)',
        amount: 8900,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: 'Sound bath healing session (I fell asleep, it still counts)',
        amount: 6500,
        categoryIndex: 2,
        panelIndex: 0,
      },
      {
        description: 'Crystal inventory for online shop',
        amount: 45000,
        categoryIndex: 8,
        panelIndex: 2,
      },
    ],
    [
      {
        description: 'Selenite charging plate (for charging my other crystals)',
        amount: 4500,
        categoryIndex: 0,
        panelIndex: 0,
      },
      {
        description: 'Zodiac constellation earrings (all 12 signs)',
        amount: 18900,
        categoryIndex: 5,
        panelIndex: 0,
      },
      { description: 'Palo santo bulk pack', amount: 2800, categoryIndex: 3, panelIndex: 0 },
      {
        description: 'Astrology workshop (I corrected the teacher)',
        amount: 15000,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: 'Full moon candle ritual supplies',
        amount: 3400,
        categoryIndex: 2,
        panelIndex: 0,
      },
      {
        description: 'Tarot cloth (silk, obviously)',
        amount: 5900,
        categoryIndex: 4,
        panelIndex: 0,
      },
      {
        description: 'Backup crystals for mercury retrograde',
        amount: 8900,
        categoryIndex: 6,
        panelIndex: 0,
      },
      {
        description: 'Client reading — 2-hour deep dive',
        amount: 20000,
        categoryIndex: 7,
        panelIndex: 2,
      },
    ],
  ),
}

const doomsdayPrepper: DemoPersona = {
  slug: 'doomsday-prepper',
  name: 'Doomsday Prepper',
  emoji: '\u{1F6E1}\uFE0F',
  tagline: "the apocalypse won't budget itself",
  categories: [
    { name: 'Bunker Supplies', color: NEON_COLORS.amber, routeType: 'personal' },
    { name: 'Canned Goods (Infinite)', color: NEON_COLORS.lime, routeType: 'personal' },
    { name: 'Survival Gear', color: NEON_COLORS.cyan, routeType: 'personal' },
    { name: 'Off-Grid Tech', color: NEON_COLORS.violet, routeType: 'personal' },
    { name: 'Bug-Out Bag Upgrades', color: NEON_COLORS.magenta, routeType: 'personal' },
    { name: 'Conspiracy Research', color: NEON_COLORS.orange, routeType: 'personal' },
    { name: 'Water Purification Obsession', color: NEON_COLORS.blue, routeType: 'personal' },
    { name: 'Survival Consulting', color: NEON_COLORS.teal, routeType: 'business' },
    { name: 'Bunker Construction', color: NEON_COLORS.rose, routeType: 'business' },
  ],
  panels: [
    {
      name: 'Daily Prep',
      currency: 'USD',
      recurrenceType: null,
      isDefault: true,
      routeType: 'personal',
    },
    {
      name: 'Monthly Stockpile',
      currency: 'USD',
      recurrenceType: 'monthly',
      isDefault: false,
      routeType: 'personal',
    },
    {
      name: 'Doomsday LLC',
      currency: 'USD',
      recurrenceType: null,
      isDefault: true,
      routeType: 'business',
    },
  ],
  expenses: buildPersonaExpenses(
    [
      {
        description: 'Canned beans (200 cans, "you can never have too many")',
        amount: 34000,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: "Solar panel for a bunker I haven't built yet",
        amount: 89900,
        categoryIndex: 3,
        panelIndex: 0,
      },
      {
        description: 'HAM radio license course (to talk to no one, louder)',
        amount: 7500,
        categoryIndex: 3,
        panelIndex: 0,
      },
      {
        description: "Faraday cage for my phone (the government can't hear me now)",
        amount: 12900,
        categoryIndex: 5,
        panelIndex: 0,
      },
      {
        description: '5-year freeze-dried food bucket (tastes like sadness)',
        amount: 45000,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: 'Night vision goggles (I use them to find snacks at 2am)',
        amount: 38900,
        categoryIndex: 2,
        panelIndex: 0,
      },
      {
        description: 'Water purification tablets (my tap water is fine but WHAT IF)',
        amount: 3499,
        categoryIndex: 6,
        panelIndex: 0,
      },
      {
        description: 'Survival knife with built-in compass, flint, and regret',
        amount: 8900,
        categoryIndex: 2,
        panelIndex: 0,
      },
      {
        description: "Underground bunker floor plan consultation (it's a studio apartment)",
        amount: 25000,
        categoryIndex: 0,
        panelIndex: 0,
      },
      {
        description: 'Gas mask (tried wearing it to the grocery store, got asked to leave)',
        amount: 7900,
        categoryIndex: 2,
        panelIndex: 0,
      },
      {
        description: 'Emergency hand-crank radio (I listen to podcasts on it)',
        amount: 4500,
        categoryIndex: 3,
        panelIndex: 0,
      },
      {
        description: 'Tactical flashlight (1000 lumens, I blinded my neighbor)',
        amount: 6700,
        categoryIndex: 2,
        panelIndex: 0,
      },
      {
        description: "50-gallon water storage drum (it's in my living room now)",
        amount: 12000,
        categoryIndex: 6,
        panelIndex: 0,
      },
      {
        description: "Bug-out bag version 7.0 (the other 6 weren't tactical enough)",
        amount: 27500,
        categoryIndex: 4,
        panelIndex: 0,
      },
      {
        description: "Seed vault (I've never gardened but post-apocalypse me will)",
        amount: 8900,
        categoryIndex: 0,
        panelIndex: 0,
      },
      {
        description: 'Bunker consulting client session',
        amount: 50000,
        categoryIndex: 7,
        panelIndex: 2,
      },
    ],
    [
      {
        description: 'Canned spam (120 cans, "variety is key")',
        amount: 24000,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: 'Paracord bracelet making kit',
        amount: 3400,
        categoryIndex: 4,
        panelIndex: 0,
      },
      {
        description: 'EMP-proof safe (for my seeds and beef jerky)',
        amount: 34900,
        categoryIndex: 0,
        panelIndex: 0,
      },
      {
        description: 'Survival podcast premium subscription',
        amount: 999,
        categoryIndex: 5,
        panelIndex: 1,
      },
      {
        description: 'Water filter replacement (monthly, just in case)',
        amount: 4999,
        categoryIndex: 6,
        panelIndex: 1,
      },
      {
        description: 'Tactical pants with 14 pockets (I use 3)',
        amount: 8900,
        categoryIndex: 2,
        panelIndex: 0,
      },
      {
        description: 'MRE taste test kit (all terrible, all purchased)',
        amount: 15900,
        categoryIndex: 1,
        panelIndex: 0,
      },
      {
        description: 'Bunker construction materials estimate',
        amount: 75000,
        categoryIndex: 8,
        panelIndex: 2,
      },
    ],
  ),
}

export const PERSONAS: Record<string, DemoPersona> = {
  'chaos-goblin': chaosGoblin,
  'tech-bro': techBro,
  'cat-parent': catParent,
  'aspiring-chef': aspiringChef,
  'gym-bro': gymBro,
  'astrology-girl': astrologyGirl,
  'doomsday-prepper': doomsdayPrepper,
}

export const PERSONA_LIST = Object.values(PERSONAS)
