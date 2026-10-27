// Boot: creates the app over the embedded data, mounts the UI, and connects the db (the Claude artifact's shared db,
// else browser storage). The browser's objects (window, storage, location, downloads, files) are handed in from here.
import { DATA, REFERENCE, PL_EXP } from "./data/index.js";
import { createApp } from "./app/app.js";
import { mount } from "./ui/shell.js";
import { claudeDb, localDb, LOCAL_KEY } from "./store/db.js";
import { makePrefs } from "./store/prefs.js";

const w = window, host = w.claude, hasHost = !!(host && typeof host.use === "function");
const app = createApp({ data: { creatures: DATA, reference: REFERENCE, expTable: PL_EXP }, prefs: makePrefs(w.localStorage), now: () => Date.now() });

function download(name, text) {
  if (hasHost) {
    return host.use("downloads").then((dl) => (dl ? dl.save({ filename: name, data: text }).then(() => "Backup saved.") : "Downloads aren’t available in this view."))
      .catch((e) => { if (e && e.code === "declined") return ""; if (e && e.code === "rate_limited") return "A save prompt is already open."; throw e; });
  }
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" })), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return Promise.resolve("Backup saved to your downloads.");
}
function pickFile() {
  return new Promise((resolve) => {
    const i = document.createElement("input");
    i.type = "file"; i.accept = "application/json,.json";
    i.addEventListener("change", () => { const f = i.files && i.files[0]; if (!f) { resolve(null); return; } f.text().then(resolve, () => resolve(null)); });
    i.click();
  });
}

mount(document.getElementById("app"), app, {
  hash: () => w.location.hash, go: (r) => { w.location.hash = "#/" + r; }, onHashChange: (fn) => w.addEventListener("hashchange", fn), download, pickFile,
});
const local = () => localDb(w.localStorage, { now: () => Date.now(), listen: (fn) => w.addEventListener("storage", (e) => { if (e.key === LOCAL_KEY) fn(e.newValue); }) });
(hasHost ? claudeDb(host).then((ns) => ns || local()) : Promise.resolve(local())).then(app.connect);
if (hasHost) host.use("user").then((u) => u && u.canEdit().then((v) => app.setCanWrite(!!v))).catch(() => {});
