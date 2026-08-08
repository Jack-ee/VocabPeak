/**
 * vocabpeak-tts-proxy - Cloudflare Worker
 * ============================================================
 * Purpose
 *   Two jobs, both solving the same browser limitation: cross-origin
 *   requests the VocabPeak PWA cannot make directly.
 *
 *   1. Neural TTS proxy (POST). OpenAI's API sends no CORS headers,
 *      so a browser page cannot call it. The Worker forwards the
 *      request and adds the missing CORS header.
 *
 *   2. Audio pack proxy (GET). The pronunciation pack is a GitHub
 *      Release asset. Release asset downloads 302-redirect to a CDN
 *      blob that sends no CORS header, so a browser fetch is blocked.
 *      The Worker fetches the asset server-side - where CORS does not
 *      apply - and relays it with the header added.
 *
 * Security
 *   This Worker holds NO secret. For TTS the browser sends its own
 *   OpenAI key and the Worker only forwards it. The pack route can
 *   only reach a fixed repository and a whitelisted set of asset
 *   names, so it cannot be used as an open proxy. Both routes are
 *   restricted by Origin.
 *
 * Deploy (paste this whole file into the Worker, then Deploy)
 *   Dashboard -> Workers & Pages -> your Worker -> Edit code ->
 *   replace everything with this file -> Deploy. The Worker URL is
 *   unchanged, so the VocabPeak "TTS proxy URL" setting still applies and
 *   the same URL also serves the audio pack.
 *
 * If the audio pack lives in a different repo, edit PACK_REPO below.
 *
 * 语音包分发密钥 (可选, v124)
 *   Worker 环境变量 PACK_KEYS 填逗号分隔的密钥清单 (Dashboard ->
 *   Settings -> Variables), 例如: "family-2026,friendA-x7k2"。
 *   设了之后, 包下载必须带 &key=<清单中任意一个>; 删掉某个密钥再
 *   Deploy 即撤销该人的下载资格; 清空/删除 PACK_KEYS 即回到不设防。
 *   每次下载在日志里记 key 前缀, 便于追溯 (wrangler tail 可看)。
 *
 *   注意: 只要 PACK_REPO 是公开仓库, Release 直链就绕得开这道门 ——
 *   密钥只是"应用内下载"的闸。要做成真正的付费闸, 把音频包发布到
 *   一个私有仓库, 并给 Worker 配环境变量 GH_TOKEN (fine-grained,
 *   仅该仓库 contents:read): 配了 GH_TOKEN 本 Worker 自动改走
 *   GitHub API 拉取私有资产, Worker 就成了唯一下载通道。
 * ============================================================
 */

const OPENAI_TTS = 'https://api.openai.com/v1/audio/speech';

// Only these origins may use the proxy. Add a localhost line here
// if you test the VocabPeak app locally, e.g. 'http://localhost:8000'.
const ALLOWED_ORIGINS = [
    'https://jack-ee.github.io',
];

// Audio pack source. The pack route only ever fetches from this repo
// and release tag, and only asset names matching PACK_ASSET_RE.
const PACK_REPO     = 'jack-ee/VocabPeak';
const PACK_TAG      = 'audio-pack';
const PACK_ASSET_RE = /^vocabpeak-audio-pack[A-Za-z0-9._-]*$/;

// 分发密钥校验: PACK_KEYS 为空 = 不设防; 非空 = key 必须在清单内。
function packKeyAllowed(env, key) {
    const list = String((env && env.PACK_KEYS) || '')
        .split(',').map(x => x.trim()).filter(Boolean);
    if (!list.length) return true;
    return !!key && list.indexOf(String(key).trim()) >= 0;
}

function corsHeaders(origin) {
    const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin'  : allow,
        'Access-Control-Allow-Methods' : 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers' : 'Content-Type, Authorization',
        'Access-Control-Expose-Headers': 'Content-Length',
        'Access-Control-Max-Age'       : '86400',
        'Vary'                         : 'Origin',
    };
}

