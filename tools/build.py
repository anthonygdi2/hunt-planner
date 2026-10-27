#!/usr/bin/env python3
"""Build the standalone, offline-capable version of Hunt Planner.

Input: the assembled page, dist/index.html from tools/assemble.js (the Claude artifact's HTML, with the data in
src/data inlined).
Output: a folder ready for GitHub Pages: index.html, manifest.webmanifest, sw.js, icons, font licence.

Usage:
  npm pack @fontsource/atkinson-hyperlegible   (then untar it into FONTS_DIR)
  node tools/assemble.js && python3 tools/build.py dist/index.html OUT_DIR FONTS_DIR   (npm run build: OUT_DIR . and
  FONTS_DIR fonts-cache)
"""
import base64, glob, hashlib, json, os, re, sys
from PIL import Image, ImageDraw

src, out, fonts = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)
html = open(src, encoding="utf-8").read()

# 1. Bundle the fonts (the dev page loads them from Google Fonts, which fails offline).
def woff2(pattern):
    path = glob.glob(os.path.join(fonts, "**", pattern), recursive=True)[0]
    return base64.b64encode(open(path, "rb").read()).decode()
def unicode_range(file_fam, subset, w):
    # The subset's characters, from the font package's own CSS (latin-ext has Polish and other accented letters).
    path = glob.glob(os.path.join(fonts, "*" + file_fam + "*", "%d.css" % w))[0]
    for block in re.findall(r"@font-face\s*\{[^}]*\}", open(path, encoding="utf-8").read()):
        if "-%s-%d-normal.woff2" % (subset, w) in block:
            return re.search(r"unicode-range:\s*([^;}]+)", block).group(1).strip()
    raise SystemExit("no unicode-range for %s %s %d" % (file_fam, subset, w))
faces = []
for fam, file_fam, weights in [("Atkinson Hyperlegible", "atkinson-hyperlegible", (400, 700))]:
    for w in weights:
        for subset in ("latin", "latin-ext"):
            faces.append("@font-face{font-family:'%s';font-style:normal;font-weight:%d;font-display:swap;src:url(data:font/woff2;base64,%s) format('woff2');unicode-range:%s;}"
                         % (fam, w, woff2("%s-%s-%d-normal.woff2" % (file_fam, subset, w)), unicode_range(file_fam, subset, w)))
html, n = re.subn(r'\s*<link rel="preconnect" href="https://fonts\.googleapis\.com">\s*<link rel="preconnect" href="https://fonts\.gstatic\.com" crossorigin>\s*<link href="https://fonts\.googleapis\.com/css2[^"]*" rel="stylesheet">',
                  "\n<style>" + "".join(faces) + "</style>", html)
assert n == 1, "Google Fonts links not found"

# 2. App manifest, icons and theme colour for installing to a phone or PC, and the preview a shared link shows (Discord,
# Reddit, forums), which needs absolute addresses: the GitHub Pages site.
PAGES_URL = "https://anthonygdi2.github.io/hunt-planner/"
DESCRIPTION = "Where to hunt right now in Tibia: a plan built around your Bounty Task offers, weekly tasks and goals."
head_tags = f"""
<meta name="description" content="{DESCRIPTION}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Hunt Planner">
<meta property="og:title" content="Hunt Planner for Tibia">
<meta property="og:description" content="{DESCRIPTION}">
<meta property="og:url" content="{PAGES_URL}">
<meta property="og:image" content="{PAGES_URL}icon-512.png">
<meta property="og:image:width" content="512">
<meta property="og:image:height" content="512">
<meta property="og:image:alt" content="Hunt Planner: three tier rows, S, A and B">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#f4f2ee" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#17191c" media="(prefers-color-scheme: dark)">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Hunt Planner">
"""
html = html.replace("<title>", head_tags + "<title>", 1)

# 3. Offline support (service worker) and a request to keep browser storage from being cleared.
register = """
<script>
(function () {
  if (window.claude) return;
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("./sw.js").catch(function () {}); });
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
})();
</script>
"""
idx = html.rindex("</body>")
html = html[:idx] + register + html[idx:]
open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(html)
version = hashlib.sha256(html.encode()).hexdigest()[:10]

files = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"]
sw = """// Hunt Planner offline cache. The version changes on every build, so updates roll out.
var CACHE = "btl-%s";
var FILES = %s;
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf("btl-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {
    // Fresh page when online, cached page when offline.
    e.respondWith(fetch(req).then(function (res) {
      var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put("index.html", copy); }); return res;
    }).catch(function () { return caches.match("index.html"); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req); }));
});
""" % (version, json.dumps(files))
open(os.path.join(out, "sw.js"), "w").write(sw)

manifest = {"name": "Hunt Planner", "short_name": "Hunt Planner", "description": "Plan your Tibia hunts around the Bounty Task board.",
            "start_url": "./", "scope": "./", "display": "standalone", "background_color": "#17191c", "theme_color": "#17191c",
            "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
                      {"src": "icon-512.png", "sizes": "512x512", "type": "image/png"},
                      {"src": "icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}
open(os.path.join(out, "manifest.webmanifest"), "w").write(json.dumps(manifest, indent=2))

# 4. Icon: three tier rows (S, A, B) in the page's colours, drawn as pixel art.
GLYPHS = {"S": [".###.", "#...#", "#....", ".###.", "....#", "#...#", ".###."],
          "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
          "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."]}
def icon(size, pad):
    S = 512
    img = Image.new("RGB", (S, S), "#23252a"); d = ImageDraw.Draw(img)
    x0, x1, row, gap = pad, S - pad, (S - 2 * pad - 2 * 16) // 3, 16
    for i, (ch, col) in enumerate([("S", "#ff7f7f"), ("A", "#ffbf7f"), ("B", "#ffdf7f")]):
        y = pad + i * (row + gap)
        d.rectangle([x0, y, x0 + row, y + row], fill=col)
        px = row // 9; gx = x0 + (row - 5 * px) // 2; gy = y + (row - 7 * px) // 2
        for r, line in enumerate(GLYPHS[ch]):
            for c, on in enumerate(line):
                if on == "#": d.rectangle([gx + c * px, gy + r * px, gx + (c + 1) * px - 1, gy + (r + 1) * px - 1], fill="#1c1e22")
        d.rectangle([x0 + row + 12, y, x1, y + row], fill="#2d3035")
        for k in range(3 - i):
            cx = x0 + row + 28 + k * (row // 1.6)
            d.rectangle([cx, y + row * 0.28, cx + row * 0.45, y + row * 0.72], fill="#474c54")
    return img.resize((size, size), Image.NEAREST if size >= 512 else Image.LANCZOS)
icon(512, 64).save(os.path.join(out, "icon-512.png"))
icon(192, 64).save(os.path.join(out, "icon-192.png"))
icon(180, 64).save(os.path.join(out, "apple-touch-icon.png"))
icon(512, 112).save(os.path.join(out, "icon-maskable-512.png"))

# 5. Font licence (SIL Open Font License requires it to travel with the fonts).
lic = []
for fam in ("atkinson-hyperlegible",):
    path = glob.glob(os.path.join(fonts, "*" + fam + "*", "LICENSE"))[0]
    lic.append("==== " + fam + " ====\n" + open(path).read())
open(os.path.join(out, "fonts-OFL.txt"), "w").write("\n\n".join(lic))
print("built", out, "version", version, "index.html", len(html), "bytes")
