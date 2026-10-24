// ============================================================
// make-course-release.js — 课程发布: 备份 → courses/ 发布目录
// ------------------------------------------------------------
// 课程分发第二阶段 (v131, A 通道): 把课程发布成
//   courses/courses-manifest.json   清单 (id / _v / sha256 / 文件名)
//   courses/<id>.json               每课一个文件 (出厂态课程内容)
// 提交到仓库后由 GitHub Pages 直接服务; 应用内的课程订阅
// (course-feed.js) 按 id + _v 增量拉取, 分享对象自动收到新增与更新。
//
// 用法:
//   node make-course-release.js <备份.json | course-pack.json> [输出目录]
//     输入: 应用「导出」的备份 (含 *_lessons_user 键), 或
//           make-course-pack.js 产出的课程包 ({lessons:[...]} 或裸数组)
//     输出目录: 默认 ../courses (仓库根的 courses/)
//
// 发布流程:
//   1. 应用设置 → 数据 → 导出, 得到备份文件
//   2. node tools/make-course-release.js vocabpeak-backup-xxx.json
//   3. git add courses/ && git commit && git push
//   订阅端 (含孩子的设备与所有分享对象) 会在下次启动/手动检查时
//   只下载有变化的课。
//
// 设计要点:
//   • 出厂态: 只取课程内容 (学习记录本就在别的键里, 不会混入)。
//   • _v 是增量分发的版本锚, 原样保留 —— 千万不要在这里刷新它,
//     否则订阅端会把没变的课全部重下一遍。备份里缺 _v 的旧课置 1
//     (能被「本机没有」分支接收, 但永远不会覆盖任何有 _v 的本机课)。
//   • 逐文件 sha256: 订阅端校验用, 防中间缓存损坏/截断。
//   • 清理: 输出目录里不在本次清单内的 U*.json 一并删除 (订阅端
//     只增不删, 目录侧删除不影响任何人已有的课)。
//   • B 通道 (私有化) 用同一份产物: 把 courses/ 三类文件上传到私有
//     仓库 Release, Worker 配 GH_TOKEN 即可, manifest 格式不变。
//
// 加密 (v140, 版权防护):
//   课程语料源自购入教材, 明码放公开仓库会被 fork 二次传播。加密后
//   仓库里只有密文 blob, 订阅端凭口令解密 (设置 → 课程订阅 → 密码)。
//   这是访问控制不是 DRM —— 持口令者仍可提取内容, 防的是公开扩散。
//   • 用法: node make-course-release.js <备份> [输出目录] --key <口令>
//     或环境变量 COURSE_PACK_KEY。不给口令则明码发布并打警告。
//   • 算法: AES-256-GCM; 密钥 = PBKDF2(口令, salt, 10 万轮, SHA-256)。
//   • 确定性加密 (关键, 别改坏): salt = SHA-256(口令+':salt') 前 16
//     字节; 每课 iv = SHA-256(明文+':'+课ID) 前 12 字节 —— 内容不变
//     则密文逐字节不变, sha256 稳定, 订阅端零重下; 内容一变 iv 随
//     之变, 不存在 GCM 同 iv 异明文的复用风险。
//   • 信封格式: {"enc":1,"iv":"<b64>","ct":"<b64(密文||tag)>"};
//     manifest 带 _enc:1 与 _encSalt, 且不再携带课名 (课名也是内容)。
// ============================================================
'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

function sha256hex(text) {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// ─── 确定性加密 (v140) ──────────────────────────────────────
function deriveSalt(pass) {
    return crypto.createHash('sha256').update(pass + ':salt', 'utf8')
                 .digest().subarray(0, 16);
}
function deriveKey(pass) {
    return crypto.pbkdf2Sync(pass, deriveSalt(pass), 100000, 32, 'sha256');
}
function encryptLesson(plainText, lessonId, key) {
    // iv 绑定明文内容: 内容不变密文不变 (增量零重下), 内容变 iv 变
    const iv = crypto.createHash('sha256')
                     .update(plainText + ':' + lessonId, 'utf8')
                     .digest().subarray(0, 12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct  = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // WebCrypto 的 AES-GCM 解密期望 密文||tag 连体
    return JSON.stringify({
        enc: 1,
        iv : iv.toString('base64'),
        ct : Buffer.concat([ct, tag]).toString('base64')
    });
}

// 从三种输入格式里取出课程数组:
//   备份: { "<前缀>_<pid>_lessons_user": "<JSON字符串>" , ... }
//   课程包: { lessons: [...] }
//   裸数组: [...]
function extractLessons(raw) {
    let data;
    try { data = JSON.parse(raw); }
    catch (e) { throw new Error('输入不是合法 JSON: ' + e.message); }

    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.lessons)) return data.lessons;
    if (data && typeof data === 'object') {
        const k = Object.keys(data).find(x => x.endsWith('_lessons_user'));
        if (k) {
            const inner = typeof data[k] === 'string'
                ? JSON.parse(data[k]) : data[k];
            if (Array.isArray(inner)) return inner;
        }
    }
    throw new Error('找不到课程: 输入既不是备份 (含 *_lessons_user 键)、' +
                    '也不是课程包 ({lessons:[...]}) 或课程数组');
}

