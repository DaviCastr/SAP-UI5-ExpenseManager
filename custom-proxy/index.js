'use strict';

const http = require('http');
const https = require('https');

function forward(targetUrl) {
    const target = new URL(targetUrl);
    const mod = target.protocol === 'https:' ? https : http;

    return function proxyRequest(req, res, next) {
        const path = req.url;

        if (!path.startsWith('/api/') && path !== '/api' && !path.startsWith('/auth/') && path !== '/auth') {
            next();
            return;
        }

        // The app calls the backend via /api (OData) and /auth (token endpoints).
        // The CAP backend serves the OData service at /service/... (without the /api prefix).
        let outPath = path;
        if (outPath.startsWith('/api')) {
            outPath = outPath.slice('/api'.length) || '/';
        }

        const headers = Object.assign({}, req.headers);
        headers.host = target.host;
        headers['x-forwarded-proto'] = 'https';

        const upstream = mod.request({
            hostname: target.hostname,
            port: target.port || (target.protocol === 'https:' ? 443 : 80),
            path: outPath,
            method: req.method,
            headers: headers
        }, (up) => {
            res.writeHead(up.statusCode, up.headers);
            up.pipe(res);
        });

        upstream.on('error', (error) => {
            console.error('[expense-local-proxy] upstream error:', error.message);
            if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'text/plain' });
            }
            res.end('Backend unreachable');
        });

        req.pipe(upstream);
    };
}

module.exports = ({ options } = {}) => {
    const backend = options && (options.backend || (options.configuration && options.configuration.backend));

    if (!backend) {
        throw new Error('expense-manager-local-proxy: configuration.backend is required');
    }

    return forward(backend);
};
