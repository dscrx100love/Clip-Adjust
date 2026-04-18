#target premierepro

// Clip-Adjust / SubtitleSync
// Snap subtitle clips' IN points to the nearest base-clip IN within a frame tolerance.
// Requires: Adobe Premiere Pro 2024+ on macOS 12+ or Windows 10+.

(function () {
    var VERSION = "1.0.0";
    var TOOL_NAME = "Clip-Adjust / テロップ同期";

    // Premiere Pro tick resolution: 254,016,000,000 ticks per second.
    var TICKS_PER_SECOND = 254016000000;

    function main() {
        if (!app || !app.project) {
            alert("プロジェクトが開かれていません。");
            return;
        }

        var sequence = app.project.activeSequence;
        if (!sequence) {
            alert("アクティブなシーケンスがありません。");
            return;
        }

        var videoTracks = sequence.videoTracks;
        if (!videoTracks || videoTracks.numTracks === 0) {
            alert("ビデオトラックがありません。");
            return;
        }

        var trackLabels = [];
        for (var i = 0; i < videoTracks.numTracks; i++) {
            trackLabels.push("V" + (i + 1));
        }

        var params = showDialog(trackLabels);
        if (!params) return;

        var baseTrack = videoTracks[params.baseIndex];
        var targetTrack = videoTracks[params.targetIndex];

        if (isLocked(baseTrack)) {
            alert("ベーストラック (" + trackLabels[params.baseIndex] + ") がロックされています。\n解除してから実行してください。");
            return;
        }
        if (isLocked(targetTrack)) {
            alert("テロップトラック (" + trackLabels[params.targetIndex] + ") がロックされています。\n解除してから実行してください。");
            return;
        }

        var baseStarts = collectStartTicks(baseTrack);
        if (baseStarts.length === 0) {
            alert("ベーストラックにクリップがありません。");
            return;
        }

        var targetClips = collectClips(targetTrack);
        if (targetClips.length === 0) {
            alert("テロップトラックにクリップがありません。\n処理対象なしで終了します。");
            return;
        }

        var ticksPerFrame = getTicksPerFrame(sequence);
        var toleranceTicks = params.toleranceFrames * ticksPerFrame;

        var plan = [];
        var snapCount = 0;
        var skipCount = 0;
        for (var k = 0; k < targetClips.length; k++) {
            var clip = targetClips[k];
            var clipStart = parseTicks(clip.start.ticks);
            var nearest = findNearest(baseStarts, clipStart);
            var delta = nearest - clipStart;
            if (delta !== 0 && Math.abs(delta) <= toleranceTicks) {
                plan.push({ clip: clip, deltaTicks: delta });
                snapCount++;
            } else {
                skipCount++;
            }
        }

        if (params.preview) {
            var summary = "対象テロップ数: " + targetClips.length + " 本\n"
                        + "スナップ対象: " + snapCount + " 本\n"
                        + "スキップ: " + skipCount + " 本（許容範囲外または既に一致）\n\n"
                        + "実行しますか？";
            if (!confirm(summary)) return;
        }

        var executed = 0;
        var failed = 0;
        for (var m = 0; m < plan.length; m++) {
            if (moveClip(plan[m].clip, plan[m].deltaTicks)) {
                executed++;
            } else {
                failed++;
            }
        }

        var resultMsg = "完了しました。\n\n"
                     + "  スナップ済み: " + executed + " 本\n"
                     + "  スキップ: " + skipCount + " 本\n";
        if (failed > 0) {
            resultMsg += "  失敗: " + failed + " 本（API エラー）\n";
        }
        resultMsg += "  合計: " + targetClips.length + " 本";
        alert(resultMsg);
    }

    function getTicksPerFrame(sequence) {
        try {
            var settings = sequence.getSettings();
            var vfr = settings.videoFrameRate;
            var ticks = parseTicks(vfr.ticks);
            if (ticks > 0) return ticks;
        } catch (e) {}
        // Fallback: 29.97 fps
        return 8475667200;
    }

    function parseTicks(s) {
        return parseFloat(String(s));
    }

    function isLocked(track) {
        try {
            if (typeof track.isLocked === "function") return !!track.isLocked();
        } catch (e) {}
        return false;
    }

    function collectStartTicks(track) {
        var arr = [];
        var clips = track.clips;
        for (var i = 0; i < clips.numItems; i++) {
            arr.push(parseTicks(clips[i].start.ticks));
        }
        arr.sort(function (a, b) { return a - b; });
        return arr;
    }

    function collectClips(track) {
        var arr = [];
        var clips = track.clips;
        for (var i = 0; i < clips.numItems; i++) {
            arr.push(clips[i]);
        }
        return arr;
    }

    // Linear scan is fine for typical edit sizes (< a few thousand clips).
    // Ties resolve to the later (larger) IN per spec.
    function findNearest(sortedArr, value) {
        var best = sortedArr[0];
        var bestDist = Math.abs(value - best);
        for (var i = 1; i < sortedArr.length; i++) {
            var d = Math.abs(value - sortedArr[i]);
            if (d < bestDist) {
                best = sortedArr[i];
                bestDist = d;
            } else if (d === bestDist && sortedArr[i] > best) {
                best = sortedArr[i];
            }
        }
        return best;
    }

    // Slide the clip by deltaTicks (preserving duration).
    // Order of start/end assignment matters when the Premiere API
    // rejects start > end during the update.
    function moveClip(clip, deltaTicks) {
        try {
            var startTicks = parseTicks(clip.start.ticks);
            var endTicks = parseTicks(clip.end.ticks);
            var newStartTicks = Math.round(startTicks + deltaTicks);
            var newEndTicks = Math.round(endTicks + deltaTicks);
            if (newStartTicks < 0) return false;

            var newStart = new Time(); newStart.ticks = String(newStartTicks);
            var newEnd = new Time();   newEnd.ticks   = String(newEndTicks);

            if (deltaTicks > 0) {
                clip.end = newEnd;
                clip.start = newStart;
            } else {
                clip.start = newStart;
                clip.end = newEnd;
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    function showDialog(trackLabels) {
        var w = new Window("dialog", TOOL_NAME + "  v" + VERSION);
        w.orientation = "column";
        w.alignChildren = ["fill", "top"];
        w.margins = 16;
        w.spacing = 10;

        var LABEL_WIDTH = 140;

        var row1 = w.add("group");
        row1.alignChildren = ["left", "center"];
        var l1 = row1.add("statictext", undefined, "ベース動画トラック:");
        l1.preferredSize.width = LABEL_WIDTH;
        var baseDd = row1.add("dropdownlist", undefined, trackLabels);
        baseDd.selection = 0;
        baseDd.preferredSize.width = 120;

        var row2 = w.add("group");
        row2.alignChildren = ["left", "center"];
        var l2 = row2.add("statictext", undefined, "テロップトラック:");
        l2.preferredSize.width = LABEL_WIDTH;
        var targetDd = row2.add("dropdownlist", undefined, trackLabels);
        targetDd.selection = Math.min(1, trackLabels.length - 1);
        targetDd.preferredSize.width = 120;

        var row3 = w.add("group");
        row3.alignChildren = ["left", "center"];
        var l3 = row3.add("statictext", undefined, "許容フレーム数:");
        l3.preferredSize.width = LABEL_WIDTH;
        var tolInput = row3.add("edittext", undefined, "5");
        tolInput.characters = 5;
        var tolHint = row3.add("statictext", undefined, "（1〜120）");
        tolHint.graphics.foregroundColor = tolHint.graphics.newPen(tolHint.graphics.PenType.SOLID_COLOR, [0.5, 0.5, 0.5, 1], 1);

        var previewCb = w.add("checkbox", undefined, "処理前にプレビュー（件数のみ）");
        previewCb.value = true;

        var btns = w.add("group");
        btns.alignment = "right";
        var cancelBtn = btns.add("button", undefined, "キャンセル", { name: "cancel" });
        var okBtn = btns.add("button", undefined, "実行", { name: "ok" });

        var result = null;
        okBtn.onClick = function () {
            var tol = parseInt(tolInput.text, 10);
            if (isNaN(tol) || tol < 1 || tol > 120) {
                alert("許容フレーム数は 1〜120 の整数で指定してください。");
                return;
            }
            if (baseDd.selection.index === targetDd.selection.index) {
                alert("ベースとテロップは別々のトラックを指定してください。");
                return;
            }
            result = {
                baseIndex: baseDd.selection.index,
                targetIndex: targetDd.selection.index,
                toleranceFrames: tol,
                preview: previewCb.value
            };
            w.close();
        };
        cancelBtn.onClick = function () { w.close(); };

        w.show();
        return result;
    }

    main();
})();
