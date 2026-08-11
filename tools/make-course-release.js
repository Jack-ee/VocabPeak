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
// ============================================================
'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

function sha256hex(text) {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
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

function build(inputPath, outDir) {
    const raw     = fs.readFileSync(inputPath, 'utf8');
    const lessons = extractLessons(raw)
        .filter(l => l && l.id)
        .map(l => (l._v == null ? Object.assign({}, l, { _v: 1 }) : l))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    if (!lessons.length) throw new Error('输入里没有任何课程');

    fs.mkdirSync(outDir, { recursive: true });

    // 逐课写文件 + 收集清单
    const entries = lessons.map(l => {
        const file = String(l.id) + '.json';
        const text = JSON.stringify(l);
        fs.writeFileSync(path.join(outDir, file), text, 'utf8');
        return {
            id     : l.id,
            _v     : l._v,
            title  : l.title || '',
            file   : file,
            sha256 : sha256hex(text),
            size   : Buffer.byteLength(text, 'utf8')
        };
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
    fs.writeFileSync(path.join(outDir, 'courses-manifest.json'),
                     JSON.stringify(manifest, null, 2), 'utf8');
    return { manifest, removed };
}

module.exports = { extractLessons, build, sha256hex };

if (require.main === module) {
    const inputPath = process.argv[2];
    const outDir    = process.argv[3] || path.join(__dirname, '..', 'courses');
    if (!inputPath) {
        console.log('用法: node make-course-release.js <备份.json | course-pack.json> [输出目录]');
        process.exit(1);
    }
    try {
        const { manifest, removed } = build(inputPath, outDir);
        const totalKB = Math.round(manifest.courses.reduce((s, e) => s + e.size, 0) / 1024);
        console.log('已发布 ' + manifest.count + ' 门课到 ' + outDir +
                    ' (共 ' + totalKB + ' KB)');
        manifest.courses.forEach(e =>
            console.log('  ' + e.id + '  _v=' + e._v + '  ' +
                        Math.round(e.size / 1024) + 'KB  ' + e.title));
        if (removed.length) console.log('已清理陈旧文件: ' + removed.join(', '));
        console.log('\n下一步: git add courses/ && git commit -m "发布课程" && git push');
    } catch (e) {
        console.error('发布失败: ' + (e.message || e));
        process.exit(1);
    }
}
