// Per-device preferences (btl.* keys in a Storage: localStorage in the page). Reads and writes never throw: a blocked
// or full storage just forgets.
export const PREF = { profile: "btl.profile", advanced: "btl.adv", ui: "btl.ui", theme: "btl.theme" };

export function makePrefs(storage) {
  return {
    get: (k) => { try { return storage ? storage.getItem(k) : null; } catch (e) { return null; } },
    set: (k, v) => { try { if (storage) storage.setItem(k, v); } catch (e) { /* not saved */ } },
  };
}
