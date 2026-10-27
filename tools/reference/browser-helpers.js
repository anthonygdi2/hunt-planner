// Paste this whole file into the in-app browser's javascript tool on any youtube.com/watch page (see
// .claude/skills/reference-batch/SKILL.md). It defines window.__ref for reading a guide's results slide:
//   await __ref.dates([ids])    publish dates (YYYY-MM-DD) and titles, fetched from the watch pages
//   await __ref.open(id)        loads the video in this player, skips ads, forces 1080p, finds the results slide
//                               (tries 0:12, 0:08, 0:04, 0:20, 0:30, 0:45, 1:00) and keeps that frame
//   await __ref.grab(t)         keeps the frame at t seconds instead
//   __ref.show(part)            draws part of the kept frame over the page for a screenshot: "full", "summary",
//                               "numbers", "kills", or [x, y, w, h] in 1920x1080 frame pixels
//   __ref.hide()                removes the overlay
// Screenshots lag one paint: wait 2 s, take a throwaway screenshot, then the real one.
window.__ref = (function () {
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var player = function () { return document.getElementById("movie_player"); };
  var frame = null;
  var PARTS = { full: [0, 0, 1920, 1080], summary: [0, 180, 460, 620], numbers: [470, 235, 320, 320], kills: [470, 540, 320, 290] };

  async function skipAds() {
    var mp = player();
    for (var i = 0; i < 90 && mp.classList.contains("ad-showing"); i++) {
      var b = document.querySelector(".ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button");
      if (b) b.click();
      await sleep(1000);
    }
    return !mp.classList.contains("ad-showing");
  }

  async function hd() {
    var mp = player(), v = document.querySelector("video");
    v.muted = true;
    if (mp.setPlaybackQualityRange) mp.setPlaybackQualityRange("hd1080", "hd1080");
    for (var i = 0; i < 30 && v.videoHeight !== 1080; i++) { mp.playVideo(); await sleep(1000); mp.pauseVideo(); await sleep(300); }
    mp.pauseVideo();
    return v.videoHeight;
  }

  async function grab(t) {
    var v = document.querySelector("video");
    if (!(await skipAds())) return { error: "ad still showing" };
    var h = await hd();
    if (h !== 1080) return { error: "video height " + h + ", not 1080" };
    await new Promise(function (r) { v.addEventListener("seeked", r, { once: true }); v.currentTime = t; });
    await sleep(800);
    var c = document.createElement("canvas");
    c.width = 1920; c.height = 1080;
    c.getContext("2d").drawImage(v, 0, 0, 1920, 1080);
    frame = c;
    var d = player().getVideoData();
    return { video: d.video_id, title: d.title, t: Math.round(v.currentTime), slide: isSlide() };
  }

  // The 2026 results slide has orange label cells down the left (Starting level, Raw Experience, ...), about
  // rgb(236, 125, 48); sampled at x 60, where some points can land on label text.
  function isSlide() {
    var g = frame.getContext("2d"), hits = 0;
    [245, 290, 530, 560, 710, 740].forEach(function (y) {
      var p = g.getImageData(60, y, 1, 1).data;
      if (p[0] > 200 && p[1] > 100 && p[1] < 150 && p[2] < 90) hits++;
    });
    return hits >= 4;
  }

  async function open(id) {
    hide();
    var mp = player();
    if (mp.getVideoData().video_id !== id) { mp.loadVideoById(id); await sleep(4000); }
    var tries = [12, 8, 4, 20, 30, 45, 60], r = null;
    for (var i = 0; i < tries.length; i++) {
      r = await grab(tries[i]);
      if (r.error || r.slide) return r;
    }
    r.error = "no results slide found at " + tries.join(", ") + " s; the frame kept is " + r.t + " s";
    return r;
  }

  function show(part) {
    var rect = typeof part === "string" ? PARTS[part] : part;
    var o = document.getElementById("__ov");
    if (!o) {
      o = document.createElement("canvas");
      o.id = "__ov";
      o.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;background:#000";
      document.body.appendChild(o);
    }
    // On a scaled display (devicePixelRatio 1.5) the pane's screenshots only cover the top-left clientWidth/dpr by
    // clientHeight/dpr CSS pixels, so the crop is drawn inside that box. The canvas has one pixel per device pixel,
    // which makes that box clientWidth by clientHeight canvas pixels.
    var dpr = Math.max(1, window.devicePixelRatio || 1), cw = document.documentElement.clientWidth, ch = document.documentElement.clientHeight;
    o.width = Math.round(cw * dpr); o.height = Math.round(ch * dpr);
    o.style.width = cw + "px"; o.style.height = ch + "px"; o.style.display = "block";
    var g = o.getContext("2d");
    g.fillStyle = "#000"; g.fillRect(0, 0, o.width, o.height);
    var s = Math.min(cw / rect[2], ch / rect[3]);
    g.drawImage(frame, rect[0], rect[1], rect[2], rect[3], 0, 0, rect[2] * s, rect[3] * s);
    return { part: part, scale: +s.toFixed(2), dpr: dpr };
  }

  function hide() { var o = document.getElementById("__ov"); if (o) o.style.display = "none"; }

  async function dates(ids) {
    var out = {};
    for (var i = 0; i < ids.length; i++) {
      var h = await (await fetch("/watch?v=" + ids[i])).text();
      out[ids[i]] = { published: ((h.match(/"publishDate":"(\d{4}-\d{2}-\d{2})/) || [])[1]) || null, title: ((h.match(/<title>([^<]*)/) || [])[1]) || null };
    }
    return out;
  }

  return { open: open, grab: grab, show: show, hide: hide, dates: dates, isSlide: function () { return isSlide(); } };
})();
"__ref ready";
