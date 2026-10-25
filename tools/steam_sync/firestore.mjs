// tools/steam_sync/firestore.mjs — Firestore REST transport for the local
// Steam sync: OAuth token handling, proxy-aware HTTP, value codec, and the
// three operations the runner needs (list / get / commit).
//
// Deliberately dependency-free. It authenticates with the Firebase CLI's OAuth
// token instead of a service-account key: the Spark plan can't use Secret
// Manager, and creating a key requires IAM work the project doesn't need.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';

export const PROJECT_ID = 'game-data-dashboard';
export const FIRESTORE_BASE =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// A hung proxy/API socket must not stall a scheduled sync forever.
const REQUEST_TIMEOUT_MS = 30 * 1000;

// ── HTTP (proxy-aware: Clash etc. via CONNECT tunnel) ───────────────────────

function requestDirect(options, url, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
            req.destroy(new Error(`request timeout (${REQUEST_TIMEOUT_MS}ms)`));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

function requestViaProxy(proxyUrl, url, options, body) {
    return new Promise((resolve, reject) => {
        const target = new URL(url);
        const proxy = new URL(proxyUrl);
        const port = target.port || 443;
        const connectReq = http.request({
            host: proxy.hostname,
            port: proxy.port || 80,
            method: 'CONNECT',
            path: `${target.hostname}:${port}`,
            headers: { Host: `${target.hostname}:${port}` },
        });
        connectReq.setTimeout(REQUEST_TIMEOUT_MS, () => {
            connectReq.destroy(new Error(`proxy CONNECT timeout (${REQUEST_TIMEOUT_MS}ms)`));
        });
        connectReq.on('connect', (res, socket) => {
            if (res.statusCode !== 200) {
                socket.destroy();
                reject(new Error(`Proxy CONNECT failed: HTTP ${res.statusCode}`));
                return;
            }
            const tlsSocket = tls.connect({ socket, servername: target.hostname }, () => {
                const req = https.request({
                    ...options,
                    createConnection: () => tlsSocket,
                    host: target.hostname,
                    port,
                    path: target.pathname + target.search,
                }, (res2) => {
                    let data = '';
                    res2.on('data', (c) => (data += c));
                    res2.on('end', () => resolve({ status: res2.statusCode, body: data }));
                });
                req.setTimeout(REQUEST_TIMEOUT_MS, () => {
                    req.destroy(new Error(`request timeout (${REQUEST_TIMEOUT_MS}ms)`));
                });
                req.on('error', reject);
                if (body) req.write(body);
                req.end();
            });
            tlsSocket.on('error', reject);
        });
        connectReq.on('error', reject);
        connectReq.end();
    });
}

export function request(url, { method = 'GET', token, body, contentType = 'application/json' } = {}) {
    const headers = { 'Content-Type': contentType };
    if (token) headers.Authorization = `Bearer ${token}`;
    const options = { method, headers };
    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
    return proxy
        ? requestViaProxy(proxy, url, options, body)
        : requestDirect(options, url, body);
}

// ── Firebase CLI credentials ────────────────────────────────────────────────

export function loadAccessToken() {
    const configPath = path.join(
        process.env.USERPROFILE || process.env.HOME,
        '.config', 'configstore', 'firebase-tools.json'
    );
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const tokens = cfg.tokens ||
        (Array.isArray(cfg.accounts) && cfg.accounts[0] && cfg.accounts[0].tokens);
    if (!tokens || !tokens.access_token) {
        throw new Error('firebase-tools.json 中没有 access_token，请先运行 firebase login');
    }
    return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token || null };
}

// The Firebase CLI's installed-app OAuth client. This pair ships inside the
// public firebase-tools package; it is NOT a user secret or private key.
const FIREBASE_CLI_OAUTH = {
    clientId: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    clientSecret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
};

export async function refreshAccessToken(refreshToken) {
    const form = new URLSearchParams({
        refresh_token: refreshToken,
        client_id: FIREBASE_CLI_OAUTH.clientId,
        client_secret: FIREBASE_CLI_OAUTH.clientSecret,
        grant_type: 'refresh_token',
    });
    const res = await request('https://www.googleapis.com/oauth2/v3/token', {
        method: 'POST',
        body: form.toString(),
        contentType: 'application/x-www-form-urlencoded',
    });
    if (res.status !== 200) {
        throw new Error(`Token refresh failed (HTTP ${res.status}): ${res.body.slice(0, 200)}`);
    }
    return JSON.parse(res.body).access_token;
}

