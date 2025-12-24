// ================= 自定义配置格式 =================
// {
//   "pansou_urls": "https://api1.example.com,https://api2.example.com",
//   "pansou_token": "",
//   "quark": true,
//   "uc": true,
//   "ali": true,
//   "pan_priority": ["quark", "ali", "uc"]
// }

const $config = argsify($config_str)

// ================= 工具函数 =================
function jsonify(obj) { return JSON.stringify(obj) }
function argsify(str) { try { return str ? JSON.parse(str) : {} } catch (e) { return {} } }

/**
 * 格式化日期：MMDDYY
 */
function formatDateTime(str) {
    try {
        if (!str) return '未知';
        let d = new Date(str);
        if (isNaN(d.getTime())) return '未知';
        return `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getFullYear()).slice(-2)}`;
    } catch (e) { return '未知'; }
}

// ================= 常量与配置 =================
const PAN_PIC_MAP = {
    aliyun: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/ali.jpg",
    quark: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/quark.png",
    uc: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/uc.png",
    pikpak: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/pikpak.jpg",
    xunlei: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/thunder.png",
    '123': "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/123.png",
    tianyi: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/189.png",
    mobile: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/139.jpg",
    '115': "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/115.jpg",
    baidu: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/baidu.jpg",
}

// 配置解析
const PAN_URLS = ($config?.pansou_urls || "").split(/[\n,]/).map(u => u.trim()).filter(u => u);
const PAN_TOKEN = $config?.pansou_token || "";

// 网盘类型映射 (前端Key -> 后端Key)
const TYPE_MAP = [
    { front: 'quark', back: 'quark' }, { front: 'uc', back: 'uc' }, 
    { front: 'ali', back: 'aliyun' }, { front: 'a189', back: 'tianyi' },
    { front: 'a139', back: 'mobile' }, { front: 'a115', back: '115' },
    { front: 'baidu', back: 'baidu' }, { front: 'pikpak', back: 'pikpak' },
    { front: 'xunlei', back: 'xunlei' }, { front: 'a123', back: '123' }
];

const ENABLED_BACKEND_TYPES = TYPE_MAP
    .filter(m => $config?.[m.front] !== false)
    .map(m => m.back);

const BACKEND_TO_FRONT = TYPE_MAP.reduce((acc, m) => ({ ...acc, [m.back]: m.front }), {});

// ================= 核心逻辑 =================

function getHeaders() {
    const headers = { 
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        'Content-Type': 'application/json' 
    };
    if (PAN_TOKEN) headers['Authorization'] = `Bearer ${PAN_TOKEN}`; // 注入JWT Token
    return headers;
}

/**
 * 探测可用 API：优先通过 /api/health 检查
 */
async function getAvailableAPI() {
    if (!PAN_URLS.length) return null;
    
    const tasks = PAN_URLS.map(async url => {
        try {
            const start = Date.now();
            const res = await $fetch.get(`${url}/api/health`, { timeout: 3000 });
            return (res.status === 200) ? { url, latency: Date.now() - start } : null;
        } catch (e) { return null; }
    });

    const results = (await Promise.all(tasks)).filter(r => r).sort((a, b) => a.latency - b.latency);
    return results.length ? results[0].url : PAN_URLS[0];
}

/**
 * 智能排序：网盘优先级 > 质量评分 > 时间新鲜度
 */
function sortResults(a, b, priorityMap) {
    const pa = priorityMap[a.front_type] ?? 99, pb = priorityMap[b.front_type] ?? 99;
    if (pa !== pb) return pa - pb;
    
    const getScore = (name) => {
        let s = 0;
        if (/(4K|2160P|HDR|REMUX|杜比|DV)/i.test(name)) s += 50;
        if (/(完结|全集|合集|Season|S0)/i.test(name)) s += 30;
        return s;
    };
    
    const scoreA = getScore(a.vod_name), scoreB = getScore(b.vod_name);
    if (scoreA !== scoreB) return scoreB - scoreA;
    
    return b.ts - a.ts;
}

