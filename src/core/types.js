// Shapes shared across core/, as JSDoc typedefs (no code). They describe the values as the code builds them today;
// fields marked "later" arrive with the Phase F model changes in docs/ARCHITECTURE.md.

/**
 * A logged hunt (store document profiles/{pid}/sessions/{id}, or parseSession's result before saving).
 * @typedef {Object} Session
 * @property {string} [id]
 * @property {string} [spot] the spot name as logged
 * @property {string} [spotId] later: the user spot or spot id it was logged at
 * @property {string} [start] "YYYY-MM-DDTHH:MM:SS" from the analyser
 * @property {string} [end]
 * @property {number|null} hours
 * @property {number} [rawXp]
 * @property {number} [xp]
 * @property {number} [loot]
 * @property {number} [supplies]
 * @property {number} [balance]
 * @property {{count: number, name: string, slug?: string}[]} kills
 * @property {boolean} [breaks] the session had breaks: its kill rate doesn't count
 * @property {string|null} [task] the bounty creature's slug during the session
 * @property {Object<string, number>} [raidsBy] Echo Raids per creature slug
 * @property {number} [raids] older sessions: a raids total
 */

/**
 * A creature's working numbers (numbers.js effective).
 * @typedef {Object} Numbers
 * @property {number} [kph] kills per hour
 * @property {number} [xph] exp per hour
 * @property {number|null} [pph] profit per hour
 * @property {string} [spot]
 * @property {"own"|"refAdj"|"ref"|"otherAdj"|"other"} [src]
 * @property {Object} [refEntry] the reference entry, for reference numbers
 * @property {number} [sample] kills behind a derived kill rate
 * @property {number} [sampleHours]
 * @property {boolean} [profitStale]
 */

/**
 * A spot (spots.js spotIndex).
 * @typedef {Object} Spot
 * @property {string} id
 * @property {string} name
 * @property {string[]} aliases
 * @property {Object[]} entries reference entries
 * @property {Session[]} sessions
 * @property {Object<string, 1>} creatures
 * @property {string[]} vocations
 * @property {string[]} teams
 * @property {number|null} levelMin
 * @property {number|null} levelMax
 * @property {boolean} own only known from the character's sessions
 * @property {{travelMin?: number, access?: string, team?: string, notes?: string}} meta
 * @property {string} [parentId] later: a variation's parent spot
 * @property {boolean} [userMade] later
 */

/**
 * A step of the plan (plan.js planChain).
 * @typedef {Object} Step
 * @property {"finish"|"claim"|"hold"|"go"|"more"|"reroll"|"hunt"} kind later: "go" | "reroll" | "seeSpots"
 * @property {string} text
 * @property {string} why
 * @property {Object} [option] the spot value, for "go"
 * @property {Object} [offer] the offer, for "hold" and "finish"
 * @property {boolean} [taken] shown as "Taken? →"
 */

/**
 * Goal weights, whole numbers 0..5 (score.js MAX_WEIGHT); stored as `goal` (store/schema.js readGoal migrates the old 0–10 `weights`).
 * @typedef {{xp: number, profit: number, charm: number, bounty: number}} Weights
 */

export {};