/** Run `fn(token)`, refreshing once on 401 and retrying. */
export async function withTokenRefresh(auth, tokenRef, fn) {
    try {
        return await fn(tokenRef.token);
    } catch (err) {
        if (!err.expiredAuth || !auth.refreshToken) throw err;
        console.log('  [..] access token expired, refreshing ...');
        tokenRef.token = await refreshAccessToken(auth.refreshToken);
        return fn(tokenRef.token);
    }
}

// ── Firestore value codec ───────────────────────────────────────────────────
// Dates round-trip as Firestore timestamps so a read-modify-write never demotes
// lastObservedAt / initializedAt to plain strings.

export const decodeValue = (v) => {
    if (!v || typeof v !== 'object') return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('booleanValue' in v) return Boolean(v.booleanValue);
    if ('timestampValue' in v) return new Date(v.timestampValue);
    if ('nullValue' in v) return null;
    if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
    return null;
};

export const decodeFields = (fields) =>
    Object.fromEntries(Object.entries(fields || {}).map(([k, v]) => [k, decodeValue(v)]));

export const encodeValue = (value) => {
    if (value === null) return { nullValue: null };
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') {
        return Number.isInteger(value)
            ? { integerValue: String(value) }
            : { doubleValue: value };
    }
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
    if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
    throw new Error(`Unsupported field value: ${JSON.stringify(value)}`);
};

export const encodeFields = (obj) => {
    const fields = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value === undefined) continue;
        fields[key] = encodeValue(value);
    }
    return fields;
};

const authError = () => {
    const err = new Error('HTTP 401');
    err.expiredAuth = true;
    return err;
};

// ── Operations ──────────────────────────────────────────────────────────────

export async function listDocuments(collectionPath, token) {
    const out = [];
    let pageToken = null;
    do {
        const url = `${FIRESTORE_BASE}/${collectionPath}?pageSize=300` +
            (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
        const res = await request(url, { token });
        if (res.status === 401) throw authError();
        if (res.status !== 200) {
            throw new Error(`list ${collectionPath}: HTTP ${res.status} ${res.body.slice(0, 200)}`);
        }
        const json = JSON.parse(res.body);
        for (const doc of json.documents || []) {
            out.push({ id: doc.name.split('/').pop(), data: decodeFields(doc.fields) });
        }
        pageToken = json.nextPageToken || null;
    } while (pageToken);
    return out;
}

export async function getDocument(docPath, token) {
    const res = await request(`${FIRESTORE_BASE}/${docPath}`, { token });
    if (res.status === 404) return null;
    if (res.status === 401) throw authError();
    if (res.status !== 200) {
        throw new Error(`get ${docPath}: HTTP ${res.status} ${res.body.slice(0, 200)}`);
    }
    return decodeFields(JSON.parse(res.body).fields);
}

/**
 * Build the `:commit` payload. Pure so tests can assert the mask/encoding
 * without touching the network.
 *
 * `mask` present -> set(merge) semantics, only those fields are touched.
 * `mask` absent  -> full document replace, matching Admin SDK batch.set().
 */
export function buildCommitPayload(writes) {
    return {
        writes: writes.map(({ docPath, fields, mask }) => ({
            update: {
                name: `projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`,
                fields: encodeFields(fields),
            },
            ...(mask ? { updateMask: { fieldPaths: mask } } : {}),
        })),
    };
}

/** One atomic commit per chunk, staying under Firestore's 500-write limit. */
export async function commitWrites(writes, token) {
    const CHUNK = 400;
    for (let i = 0; i < writes.length; i += CHUNK) {
        const chunk = writes.slice(i, i + CHUNK);
        const res = await request(`${FIRESTORE_BASE}:commit`, {
            method: 'POST',
            token,
            body: JSON.stringify(buildCommitPayload(chunk)),
        });
        if (res.status === 401) throw authError();
        if (res.status !== 200) {
            throw new Error(`commit failed: HTTP ${res.status} ${res.body.slice(0, 400)}`);
        }
    }
    return writes.length;
}
