// Clip-Adjust / SubtitleSync — Premiere Pro host-side logic.
// Exposes CA_* entry points invoked from the CEP panel via CSInterface.evalScript().
// Pure: no ScriptUI, no alerts. Returns JSON strings to the panel.

#target premierepro

var CA_VERSION = "1.0.0";
var CA_TICKS_PER_SECOND = 254016000000;

// Return shape: { ok: boolean, error?: string, data?: {...} }
function CA_ok(data) { return JSON.stringify({ ok: true, data: data }); }
function CA_err(msg) { return JSON.stringify({ ok: false, error: String(msg) }); }

function CA_parseTicks(s) { return parseFloat(String(s)); }

function CA_getActiveSequence() {
    if (!app || !app.project) throw new Error("プロジェクトが開かれていません。");
    var seq = app.project.activeSequence;
    if (!seq) throw new Error("アクティブなシーケンスがありません。");
    return seq;
}

function CA_ticksPerFrame(sequence) {
    try {
        var settings = sequence.getSettings();
        var vfr = settings.videoFrameRate;
        var t = CA_parseTicks(vfr.ticks);
        if (t > 0) return t;
    } catch (e) {}
    return 8475667200;
}

function CA_isLocked(track) {
    try {
        if (typeof track.isLocked === "function") return !!track.isLocked();
    } catch (e) {}
    return false;
}

// --- Entry: list video tracks in the active sequence. ---
function CA_listTracks() {
    try {
        var seq = CA_getActiveSequence();
        var tracks = seq.videoTracks;
        var out = [];
        if (tracks) {
            for (var i = 0; i < tracks.numTracks; i++) {
                var t = tracks[i];
                out.push({
                    index: i,
                    label: "V" + (i + 1),
                    clipCount: t.clips ? t.clips.numItems : 0,
                    locked: CA_isLocked(t)
                });
            }
        }
        return CA_ok({
            sequenceName: seq.name,
            tracks: out,
            ticksPerFrame: CA_ticksPerFrame(seq)
        });
    } catch (e) {
        return CA_err(e.message || e);
    }
}

function CA_collectStartTicks(track) {
    var arr = [];
    var clips = track.clips;
    for (var i = 0; i < clips.numItems; i++) {
        arr.push(CA_parseTicks(clips[i].start.ticks));
    }
    arr.sort(function (a, b) { return a - b; });
    return arr;
}

function CA_collectClips(track) {
    var arr = [];
    var clips = track.clips;
    for (var i = 0; i < clips.numItems; i++) arr.push(clips[i]);
    return arr;
}

// Ties resolve to the later IN per spec.
function CA_findNearest(sorted, value) {
    var best = sorted[0];
    var bestDist = Math.abs(value - best);
    for (var i = 1; i < sorted.length; i++) {
        var d = Math.abs(value - sorted[i]);
        if (d < bestDist) { best = sorted[i]; bestDist = d; }
        else if (d === bestDist && sorted[i] > best) { best = sorted[i]; }
    }
    return best;
}

// The start/end assignment order matters: Premiere rejects start > end mid-update.
function CA_moveClip(clip, deltaTicks) {
    try {
        var s = CA_parseTicks(clip.start.ticks);
        var e = CA_parseTicks(clip.end.ticks);
        var ns = Math.round(s + deltaTicks);
        var ne = Math.round(e + deltaTicks);
        if (ns < 0) return false;

        var t1 = new Time(); t1.ticks = String(ns);
        var t2 = new Time(); t2.ticks = String(ne);

        if (deltaTicks > 0) { clip.end = t2; clip.start = t1; }
        else { clip.start = t1; clip.end = t2; }
        return true;
    } catch (err) {
        return false;
    }
}

// --- Entry: dry-run plan without mutating the timeline. ---
// params: { baseIndex, targetIndex, toleranceFrames }
function CA_plan(paramsJson) {
    try {
        var p = JSON.parse(paramsJson);
        var seq = CA_getActiveSequence();
        var tracks = seq.videoTracks;

        if (p.baseIndex === p.targetIndex) throw new Error("ベースとテロップは別のトラックを指定してください。");
        if (p.baseIndex < 0 || p.baseIndex >= tracks.numTracks) throw new Error("ベーストラック番号が不正です。");
        if (p.targetIndex < 0 || p.targetIndex >= tracks.numTracks) throw new Error("テロップトラック番号が不正です。");

        var base = tracks[p.baseIndex];
        var target = tracks[p.targetIndex];
        if (CA_isLocked(base)) throw new Error("ベーストラックがロックされています。");
        if (CA_isLocked(target)) throw new Error("テロップトラックがロックされています。");

        var baseStarts = CA_collectStartTicks(base);
        if (baseStarts.length === 0) throw new Error("ベーストラックにクリップがありません。");

        var targets = CA_collectClips(target);
        var tpf = CA_ticksPerFrame(seq);
        var tol = p.toleranceFrames * tpf;

        var willSnap = 0, willSkip = 0;
        for (var i = 0; i < targets.length; i++) {
            var ts = CA_parseTicks(targets[i].start.ticks);
            var n = CA_findNearest(baseStarts, ts);
            var delta = n - ts;
            if (delta !== 0 && Math.abs(delta) <= tol) willSnap++;
            else willSkip++;
        }

        return CA_ok({
            total: targets.length,
            snap: willSnap,
            skip: willSkip,
            ticksPerFrame: tpf
        });
    } catch (e) {
        return CA_err(e.message || e);
    }
}

// --- Entry: execute the snap. ---
function CA_execute(paramsJson) {
    try {
        var p = JSON.parse(paramsJson);
        var seq = CA_getActiveSequence();
        var tracks = seq.videoTracks;

        if (p.baseIndex === p.targetIndex) throw new Error("ベースとテロップは別のトラックを指定してください。");

        var base = tracks[p.baseIndex];
        var target = tracks[p.targetIndex];
        if (CA_isLocked(base)) throw new Error("ベーストラックがロックされています。");
        if (CA_isLocked(target)) throw new Error("テロップトラックがロックされています。");

        var baseStarts = CA_collectStartTicks(base);
        if (baseStarts.length === 0) throw new Error("ベーストラックにクリップがありません。");

        var targets = CA_collectClips(target);
        var tpf = CA_ticksPerFrame(seq);
        var tol = p.toleranceFrames * tpf;

        var plan = [];
        var skip = 0;
        for (var i = 0; i < targets.length; i++) {
            var ts = CA_parseTicks(targets[i].start.ticks);
            var n = CA_findNearest(baseStarts, ts);
            var delta = n - ts;
            if (delta !== 0 && Math.abs(delta) <= tol) {
                plan.push({ clip: targets[i], delta: delta });
            } else {
                skip++;
            }
        }

        // Moves in one pass; Premiere collapses them into a single undo step per session.
        var snapped = 0, failed = 0;
        for (var k = 0; k < plan.length; k++) {
            if (CA_moveClip(plan[k].clip, plan[k].delta)) snapped++;
            else failed++;
        }

        return CA_ok({
            total: targets.length,
            snapped: snapped,
            skipped: skip,
            failed: failed
        });
    } catch (e) {
        return CA_err(e.message || e);
    }
}

// --- Entry: version probe used by the panel on load. ---
function CA_version() { return CA_ok({ version: CA_VERSION }); }
