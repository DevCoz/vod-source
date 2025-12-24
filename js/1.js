// ================= 自定义配置格式 =================
// {
//   "pansou_urls": "https://api.your-pansou.com",
//   "pansou_token": "your_jwt_token",
//   "pancheck_url": "http://your-pancheck-ip:8080", 
//   "quark": true,
//   "ali": true,
//   "pan_priority": ["quark", "ali"]
// }

const $config = argsify($config_str)

// ================= 工具函数 =================
function jsonify(obj) { return JSON.stringify(obj) }
function argsify(str) { try { return str ? JSON.parse(str) : {} } catch (e) { return {} } }

function formatDateTime(str) {
    try {
        if (!str) return '未知';
        let d = new Date(str);
        return isNaN(d.getTime()) ? '未知' : `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getFullYear()).slice(-2)}`;
    } catch (e) { return '未知'; }
}

// ================= 常量与配置 =================
const HOT_KEYWORDS = [
    { name: "🔥 热播电影", kw: "2024 电影 4K", pic: "https://img.icons8.com/clouds/200/movie-projector.png", remark: "自动检测链接有效性" },
    { name: "📺 热门剧集", kw: "2024 电视剧 完结", pic: "https://img.icons8.com/clouds/200/tv-show.png", remark: "实时过滤失效资源" }
];

const PAN_PIC_MAP = {
    aliyun: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/ali.jpg",
    quark: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/quark.png",
    uc: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/uc.png",
    baidu: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/baidu.jpg"
};

const PAN_URLS = ($config?.pansou_urls || "").split(/[\n,]/).map(u => u.trim()).filter(u => u);
const PAN_TOKEN = $config?.pansou_token || "";
const PANCHECK_URL = $config?.pancheck_url || ""; // PanCheck服务地址

const TYPE_MAP = [
    { front: 'quark', back: 'quark' }, { front: 'ali', back: 'aliyun' },
    { front: 'uc', back: 'uc' }, { front: 'baidu', back: 'baidu' }
];

const ENABLED_BACKEND_TYPES = TYPE_MAP.filter(m => $config?.[m.front] !== false).map(m => m.back);
const BACKEND_TO_FRONT = TYPE_MAP.reduce((acc, m) => ({ ...acc, [m.back]: m.front }), {});

// ================= 核心集成逻辑 =================

/**
 * 步骤 2: 调用 PanCheck 批量检测链接
 */
async function checkLinks(links) {
    if (!PANCHECK_URL || !links || links.length === 0) return { valid: links, invalid: [] };
    
    try {
        const res = await $fetch.post(`${PANCHECK_URL}/api/v1/links/check`, {
            links: links // 传入从PanSou获取的链接数组
        }, { timeout: 15000 });
        
        const data = argsify(res.data);
        return {
            valid: data.valid_links || [],
            invalid: data.invalid_links || []
        };
    } catch (e) {
        $print(`PanCheck 检测失败: ${e.message}`);
        return { valid: links, invalid: [] }; 
    }
}

/**
 * 步骤 1: 调用 PanSou 搜索资源
 */
async function performSearch(query) {
    if (!PAN_URLS.length) return [];
    let apiUrl = PAN_URLS[0];

    try {
        const res = await $fetch.post(`${apiUrl}/api/search`, {
            kw: query,
            res: "merge", // 使用聚合模式获取分类结果
            cloud_types: ENABLED_BACKEND_TYPES,
            src: "all",
            filter: { 
                exclude: ["预告", "枪版", "广告"] // 原生过滤
            }
        }, { 
            headers: { 
                'Authorization': PAN_TOKEN ? `Bearer ${PAN_TOKEN}` : '', 
                'Content-Type': 'application/json' 
            } 
        });

        const respData = argsify(res.data);
        const mergedData = respData?.merged_by_type || respData?.data?.merged_by_type;
        if (!mergedData) return [];

        let cards = [];
        Object.entries(mergedData).forEach(([bKey, items]) => {
            const fKey = BACKEND_TO_FRONT[bKey] || bKey;
            items.forEach(item => {
                cards.push({
                    vod_id: item.url,
                    vod_name: item.note || query,
                    vod_pic: PAN_PIC_MAP[bKey] || "",
                    vod_remarks: `${fKey.toUpperCase()} | ${formatDateTime(item.datetime)}`,
                    ext: { url: item.url, pwd: item.password || "", title: item.note || query }
                });
            });
        });
        return cards;
    } catch (e) { return []; }
}