// ================= XPTV 接口实现 =================

async function getConfig() {
    return jsonify({
        ver: 1,
        title: "PanSou 资源搜索",
        site: PAN_URLS[0] || "PanSou",
        home: true, // 启用首页显示
        home_content: [{ // 首页显示的内容
            vod_id: "prompt",
            vod_name: "输入关键词开始搜索",
            vod_pic: "https://img.icons8.com/clouds/200/search.png",
            vod_remarks: "🔍 支持电影、电视剧、综艺、动漫等资源搜索",
            no_play: true // 标记为不可播放，仅作提示
        }],
        tabs: [{ 
            name: '搜索', 
            ext: jsonify({ id: 'search' }),
            hint: "输入关键词开始搜索" // 搜索框提示文字
        }]
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const kw = ext.search_text || ext.text || "";
    if (!kw) {
        $utils.toastInfo("输入关键词开始搜索");
        return jsonify({ 
            list: [] 
        });
    }

    const apiUrl = await getAvailableAPI();
    if (!apiUrl) return $utils.toastError("API地址无效") || jsonify({ list: [] });

    try {
        const res = await $fetch.post(`${apiUrl}/api/search`, {
            kw: kw,
            res: "merge", // 请求聚合数据
            cloud_types: ENABLED_BACKEND_TYPES,
            src: "all",
            filter: { 
                exclude: ["预告", "花絮", "枪版", "TC", "TS版"] // 调用后端原生过滤
            }
        }, { headers: getHeaders() });

        const respData = typeof res.data === 'string' ? argsify(res.data) : res.data;
        // 兼容不同的后端 Response 结构
        const mergedData = respData?.merged_by_type || respData?.data?.merged_by_type;

        if (!mergedData) return jsonify({ list: [] });

        const userPrio = $config?.pan_priority || [];
        const prioMap = {};
        userPrio.forEach((p, i) => prioMap[p] = i);

        let allCards = [];
        Object.entries(mergedData).forEach(([bKey, items]) => {
            const fKey = BACKEND_TO_FRONT[bKey] || bKey;
            const pic = PAN_PIC_MAP[bKey] || "";
            
            items.forEach(item => {
                const ts = item.datetime ? new Date(item.datetime).getTime() : 0;
                const sourceStr = (item.source || "").replace("plugin:", "🔌").replace("tg:", "📢"); // 来源图标化
                
                allCards.push({
                    vod_id: item.url,
                    vod_name: item.note || kw,
                    vod_pic: pic,
                    vod_remarks: `${sourceStr} | ${fKey.toUpperCase()} | ${formatDateTime(item.datetime)}`,
                    ts: ts,
                    front_type: fKey,
                    ext: jsonify({ 
                        url: item.url, 
                        pwd: item.password || "",
                        title: item.note || kw 
                    })
                });
            });
        });

        allCards.sort((a, b) => sortResults(a, b, prioMap));

        // xptv 分页逻辑
        const page = parseInt(ext.page) || 1;
        const pageSize = 20;
        return jsonify({
            list: allCards.slice((page - 1) * pageSize, page * pageSize),
            page: page,
            pagecount: Math.ceil(allCards.length / pageSize) || 1
        });

    } catch (e) {
        $print(`Search Error: ${e.message}`);
        return jsonify({ list: [] });
    }
}

async function getTracks(ext) {
    ext = argsify(ext);
    const { url, pwd, title } = ext;
    // 构造播放列表轨道
    return jsonify({
        list: [{
            title: '链接详情',
            tracks: [{
                name: `${title}${pwd ? ' [提取码：' + pwd + ']' : ''}`,
                pan: url,
                ext: jsonify({ url })
            }]
        }]
    });
}

async function getPlayinfo(ext) {
    // 网盘类插件通常直接由 xptv 解析链接，此处保持空返回
    return jsonify({ urls: [] });
}

async function search(ext) {
    return getCards(ext);
}
