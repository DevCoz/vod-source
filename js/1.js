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
    
    // 1. 处理搜索逻辑（针对推荐卡片的点击）
    if (ext.is_recommend) {
        $utils.toastInfo(`正在搜索: ${ext.kw}`);
        const results = await performSearch(ext.kw);
        return jsonify({
            list: [{
                title: `“${ext.kw}” 的搜索结果`,
                tracks: results.map(item => ({
                    name: item.vod_name,
                    pan: item.vod_id,
                    ext: item.ext 
                }))
            }]
        });
    }

    // 2. 处理点击具体结果后的单链接检测
    const rawUrl = ext.url || ext.vod_id;
    if (!rawUrl) return jsonify({ list: [] });

    let statusPrefix = "⏳ [未识别] ";
    
    if (PANCHECK_URL) {
        try {
            // 弹出提示，告知用户正在检测中
            $utils.toastInfo("正在调用 PanCheck 检测链接...");
            
            const res = await $fetch.post(`${PANCHECK_URL}/api/v1/links/check`, {
                links: [rawUrl]
            }, { timeout: 20000 }); // 增加超时

            const data = argsify(res.data);
            
            // --- 鲁棒匹配算法：针对单链接检测优化 ---
            
            // 策略 A: 检查有效数组是否有值（因为我们只传了一个，有值即为它有效）
            const hasValid = data.valid_links && data.valid_links.length > 0;
            const hasInvalid = data.invalid_links && data.invalid_links.length > 0;
            const hasPending = data.pending_links && data.pending_links.length > 0;

            if (hasValid) {
                statusPrefix = "✅ [有效] ";
            } else if (hasInvalid) {
                statusPrefix = "❌ [失效] ";
            } else if (hasPending) {
                statusPrefix = "⏳ [排队检测中] ";
            } else {
                // 如果后端返回了 200，但数组都为空，可能是解析器不支持该平台
                statusPrefix = "❓ [平台暂不支持] ";
            }

        } catch (e) {
            $print(`检测失败详情: ${e.message}`);
            statusPrefix = "⚠️ [检测超时/错误] ";
        }
    }

    // 3. 返回最终轨道
    return jsonify({
        list: [{
            title: '链接实时检测结果',
            tracks: [{
                name: `${statusPrefix}${ext.title || '点击打开网盘'}`,
                pan: rawUrl,
                ext: { url: rawUrl }
            }]
        }]
    });
}
async function getPlayinfo() { return jsonify({ urls: [] }); }
async function search(ext) { return getCards(ext); }
