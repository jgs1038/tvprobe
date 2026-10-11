/**
 * service.js — módulo TizenBrew: corre como servicio de la app TizenBrew
 * (uid del owner / contexto User::Pkg::xvvl3S1bvH hipotético).
 *
 * Fase A: diagnóstico — verifica prerrequisitos de la cadena root (ntk*, python, uid)
 * y envía el resultado al colector HTTP de la Mac.
 */
var cp = require('child_process');
var http = require('http');

var DEST_HOST = '192.168.1.35';
var DEST_PORT = 9999;

function run(cmd, cb) {
    cp.exec(cmd, { timeout: 8000 }, function (err, stdout, stderr) {
        cb({ cmd: cmd, err: err ? String(err.message || err) : null, out: String(stdout), errout: String(stderr) });
    });
}

var CMD_LIST = [
    'id',
    'uname -a',
    'cat /proc/cmdline',
    'ls -l /dev/ntk* 2>&1; ls -l /dev/sdp* 2>&1',
    'head -30 /proc/modules',
    'ls /proc | grep -c cpuinfo; cat /proc/cpuinfo | head -12',
    'which python3 python2 python php perl lua tclsh 2>&1',
    'python3 --version 2>&1; python2 --version 2>&1',
    'ls -ld /tmp /home/owner/share/tizenbrewConfig.json 2>&1',
    'ls -l /usr/apps/ 2>&1 | head -25',
    'ls -l /usr/apps/privileged-service/bin/mount.smb.sh 2>&1',
    'df -h 2>&1 | head -12'
];

var results = [];
function runNext(i) {
    if (i >= CMD_LIST.length) { report(results); return; }
    run(CMD_LIST[i], function (r) { results.push(r); runNext(i + 1); });
}

function report(all) {
    var body = JSON.stringify({ id: 'probe', ts: Date.now(), results: all });
    var req = http.request({
        host: DEST_HOST, port: DEST_PORT, path: '/probe', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, function (res) { res.resume(); });
    req.on('error', function (e) { console.log('probe POST err ' + e.message); });
    req.write(body);
    req.end();
}

console.log('EnvProbe service starting');
runNext(0);
