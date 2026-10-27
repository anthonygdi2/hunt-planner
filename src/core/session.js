// Reading Tibia's Hunting Session Analyser text.
import { norm, toInt } from "./text.js";
import { EN } from "./i18n.js";

// text: what the player pasted. catalog: makeCatalog(...), to match kill names to creatures.
// Returns {kills [{count, name, slug?}], start?, end?, minutes?, hours, rawXp?, xp?, loot?, supplies?, balance?}.
// Kills whose name matches a creature get its slug and canonical name. hours comes from the Session data line (end −
// start), else the Session line's h:mm; null when neither is there. A missing balance is loot − supplies.
// Never throws: sessionProblems() says what's missing.
export function parseSession(text, catalog) {
  const out = { kills: [], section: null };
  String(text || "").replace(/\r\n?/g, "\n").split("\n").forEach((line) => {
    const t = line.trim();
    if (!t) return;
    let m = t.match(/^Session data:\s*From\s+(\d{4}-\d{2}-\d{2}),?\s+(\d{1,2}:\d{2}:\d{2})\s+to\s+(\d{4}-\d{2}-\d{2}),?\s+(\d{1,2}:\d{2}:\d{2})/i);
    if (m) { out.start = m[1] + "T" + m[2]; out.end = m[3] + "T" + m[4]; return; }
    if (/^Killed Monsters:?$/i.test(t)) { out.section = "kills"; return; }
    if (/^Looted Items:?$/i.test(t)) { out.section = "loot"; return; }
    if (out.section === "kills") {
      m = t.match(/^(\d[\d,.]*)\s*x\s+(.+?)(?:\s{2,}.*|\t.*)?$/i);
      if (m) { out.kills.push({ count: toInt(m[1]), name: m[2].trim() }); return; }
    }
    if (out.section === "loot") return;
    m = t.match(/^([^:]+):\s*(.*)$/);
    if (!m) return;
    const key = m[1].trim().toLowerCase(), val = m[2];
    if (key === "session") { const hm = val.match(/(\d+):(\d{2})/); if (hm) out.minutes = parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10); }
    else if (key === "raw xp gain") out.rawXp = toInt(val);
    else if (key === "xp gain") out.xp = toInt(val);
    else if (key === "loot") out.loot = toInt(val);
    else if (key === "supplies") out.supplies = toInt(val);
    else if (key === "balance") out.balance = toInt(val);
  });
  let h = null;
  if (out.start && out.end) { const a = new Date(out.start), b = new Date(out.end); if (!isNaN(a) && !isNaN(b) && b > a) h = (b - a) / 3.6e6; }
  if (!h && out.minutes) h = out.minutes / 60;
  out.hours = h;
  if (out.balance == null && out.loot != null && out.supplies != null) out.balance = out.loot - out.supplies;
  out.kills.forEach((k) => { const c = catalog.byName[norm(k.name)]; if (c) { k.slug = c.slug; k.name = c.name; } });
  delete out.section;
  return out;
}

// What keeps a parsed session from being saved, as one sentence for the player; "" when it's fine.
export function sessionProblems(p, t) {
  t = t || EN;
  if (!p) return t("Paste the text from the Hunting Session Analyser.");
  if (!p.hours) return t("Couldn’t find the session length. Make sure the Session data or Session line is included.");
  if (!p.kills.length) return t("Couldn’t find any killed monsters. Make sure the Killed Monsters section is included.");
  if (p.rawXp == null && p.xp == null) return t("Couldn’t find the XP lines.");
  return "";
}