function build(inputPath, outDir, passKey) {
    const raw     = fs.readFileSync(inputPath, 'utf8');
    const lessons = extractLessons(raw)
        .filter(l => l && l.id)
        .map(l => (l._v == null ? Object.assign({}, l, { _v: 1 }) : l))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    if (!lessons.length) throw new Error('输入里没有任何课程');

    fs.mkdirSync(outDir, { recursive: true });
    const key = passKey ? deriveKey(passKey) : null;

    // 逐课写文件 + 收集清单 (加密时 manifest 不带课名 —— 课名也是内容)
    const entries = lessons.map(l => {
        const file  = String(l.id) + '.json';
        const plain = JSON.stringify(l);
        const text  = key ? encryptLesson(plain, String(l.id), key) : plain;
        fs.writeFileSync(path.join(outDir, file), text, 'utf8');
        const e = {
            id     : l.id,
            _v     : l._v,
            file   : file,
            sha256 : sha256hex(text),
            size   : Buffer.byteLength(text, 'utf8')
        };
        if (!key) e.title = l.title || '';
        return e;
    });

    // 清理不在清单内的旧课程文件 (只碰 U*.json, 不动 manifest 之外的东西)
    const keep    = new Set(entries.map(e => e.file));
    const removed = [];
    fs.readdirSync(outDir).forEach(f => {
        if (/^U\w+\.json$/.test(f) && !keep.has(f)) {
            fs.unlinkSync(path.join(outDir, f));
            removed.push(f);
        }
    });

    const manifest = {
        format     : 1,
        generation : new Date().toISOString(),
        count      : entries.length,
        courses    : entries
    };
    if (key) {
        manifest._enc     = 1;
        manifest._encSalt = deriveSalt(passKey).toString('base64');
    }
    fs.writeFileSync(path.join(outDir, 'courses-manifest.json'),
                     JSON.stringify(manifest, null, 2), 'utf8');
    return { manifest, removed, encrypted: !!key };
}

module.exports = { extractLessons, build, sha256hex, deriveKey, deriveSalt, encryptLesson };

if (require.main === module) {
    const args = process.argv.slice(2);
    const ki   = args.indexOf('--key');
    const passKey = ki >= 0 ? args.splice(ki, 2)[1]
                            : (process.env.COURSE_PACK_KEY || '');
    const inputPath = args[0];
    const outDir    = args[1] || path.join(__dirname, '..', 'courses');
    if (!inputPath) {
        console.log('用法: node make-course-release.js <备份.json | course-pack.json> [输出目录] --key <口令>');
        console.log('      口令也可用环境变量 COURSE_PACK_KEY 提供; 不给则明码发布');
        process.exit(1);
    }
    try {
        const { manifest, removed, encrypted } = build(inputPath, outDir, passKey);
        const totalKB = Math.round(manifest.courses.reduce((s, e) => s + e.size, 0) / 1024);
        console.log('已发布 ' + manifest.count + ' 门课到 ' + outDir +
                    ' (共 ' + totalKB + ' KB' +
                    (encrypted ? ', AES-256-GCM 加密' : ', 明码!') + ')');
        if (!encrypted) {
            console.log('⚠ 警告: 未提供口令, 课程将以明文进入公开仓库 ——');
            console.log('  语料源自购入教材时, 建议 --key <口令> 加密发布');
        }
        manifest.courses.forEach(e =>
            console.log('  ' + e.id + '  _v=' + e._v + '  ' +
                        Math.round(e.size / 1024) + 'KB' +
                        (e.title ? '  ' + e.title : '')));
        if (removed.length) console.log('已清理陈旧文件: ' + removed.join(', '));
        console.log('\n下一步: git add courses/ && git commit -m "发布课程" && git push');
        if (encrypted) console.log('订阅端: 设置 → 课程订阅 → 密码 填同一口令 (随快照同步到各设备)');
    } catch (e) {
        console.error('发布失败: ' + (e.message || e));
        process.exit(1);
    }
}
