/**
 * service.js v9 — LOADER permanente (se añade en TizenBrew UNA sola vez).
 *
 * Flujo: cada 10 s hace GET a  http://192.168.1.35:8000/module/p_probe/payload.js
 * (fileserver del repo en la Mac). Si la 1a línea del payload es "//SEQ <n>"
 * y n > último ejecutado, ejecuta el resto del fichero y postea el resultado
 * a  http://192.168.1.35:9999/run  (collector).
 *
 * => Para cambiar de experimento NO hace falta nuevo tag/tile: se edita
 *    payload.js en el repo (subiendo el SEQ) y la TV lo pilla sola.
 *
 * API disponible dentro del payload (globals):
 *   sh(cmd, cb(err, stdout, stderr))   exec con timeout 15 s
 *   post(path, obj)                    POST al collector
 *   done(result)                       cierra el run y postea el resultado
 *   require, cp, fs, http              módulos Node
 */
var http = require('http');
var vm = require('vm');
var cp = require('child_process');
var fs = require('fs');

var MAC = '192.168.1.35';
var PAYLOAD_PATH = '/module/p_probe/payload.js';
var lastSeq = 0;
var busy = false;

function post(path, obj) {
    try {
        var body = JSON.stringify(obj);
        var req = http.request({ host: MAC, port: 9999, path: path, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
            function (res) { res.resume(); });
        req.on('error', function () { });
        req.setTimeout(10000, function () { req.abort(); });
        req.write(body); req.end();
    } catch (e) { }
}

function fetchPayload(cb) {
    var fin = false;
    var req = http.get({ host: MAC, port: 8000, path: PAYLOAD_PATH + '?r=' + Math.random(),
        headers: { 'Cache-Control': 'no-cache' } },
        function (res) {
            var d = '';
            res.on('data', function (c) { d += c; });
            res.on('end', function () { if (!fin) { fin = true; cb(null, d); } });
        });
    req.setTimeout(8000, function () { if (!fin) { fin = true; req.abort(); cb(new Error('timeout')); } });
    req.on('error', function (e) { if (!fin) { fin = true; cb(e); } });
}

function runPayload(seq, text) {
    busy = true;
    var finished = false;
    var code = text.replace(/^\/\/SEQ[^\n]*\n/, '');
    var timer = setTimeout(function () {
        if (!finished) {
            finished = true; busy = false;
            post('/run', { seq: seq, status: 'timeout', note: 'done() no llamado en 120 s' });
        }
    }, 120000);

    global.done = function (r) {
        if (finished) return;
        finished = true; clearTimeout(timer); busy = false;
        post('/run', { seq: seq, status: 'ok', result: (r === undefined ? null : r) });
    };
    global.post = post;
    global.MAC = MAC;
    global.sh = function (cmd, cb) { cp.exec(cmd, { timeout: 15000 }, cb); };
    global.require = require;
    global.cp = cp; global.fs = fs; global.http = http;

    try {
        vm.runInThisContext(code, 'payload.js');
        post('/run', { seq: seq, event: 'evaluated' });
    } catch (e) {
        if (!finished) {
            finished = true; clearTimeout(timer); busy = false;
            post('/run', { seq: seq, status: 'error', error: String(e && e.stack || e) });
        }
    }
}

function tick() {
    if (busy) return;
    fetchPayload(function (err, text) {
        if (err || !text) return;
        var m = text.match(/^\/\/SEQ\s+(\d+)/);
        if (!m) return;
        var seq = parseInt(m[1], 10);
        if (!(seq > lastSeq)) return;
        lastSeq = seq;
        post('/run', { seq: seq, event: 'start' });
        runPayload(seq, text);
    });
}

post('/boot', { v: 'v9-loader', time: new Date().toISOString() });
setInterval(tick, 10000);
setInterval(function () {
    post('/hb', { v: 'v9', seq: lastSeq, busy: busy, time: new Date().toISOString() });
}, 120000);
process.on('uncaughtException', function (e) {
    post('/err', { v: 'v9', msg: String(e && e.stack || e).slice(0, 2000) });
});