// ================= XPTV 接口实现 =================

async function getConfig() {
    return jsonify({
        ver: 1,
        title: "PanSou+检测版",
        site: PAN_URLS[0] || "",
        tabs: [{ name: '网盘搜索', ext: { id: 'home' } }]
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const kw = ext.search_text || ext.text || "";
    if (!kw) {
        return jsonify({ 
            list: HOT_KEYWORDS.map(item => ({
                vod_id: item.kw,
                vod_name: item.name,
                vod_pic: item.pic,
                vod_remarks: item.remark,
                style: { type: "rect", ratio: 1.4 },
                ext: { is_recommend: true, kw: item.kw } 
            }))
        });
    }
    const results = await performSearch(kw);
    return jsonify({ list: results });
}

/**
 * 步骤 3: 汇总 PanSou 结果并集成 PanCheck 状态返回 XPTV
 */
async function getTracks(ext) {
    ext = argsify(ext);
    
    // 1. 处理搜索逻辑（点击推荐位卡片时）
    if (ext.is_recommend) {
        $utils.toastInfo(`正在搜索: ${ext.kw}`);
        const results = await performSearch(ext.kw);
        return jsonify({
            list: [{
                title: `“${ext.kw}” 的搜索结果`,
                tracks: results.map(item => ({
                    name: item.vod_name,
                    pan: item.vod_id,
                    ext: item.ext // 携带 url 等信息供下次点击检测
                }))
            }]
        });
    }

    // 2. 处理单链接检测逻辑（点击具体某个网盘结果时）
    const rawUrl = ext.url || ext.vod_id;
    if (!rawUrl) return jsonify({ list: [] });

    let statusPrefix = "⏳ 正在检测链接... ";
    let checkResult = { isValid: false, isInvalid: false, isPending: false };

    // 调用 PanCheck 检测单个链接
    if (PANCHECK_URL) {
        try {
            const res = await $fetch.post(`${PANCHECK_URL}/api/v1/links/check`, {
                links: [rawUrl], // 仅检测当前这一个链接
                selectedPlatforms: ["quark", "uc", "baidu", "tianyi", "pan123", "pan115", "aliyun", "xunlei", "cmcc"]
            }, { timeout: 10000 });

            const data = argsify(res.data);
            
            // URL 标准化匹配函数，确保比对准确
            const normalize = (u) => u ? u.replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase().trim() : "";
            const normTarget = normalize(rawUrl);

            // 检查返回数组
            checkResult.isValid = (data.valid_links || []).some(l => normalize(l) === normTarget);
            checkResult.isInvalid = (data.invalid_links || []).some(l => normalize(l) === normTarget);
            checkResult.isPending = (data.pending_links || []).some(l => normalize(l) === normTarget);

            if (checkResult.isValid) statusPrefix = "✅ 链接有效 | ";
            else if (checkResult.isInvalid) statusPrefix = "❌ 链接已失效 | ";
            else if (checkResult.isPending) statusPrefix = "⏳ 检测排队中 | ";
            else statusPrefix = "❓ 未能识别状态 | ";

        } catch (e) {
            statusPrefix = "⚠️ 检测服务连接失败 | ";
        }
    } else {
        statusPrefix = "ℹ️ 直接访问 | ";
    }

    // 3. 返回最终可播放/跳转的轨道
    return jsonify({
        list: [{
            title: '资源校验结果',
            tracks: [{
                name: `${statusPrefix}${ext.title || '点此打开资源'}`,
                pan: rawUrl,
                ext: { url: rawUrl }
            }]
        }]
    });
}
async function getPlayinfo() { return jsonify({ urls: [] }); }
async function search(ext) { return getCards(ext); }
