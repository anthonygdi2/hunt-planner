// Game facts: the only place a game number lives (docs/ARCHITECTURE.md). Each value says where it comes from and how
// sure we are; change one only with evidence and update its source. UI constants (labels, colors) and the app's own
// model parameters (calibration clamps, discount rates) don't belong here. Frozen, so nothing can change them at run time.

const deepFreeze = (o) => { Object.values(o).forEach((v) => { if (v && typeof v === "object") deepFreeze(v); }); return Object.freeze(o); };

// The vocations (promoted names, as the Hunting Analyser and TibiaPal use them). The first is the default.
export const VOCATIONS = deepFreeze(["Elite Knight", "Royal Paladin", "Elder Druid", "Master Sorcerer", "Exalted Monk"]);

// Bounty task difficulties, easiest first.
export const DIFFICULTIES = deepFreeze(["beginner", "adept", "expert", "master"]);

// Task pools as the bitmask in creatures.json's `m` (TibiaWiki Task Board, verified by checksum, September 2026:
// Beginner 153, Adept 450, Expert 498, Master 280 creatures). Pools follow bestiary class: Easy → Beginner + Adept,
// Medium → Adept + Expert, Hard → Expert + Master, Challenging → Master.
export const POOL_BIT = deepFreeze({ beginner: 1, adept: 2, expert: 4, master: 8 });
export const ALL_POOLS = 15;

// Bounty points per finished task and the kill range of an offer (TibiaWiki Task Board).
export const TASK = deepFreeze({
  beginner: { points: 3, minKills: 50, maxKills: 100 },
  adept: { points: 7, minKills: 100, maxKills: 200 },
  expert: { points: 16, minKills: 200, maxKills: 400 },
  master: { points: 27, minKills: 300, maxKills: 600 },
});

// Silver doubles and Gold quadruples both the exp reward and the bounty points; the reward shown in game already
// includes the bonus (TibiaWiki Task Board).
export const KIND_MULT = deepFreeze({ normal: 1, silver: 2, gold: 4 });

// Exp paid per required kill, before Silver or Gold. Master (Hard creatures) is exactly 1,875: ten logged offers at
// levels 612-613, no level effect seen. Expert 510, Adept 97.5 and Beginner 15 follow the open-source Canary server
// model and are unverified.
export const REWARD_PER_KILL = deepFreeze({ beginner: 15, adept: 97.5, expert: 510, master: 1875 });
// Challenging creatures on Master pay more per kill than Hard ones, and the rate differs by creature (Gorerilla 2,035,
// Infernal Demon 2,844, Knight's Apparition 3,088, logged at level 615). Creatures not seen yet use their average.
export const CHALLENGING_MASTER_REWARD = 2699;

// Bestiary per class: kills to finish, charm points for finishing, and charm points for the first Echo Warden kill
// (TibiaWiki Bestiary and Echo Raids).
export const BESTIARY = deepFreeze({
  E: { kills: 500, charmPoints: 15, warden: 5 },
  M: { kills: 1000, charmPoints: 25, warden: 10 },
  H: { kills: 2500, charmPoints: 50, warden: 15 },
  C: { kills: 5000, charmPoints: 100, warden: 30 },
});

// Echo Raids (TibiaWiki): a Warden leads 10% of raids, 20% once the creature's bestiary is finished; rare creatures
// can't start raids. The per-kill raid chance isn't published: assume 0.1%, blended with logged raids as if the
// prior were 5 raids in 5,000 kills.
export const RAID = deepFreeze({ wardenShare: 0.1, wardenShareDone: 0.2, priorPerKill: 0.001, priorKills: 5000 });

// Weekly kill task exp by character level (TibiaWiki): 25L² − 75L + 100 up to level 82, round(1994.008 × L) for
// 83-999, 2L² − 6L + 8 from 1000. Null for no level.
export function weeklyExpFormula(L) { if (!(L > 0)) return null; return L <= 82 ? 25 * L * L - 75 * L + 100 : L < 1000 ? Math.round(1994.008 * L) : 2 * L * L - 6 * L + 8; }
// Weekly reward caps by difficulty (Master has none), and the most kill tasks a week can have.
export const WEEKLY_CAP = deepFreeze({ beginner: 200000, adept: 800000, expert: 3000000, master: Infinity });
// The level each weekly difficulty needs, and the Hunting Task Points a finished kill task gives before the weekly
// multiplier (TibiaWiki BR Weekly Tasks, August 2026; TibiaWiki Task Board). The difficulty is picked for the next week
// when last week's rewards are collected and can't change until the next Monday.
export const WEEKLY_MIN_LEVEL = deepFreeze({ beginner: 0, adept: 30, expert: 150, master: 400 });
export const WEEKLY_KILL_POINTS = deepFreeze({ beginner: 25, adept: 50, expert: 100, master: 110 });
export const WEEKLY_MAX_TASKS = 9;

// Server save, when daily things (Boosted Creature) and the weekly tasks (Mondays) reset, treated as 08:00 UTC.
export const SERVER_SAVE_UTC_HOUR = 8;

// Reroll tokens: +1 per finished bounty task, +1 claimable per day, at most 10. Changing the bounty difficulty while a
// task is active is free (the next board uses it); while choosing offers, seeing another difficulty's board takes a
// reroll (TibiaWiki BR Bounty Tasks, June 2026).
export const TOKEN_CAP = 10;

// Preferred and Unwanted lists: up to 5 creatures each. Odds use the community model: a Preferred creature is drawn
// with weight 5, Unwanted ones are removed from the pool, and a board shows 3 offers. Unofficial.
export const SLOTS = deepFreeze({ max: 5, preferredWeight: 5, offers: 3 });

// Boosted Creature (TibiaWiki, October 2026): changes at each server save; double experience (also double loot and
// twice the respawn, which aren't counted).
export const BOOSTED_EXP_MULT = 2;

// Prey (TibiaWiki): three slots, each one creature for 2 hours of hunting.
export const PREY_SLOTS = 3;
// Prey bonuses in percent (TibiaWiki): bonus experience and improved loot 13-40% in steps of 3, damage boost 7-25% and
// damage reduction 12-30% in steps of 2. Only bonus experience is counted.
export const PREY = deepFreeze({
  xp: { lo: 13, hi: 40, step: 3 }, loot: { lo: 13, hi: 40, step: 3 },
  damage: { lo: 7, hi: 25, step: 2 }, defense: { lo: 12, hi: 30, step: 2 },
});

// Exp events in percent (TibiaWiki, Experience Point): Double Experience (+100%, about 6 a year) and world-quest
// bonuses (+10% to +50%, some limited to certain creatures).
export const EXP_EVENTS = deepFreeze({ double: 100, world: [50, 30, 25, 10] });
