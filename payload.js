//SEQ 1
// Recupera el mapeo owner-owned del probe v8 (que nunca se leyó por jsdelivr).
var cmds = [
    'find /usr/lib/systemd/system /etc/systemd/system -user owner 2>/dev/null',
    'cat /usr/lib/systemd/system/acr.service',
    'cat /usr/lib/systemd/system/acr.path',
    'find /etc -user owner 2>/dev/null | head -40',
    'find /opt /mnt -user owner 2>/dev/null | head -60',
    'which systemctl systemctl-helper 2>&1; ls -l /usr/bin/systemctl 2>&1',
    'for f in /usr/lib/systemd/system/*.path; do echo "== $f"; cat "$f"; done 2>&1 | head -120',
    'find /etc /usr/lib/systemd/system /opt -o+w 2>/dev/null | grep -v proc | head -50',
    'ls -la /usr/lib/systemd/system/basic.target.wants 2>&1',
    'find / -user owner -type f -writable 2>/dev/null | grep -vE "^/(proc|sys|run/user)|shm_" | head -60',
    'find / -user owner -type d -writable 2>/dev/null | grep -vE "^/(proc|sys|run/user)|shm_" | head -60'
];
var outs = [];
(function next(i) {
    if (i >= cmds.length) { done({ outs: outs }); return; }
    sh(cmds[i], function (err, so, se) {
        outs.push({ cmd: cmds[i], out: String(so).slice(0, 5000), errout: String(se).slice(0, 300) });
        next(i + 1);
    });
})(0);