// --- Audio pack route (GET) ---------------------------------------
// Relays a whitelisted GitHub Release asset with CORS headers added.
async function handlePackRequest(request, origin, env) {
    const url   = new URL(request.url);
    const asset = url.searchParams.get('asset') || '';
    if (!PACK_ASSET_RE.test(asset)) {
        return new Response('Unknown or disallowed asset name', {
            status: 400, headers: corsHeaders(origin),
        });
    }

    // 分发密钥门 (设了 PACK_KEYS 才生效)。403 文案会原样出现在
    // 应用的下载错误提示里, 用中文直说原因。
    const key = url.searchParams.get('key') || '';
    if (!packKeyAllowed(env, key)) {
        console.log('[pack] DENIED asset=' + asset + ' key=' + key.slice(0, 4) + '***');
        return new Response(
            '\u8BED\u97F3\u5305\u5BC6\u94A5\u65E0\u6548\u6216\u5DF2\u505C\u7528 \u2014 \u8BF7\u5411\u5206\u4EAB\u8005\u6838\u5BF9 (\u8BBE\u7F6E \u2192 \u8BED\u97F3 \u2192 \u8BED\u97F3\u5305\u5BC6\u94A5)',
            { status: 403, headers: corsHeaders(origin) });
    }
    console.log('[pack] asset=' + asset + (key ? ' key=' + key.slice(0, 4) + '***' : ' (open)'));

    let upstream;
    try {
        if (env && env.GH_TOKEN) {
            // 私有仓库路径: 经 GitHub API 定位资产再以 octet-stream 拉取。
            // 配了 GH_TOKEN 即自动启用, Worker 成为唯一下载通道。
            const gh = { 'Authorization': 'Bearer ' + env.GH_TOKEN,
                         'User-Agent'   : 'vocabpeak-tts-proxy' };
            const rel = await fetch('https://api.github.com/repos/' + PACK_REPO +
                                    '/releases/tags/' + PACK_TAG, { headers: gh });
            if (!rel.ok) {
                return new Response('Release lookup failed (HTTP ' + rel.status + ')',
                    { status: 502, headers: corsHeaders(origin) });
            }
            const meta = await rel.json();
            const hit  = (meta.assets || []).find(a => a.name === asset);
            if (!hit) {
                return new Response('Asset not in release: ' + asset,
                    { status: 404, headers: corsHeaders(origin) });
            }
            upstream = await fetch(hit.url, {
                headers: Object.assign({ 'Accept': 'application/octet-stream' }, gh),
                redirect: 'follow',
            });
        } else {
            // 公开仓库路径: 直链跟随 302 到 CDN。
            const ghUrl = 'https://github.com/' + PACK_REPO +
                          '/releases/download/' + PACK_TAG + '/' + asset;
            upstream = await fetch(ghUrl, { redirect: 'follow' });
        }
    } catch (e) {
        return new Response('Pack fetch failed: ' + e, {
            status: 502, headers: corsHeaders(origin),
        });
    }

    if (!upstream.ok) {
        return new Response('Pack not found (HTTP ' + upstream.status +
            '). Has the Build audio pack workflow run yet?', {
            status: upstream.status, headers: corsHeaders(origin),
        });
    }

    // Relay the body (streamed) with CORS headers. Content-Length is
    // passed through and exposed so the page can show download progress.
    const headers = corsHeaders(origin);
    const ct = upstream.headers.get('Content-Type');
    const cl = upstream.headers.get('Content-Length');
    if (ct) headers['Content-Type']   = ct;
    if (cl) headers['Content-Length'] = cl;
    headers['Cache-Control'] = 'public, max-age=300';
    return new Response(upstream.body, { status: 200, headers });
}

// --- Neural TTS route (POST) --------------------------------------
async function handleTtsRequest(request, origin) {
    let upstream;
    try {
        upstream = await fetch(OPENAI_TTS, {
            method : 'POST',
            headers: {
                'Content-Type' : 'application/json',
                'Authorization': request.headers.get('Authorization') || '',
            },
            body: await request.text(),
        });
    } catch (e) {
        return new Response('Upstream fetch failed: ' + e, {
            status: 502, headers: corsHeaders(origin),
        });
    }

    const headers = corsHeaders(origin);
    const ct = upstream.headers.get('Content-Type');
    if (ct) headers['Content-Type'] = ct;
    return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin') || '';

        // CORS preflight - sent before a POST because it carries an
        // Authorization header. A simple GET is not preflighted.
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(origin) });
        }

        // Restrict to the VocabPeak site. An empty Origin (some same-origin
        // or non-browser cases) is allowed through.
        if (origin && !ALLOWED_ORIGINS.includes(origin)) {
            return new Response('Origin not allowed', {
                status: 403, headers: corsHeaders(origin),
            });
        }

        if (request.method === 'GET')  return handlePackRequest(request, origin, env);
        if (request.method === 'POST') return handleTtsRequest(request, origin);

        return new Response('Method not allowed', {
            status: 405, headers: corsHeaders(origin),
        });
    },
};
