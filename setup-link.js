/**
 * setup-link.js — 一键配置链接 (v142)
 * ============================================================
 * 把新用户接入从"逐项口述四样东西"变成"打开一个链接"。
 *
 * 分享者 (设置 → 数据 → 课程订阅 → 生成配置链接) 得到形如
 *   https://jack-ee.github.io/VocabPeak/#setup=<base64url(JSON)>
 * 的链接; 接收者打开即弹确认框, 同意后写入配置并刷新。
 *
 * 载荷 (只放"从哪来", 不放"我是谁"):
 *   { v:1, tts:<Worker 地址>, feed:<课程订阅源>, pk:<语音包密钥?>,
 *     cp:<课程口令?> }
 *
 * 安全边界 (重要):
 *   • 绝不放 GitHub token / Gist ID —— 那是接收者自己的账号, 混进
 *     去等于把自己的学习数据写进别人的云端。同步必须各自配置。
 *   • 密钥类字段 (pk/cp) 可选: 勾了才放进链接。链接会经微信等渠道
 *     流转, 分享者自行权衡 —— 不勾则口令另行私下告知。
 *   • 用 hash (#) 不用 query (?): hash 不会随 HTTP 请求发往服务器,
 *     不进 GitHub Pages 访问日志。
 *   • 导入前必须弹确认框, 且逐项列出将写入什么 —— 绝不静默改配置。
 *   • 导入后立刻清掉 location.hash, 防止链接残留在历史与分享截图里。
 *
 * 与 PWA 的配合: 已安装的应用打开外部链接时可能落在浏览器标签而非
 * 应用内 —— 那也没关系, 配置写在同源 localStorage, 打开应用即生效。
 * ============================================================
 */
window.SetupLink = (function () {
    'use strict';

    // ─── base64url 编解码 (UTF-8 安全) ───────────────────────
    function enc(obj) {
        const bytes = new TextEncoder().encode(JSON.stringify(obj));
        let bin = '';
        bytes.forEach(b => { bin += String.fromCharCode(b); });
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function dec(s) {
        const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
        const bin = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
        const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
        return JSON.parse(new TextDecoder().decode(bytes));
    }

    // ─── 生成 (分享者用) ─────────────────────────────────────
    // includeSecrets: 是否把语音包密钥与课程口令放进链接
    function build(includeSecrets) {
        const g = (n) => (window.DB?.getPref?.(n, '') || '').trim();
        const payload = { v: 1 };
        const tts  = g('tts_proxy_url');
        const feed = g('course_feed_url');
        if (tts)  payload.tts  = tts;
        if (feed) payload.feed = feed;
        if (includeSecrets) {
            const pk = g('pack_key');
            const cp = g('course_feed_pass');
            if (pk) payload.pk = pk;
            if (cp) payload.cp = cp;
        }
        const base = location.origin + location.pathname;
        return base + '#setup=' + enc(payload);
    }

    // ─── 导入 (接收者侧, boot 时调用) ────────────────────────
    function applyFromHash() {
        const m = /[#&]setup=([A-Za-z0-9\-_]+)/.exec(location.hash || '');
        if (!m) return false;
        let p;
        try { p = dec(m[1]); }
        catch (e) {
            console.warn('[SetupLink] 配置链接解析失败:', e);
            cleanHash();
            return false;
        }
        if (!p || p.v !== 1) { cleanHash(); return false; }

        const items = [];
        if (p.tts)  items.push('\u8BED\u97F3\u4EE3\u7406\u5730\u5740');
        if (p.feed) items.push('\u8BFE\u7A0B\u8BA2\u9605\u6E90');
        if (p.pk)   items.push('\u8BED\u97F3\u5305\u5BC6\u94A5');
        if (p.cp)   items.push('\u8BFE\u7A0B\u5BC6\u7801');
        if (!items.length) { cleanHash(); return false; }

        // 绝不静默改配置: 逐项列出, 用户点确认才写
        const msg = '\u68C0\u6D4B\u5230\u914D\u7F6E\u94FE\u63A5\uFF0C\u5C06\u5199\u5165\uFF1A\n\n  \u2022 '
                  + items.join('\n  \u2022 ')
                  + '\n\n\uFF08\u4E0D\u5305\u542B\u4EFB\u4F55\u8D26\u53F7\u4FE1\u606F\uFF0C\u4E91\u540C\u6B65\u9700\u4F60\u81EA\u5DF1\u914D\u7F6E\uFF09\n\u786E\u5B9A\u5E94\u7528\uFF1F';
        if (!window.confirm(msg)) { cleanHash(); return false; }

        const set = (n, v) => { try { window.DB?.setPref?.(n, v); } catch (e) {} };
        if (p.tts)  set('tts_proxy_url',    p.tts);
        if (p.feed) set('course_feed_url',  p.feed);
        if (p.pk)   set('pack_key',         p.pk);
        if (p.cp)   set('course_feed_pass', p.cp);
        cleanHash();
        console.log('[SetupLink] 已应用配置: ' + items.join(', '));
        try {
            window.App?.showToast?.('\u2705 \u914D\u7F6E\u5DF2\u5E94\u7528\uFF0C\u6B63\u5728\u91CD\u65B0\u52A0\u8F7D\u2026');
        } catch (e) {}
        setTimeout(() => location.reload(), 800);
        return true;
    }

    // 清掉 hash, 不留在历史里 (replaceState 避免多一条后退记录)
    function cleanHash() {
        try {
            history.replaceState(null, '', location.pathname + location.search);
        } catch (e) { location.hash = ''; }
    }

    return { build: build, applyFromHash: applyFromHash, _enc: enc, _dec: dec };
})();
