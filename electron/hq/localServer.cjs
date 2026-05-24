const fs = require('fs');
const fsp = require('fs/promises');
const http = require('http');
const https = require('https');
const path = require('path');

const rewriteSetCookieHeaders = (headers) => {
    const setCookie = headers['set-cookie'];
    if (!Array.isArray(setCookie)) {
        return headers;
    }

    return {
        ...headers,
        'set-cookie': setCookie.map((cookie) => (
            cookie
                .replace(/;\s*Secure/gi, '')
                .replace(/;\s*Domain=[^;]+/gi, '')
        ))
    };
};

const createLocalServerRuntime = ({
    getDistRoot,
    getMimeType,
    proxyPrefixes,
    desktopHelperPrefix,
    helperPort,
    getHelperError
}) => {
    let localServer = null;
    let localServerUrl = '';

    const isProxyRequest = (pathname) => proxyPrefixes.some((prefix) => (
        pathname === prefix || pathname.startsWith(`${prefix}/`)
    ));

    const isDesktopHelperRequest = (pathname) => (
        pathname === desktopHelperPrefix || pathname.startsWith(`${desktopHelperPrefix}/`)
    );

    const proxyRequest = (req, res, apiOrigin) => {
        const targetUrl = new URL(req.url || '/', apiOrigin);
        const client = targetUrl.protocol === 'http:' ? http : https;
        const headers = {
            ...req.headers,
            host: targetUrl.host
        };

        delete headers.origin;
        delete headers.referer;

        const proxy = client.request({
            protocol: targetUrl.protocol,
            hostname: targetUrl.hostname,
            port: targetUrl.port || undefined,
            method: req.method,
            path: `${targetUrl.pathname}${targetUrl.search}`,
            headers
        }, (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 502, rewriteSetCookieHeaders(proxyRes.headers));
            proxyRes.pipe(res);
        });

        proxy.on('error', (error) => {
            if (res.headersSent) {
                res.destroy(error);
                return;
            }

            res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'HQ API недоступен.' }));
        });

        req.pipe(proxy);
    };

    const proxyDesktopHelperRequest = (req, res) => {
        const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${helperPort}`);
        const helperPathname = requestUrl.pathname === desktopHelperPrefix
            ? '/'
            : requestUrl.pathname.slice(desktopHelperPrefix.length) || '/';
        const proxy = http.request({
            protocol: 'http:',
            hostname: '127.0.0.1',
            port: helperPort,
            method: req.method,
            path: `${helperPathname}${requestUrl.search}`,
            headers: {
                ...req.headers,
                host: `127.0.0.1:${helperPort}`
            }
        }, (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
            proxyRes.pipe(res);
        });

        proxy.on('error', (error) => {
            if (res.headersSent) {
                res.destroy(error);
                return;
            }

            res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
                error: getHelperError() || 'Встроенный video helper недоступен.'
            }));
        });

        req.pipe(proxy);
    };

    const sendFile = async (res, filePath) => {
        try {
            const stat = await fsp.stat(filePath);
            if (!stat.isFile()) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }

            res.writeHead(200, {
                'content-type': getMimeType(filePath),
                'content-length': stat.size
            });
            fs.createReadStream(filePath).pipe(res);
        } catch {
            res.writeHead(404);
            res.end('Not found');
        }
    };

    const resolveStaticPath = (distRoot, pathname) => {
        let decodedPathname = '/';
        try {
            decodedPathname = decodeURIComponent(pathname);
        } catch {
            decodedPathname = '/';
        }

        const normalizedPath = path.normalize(decodedPathname).replace(/^(\.\.(\/|\\|$))+/, '');
        const candidatePath = path.join(distRoot, normalizedPath);
        const relativePath = path.relative(distRoot, candidatePath);

        if (relativePath.startsWith('..') || path.isAbsolute(relativePath) || !path.extname(candidatePath)) {
            return path.join(distRoot, 'index.html');
        }

        return candidatePath;
    };

    return {
        async start(apiOrigin) {
            if (localServer && localServerUrl) {
                return localServerUrl;
            }

            const distRoot = getDistRoot();
            await fsp.access(path.join(distRoot, 'index.html'));

            const server = http.createServer((req, res) => {
                const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');

                if (isDesktopHelperRequest(requestUrl.pathname)) {
                    proxyDesktopHelperRequest(req, res);
                    return;
                }

                if (isProxyRequest(requestUrl.pathname)) {
                    proxyRequest(req, res, apiOrigin);
                    return;
                }

                void sendFile(res, resolveStaticPath(distRoot, requestUrl.pathname));
            });

            await new Promise((resolve, reject) => {
                server.once('error', reject);
                server.listen(0, '127.0.0.1', () => {
                    server.off('error', reject);
                    resolve(undefined);
                });
            });

            const address = server.address();
            if (!address || typeof address === 'string') {
                server.close();
                throw new Error('Не удалось определить локальный порт HQ.');
            }

            localServer = server;
            localServerUrl = `http://127.0.0.1:${address.port}`;
            return localServerUrl;
        },
        stop() {
            if (localServer) {
                localServer.close();
                localServer = null;
                localServerUrl = '';
            }
        }
    };
};

module.exports = {
    createLocalServerRuntime
};
