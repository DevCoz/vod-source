// ================= 自定义配置格式 =================
// {
//   "pansou_urls": "https://api1.example.com",
//   "pansou_token": "",
//   "pancheck_url": "http://your-pancheck-ip:8080", // 新增：PanCheck服务地址
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
    { name: "🔥 热播电影", kw: "2024 电影 4K", pic: "https://img.icons8.com/clouds/200/movie-projector.png", remark: "实时检测链接有效性" },
    { name: "📺 热门剧集", kw: "2024 电视剧 完结", pic: "https://img.icons8.com/clouds/200/tv-show.png", remark: "自动过滤失效资源" }
];

const PAN_PIC_MAP = {
    aliyun: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/ali.jpg",
    quark: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/quark.png",
    uc: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/uc.png",
    baidu: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/baidu.jpg"
};

const PAN_URLS = ($config?.pansou_urls || "").split(/[\n,]/).map(u => u.trim()).filter(u => u);
const PAN_TOKEN = $config?.pansou_token || "";
const PANCHECK_URL = $config?.pancheck_url || ""; // PanCheck 接口地址

const TYPE_MAP = [
    { front: 'quark', back: 'quark' }, { front: 'ali', back: 'aliyun' },
    { front: 'uc', back: 'uc' }, { front: 'baidu', back: 'baidu' }
];

const ENABLED_BACKEND_TYPES = TYPE_MAP.filter(m => $config?.[m.front] !== false).map(m => m.back);
const BACKEND_TO_FRONT = TYPE_MAP.reduce((acc, m) => ({ ...acc, [m.back]: m.front }), {});

// ================= 核心逻辑：链接检测集成 =================

/**
 * 调用 PanCheck 接口检测链接有效性
 */
async function checkLinks(links) {
    if (!PANCHECK_URL || !links || links.length === 0) return { valid: links, invalid: [] };
    
    try {
        const res = await $fetch.post(`${PANCHECK_URL}/api/v1/links/check`, {
            links: links // 传入待检测的链接数组
        }, { timeout: 10000 });
        
        const data = argsify(res.data);
        return {
            valid: data.valid_links || [],
            invalid: data.invalid_links || []
        };
    } catch (e) {
        $print(`PanCheck Error: ${e.message}`);
        return { valid: links, invalid: [] }; // 出错时默认返回原始链接
    }
}

async function performSearch(query) {
    if (!PAN_URLS.length) return [];
    let apiUrl = PAN_URLS[0];

    try {
        const res = await $fetch.post(`${apiUrl}/api/search`, {
            kw: query,
            res: "merge",
            cloud_types: ENABLED_BACKEND_TYPES,
            src: "all"
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

// ================= XPTV 接口 =================

async function getConfig() {
    return jsonify({
        ver: 1,
        title: "PanSou + PanCheck",
        site: PAN_URLS[0] || "",
        tabs: [{ name: '发现', ext: { id: 'home' } }]
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

async function getTracks(ext) {
    ext = argsify(ext);
    
    // 处理搜索结果
    let results = [];
    if (ext.is_recommend) {
        $utils.toastInfo(`正在搜索并检测: ${ext.kw}`);
        results = await performSearch(ext.kw);
    } else {
        results = [ext];
    }

    // --- 集成 PanCheck：批量检测当前页面的链接 ---
    const allUrls = results.map(r => r.url || r.vod_id).filter(u => u);
    const checkResult = await checkLinks(allUrls);

    return jsonify({
        list: [{
            title: PANCHECK_URL ? '链接有效性检测结果' : '资源详情',
            tracks: results.map(item => {
                const url = item.url || item.vod_id;
                const isValid = checkResult.valid.includes(url);
                const isInvalid = checkResult.invalid.includes(url);
                
                // 根据检测结果优化显示名称
                let statusPrefix = "";
                if (PANCHECK_URL) {
                    statusPrefix = isValid ? "✅ " : (isInvalid ? "❌ [失效] " : "❓ ");
                }

                return {
                    name: `${statusPrefix}${item.title || item.vod_name}${item.pwd ? ' [码：' + item.pwd + ']' : ''}`,
                    pan: url,
                    ext: { url }
                };
            })
        }]
    });
}

async function getPlayinfo() { return jsonify({ urls: [] }); }
async function search(ext) { return getCards(ext); }
