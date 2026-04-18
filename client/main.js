(function () {
    "use strict";

    var cs = new CSInterface();
    var $ = function (id) { return document.getElementById(id); };

    var els = {
        baseTrack: $("baseTrack"),
        targetTrack: $("targetTrack"),
        tolerance: $("tolerance"),
        reloadBtn: $("reloadBtn"),
        runBtn: $("runBtn"),
        status: $("status"),
        version: $("versionLabel")
    };

    function setStatus(text, state) {
        els.status.className = "status" + (state ? " " + state : "");
        els.status.textContent = text;
    }

    function setBusy(busy) {
        els.runBtn.disabled = busy;
        els.reloadBtn.disabled = busy;
        els.baseTrack.disabled = busy;
        els.targetTrack.disabled = busy;
        els.tolerance.disabled = busy;
    }

    // Promise wrapper over CSInterface.evalScript. Host returns JSON.
    function evalHost(expr) {
        return new Promise(function (resolve, reject) {
            cs.evalScript(expr, function (raw) {
                if (raw === "EvalScript error." || raw === undefined || raw === "undefined") {
                    reject(new Error("ホストスクリプトの実行に失敗しました。"));
                    return;
                }
                try {
                    var parsed = JSON.parse(raw);
                    if (parsed.ok) resolve(parsed.data);
                    else reject(new Error(parsed.error || "不明なエラー"));
                } catch (e) {
                    reject(new Error("ホスト応答の解析に失敗: " + raw));
                }
            });
        });
    }

    function fillSelect(sel, tracks) {
        sel.innerHTML = "";
        tracks.forEach(function (t) {
            var opt = document.createElement("option");
            opt.value = String(t.index);
            opt.textContent = t.label + "  (" + t.clipCount + " 本" + (t.locked ? " · ロック中" : "") + ")";
            sel.appendChild(opt);
        });
    }

    function loadTracks() {
        setStatus("シーケンス情報を取得中…", "working");
        setBusy(true);
        evalHost("CA_listTracks()")
            .then(function (data) {
                if (!data.tracks || data.tracks.length === 0) {
                    setStatus("ビデオトラックが見つかりません。シーケンスを開いてから「更新」を押してください。", "err");
                    return;
                }
                fillSelect(els.baseTrack, data.tracks);
                fillSelect(els.targetTrack, data.tracks);
                els.baseTrack.value = "0";
                els.targetTrack.value = data.tracks.length > 1 ? "1" : "0";
                setStatus("シーケンス: " + data.sequenceName + "\nベースとテロップのトラックを選び、許容フレーム数を指定して「実行」を押してください。");
            })
            .catch(function (err) {
                setStatus(err.message, "err");
            })
            .then(function () { setBusy(false); });
    }

    function readParams() {
        var tol = parseInt(els.tolerance.value, 10);
        if (isNaN(tol) || tol < 1 || tol > 120) {
            throw new Error("許容フレーム数は 1〜120 の整数で指定してください。");
        }
        var baseIndex = parseInt(els.baseTrack.value, 10);
        var targetIndex = parseInt(els.targetTrack.value, 10);
        if (baseIndex === targetIndex) {
            throw new Error("ベースとテロップは別のトラックを選んでください。");
        }
        return { baseIndex: baseIndex, targetIndex: targetIndex, toleranceFrames: tol };
    }

    function run() {
        var params;
        try { params = readParams(); }
        catch (e) { setStatus(e.message, "err"); return; }

        setBusy(true);
        setStatus("対象クリップを数え上げ中…", "working");

        var paramsJson = JSON.stringify(params);
        evalHost("CA_plan(" + JSON.stringify(paramsJson) + ")")
            .then(function (plan) {
                var msg = "対象テロップ: " + plan.total + " 本\n"
                        + "スナップ対象: " + plan.snap + " 本\n"
                        + "スキップ: " + plan.skip + " 本（許容範囲外 or 既に一致）\n\n"
                        + "この内容で実行しますか？";
                if (!confirm(msg)) {
                    setStatus("キャンセルしました。");
                    return null;
                }
                setStatus("スナップ実行中…", "working");
                return evalHost("CA_execute(" + JSON.stringify(paramsJson) + ")");
            })
            .then(function (result) {
                if (!result) return;
                var lines = [
                    "完了しました。",
                    "",
                    "  スナップ済み: " + result.snapped + " 本",
                    "  スキップ:     " + result.skipped + " 本"
                ];
                if (result.failed > 0) lines.push("  失敗:         " + result.failed + " 本");
                lines.push("  合計:         " + result.total + " 本");
                lines.push("", "元に戻すには Cmd/Ctrl + Z。");
                setStatus(lines.join("\n"), "ok");
            })
            .catch(function (err) {
                setStatus(err.message, "err");
            })
            .then(function () { setBusy(false); });
    }

    els.reloadBtn.addEventListener("click", loadTracks);
    els.runBtn.addEventListener("click", run);

    // Theme sync — match host UI lightness if host exposes it.
    try {
        var hostEnv = cs.getHostEnvironment();
        var bg = hostEnv && hostEnv.appSkinInfo && hostEnv.appSkinInfo.panelBackgroundColor;
        if (bg && bg.color) {
            var lum = 0.299 * bg.color.red + 0.587 * bg.color.green + 0.114 * bg.color.blue;
            if (lum > 180) document.body.classList.add("light");
        }
    } catch (e) {}

    evalHost("CA_version()").then(function (v) {
        els.version.textContent = "v" + v.version;
    }).catch(function () { els.version.textContent = ""; });

    loadTracks();
})();
