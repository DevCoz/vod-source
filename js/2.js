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

const PAN_URLS = ($config?.pansou_urls || "").split(/[\n,]/).map(u => u.trim()).filter(u => u);
const PAN_TOKEN = $config?.pansou_token || "";

const TYPE_MAP = [
    { front: 'quark', back: 'quark' }, { front: 'uc', back: 'uc' }, 
    { front: 'ali', back: 'aliyun' }, { front: 'a189', back: 'tianyi' },
    { front: 'a139', back: 'mobile' }, { front: 'a115', back: '115' },
    { front: 'baidu', back: 'baidu' }, { front: 'pikpak', back: 'pikpak' },
    { front: 'xunlei', back: 'xunlei' }, { front: 'a123', back: '123' }
];

const ENABLED_BACKEND_TYPES = TYPE_MAP.filter(m => $config?.[m.front] !== false).map(m => m.back);
const BACKEND_TO_FRONT = TYPE_MAP.reduce((acc, m) => ({ ...acc, [m.back]: m.front }), {});

// ================= 核心逻辑 =================

function getHeaders() {
    const headers = { 
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        'Content-Type': 'application/json' 
    };
    if (PAN_TOKEN) headers['Authorization'] = `Bearer ${PAN_TOKEN}`;
    return headers;
}

async function getAvailableAPI() {
    if (!PAN_URLS.length) return null;
    const tasks = PAN_URLS.map(async url => {
        try {
            const res = await $fetch.get(`${url}/api/health`, { timeout: 3000 });
            return (res.status === 200) ? url : null;
        } catch (e) { return null; }
    });
    const results = (await Promise.all(tasks)).filter(r => r);
    return results.length ? results[0] : PAN_URLS[0];
}

// ================= XPTV 接口实现 =================

async function getConfig() {
    return jsonify({
        ver: 1, 
        title: "PanSou 网盘搜索", 
        site: PAN_URLS[0] || "",
        tabs: [{ 
            name: '网盘搜索', 
            ext: jsonify({ id: 'search', prompt: '输入关键词开始搜索' }) 
        }]
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const kw = ext.search_text || ext.text || "";
    
    // 如果没有输入关键词，返回友好提示
    if (!kw) {
        $utils.toastInfo("输入关键词开始搜索");
        return jsonify({ 
            list: [{
                vod_id: 'tip',
                vod_name: '请在上方输入关键词开始搜索',
                vod_pic: 'https://img.icons8.com/clouds/200/search.png',
                vod_remarks: '等待输入...'
            }] 
        });
    }

    const apiUrl = await getAvailableAPI();
    if (!apiUrl) return $utils.toastError("API不可用，请检查配置") || jsonify({ list: [] });

    try {
        const res = await $fetch.post(`${apiUrl}/api/search`, {
            kw: kw,
            res: "merge", 
            cloud_types: ENABLED_BACKEND_TYPES,
            src: "all",
            filter: { 
                // 提高精度的核心过滤
                include: ["电影", "电视剧", "动漫", "全集", "纪录片", "4K", "HDR", "1080P"],
                exclude: ["预告", "花絮", "彩蛋", "枪版", "TC", "TS", "广告"]
            }
        }, { headers: getHeaders() });

        const respData = typeof res.data === 'string' ? argsify(res.data) : res.data;
        const mergedData = respData?.merged_by_type || respData?.data?.merged_by_type;
        
        if (!mergedData || Object.keys(mergedData).length === 0) {
            $utils.toastInfo("未找到相关资源");
            return jsonify({ list: [] });
        }

        const userPrio = $config?.pan_priority || [];
        const prioMap = {};
        userPrio.forEach((p, i) => prioMap[p] = i);

        let allCards = [];
        Object.entries(mergedData).forEach(([bKey, items]) => {
            const fKey = BACKEND_TO_FRONT[bKey] || bKey;
            const pic = PAN_PIC_MAP[bKey] || "";
            items.forEach(item => {
                const ts = item.datetime ? new Date(item.datetime).getTime() : 0;
                const source = (item.source || "").replace("plugin:", "🔌").replace("tg:", "📢");
                
                allCards.push({
                    vod_id: item.url,
                    vod_name: item.note || kw,
                    vod_pic: pic,
                    vod_remarks: `${source} | ${fKey.toUpperCase()} | ${formatDateTime(item.datetime)}`,
                    ts: ts,
                    front_type: fKey,
                    ext: jsonify({ url: item.url, pwd: item.password || "", title: item.note || kw })
                });
            });
        });

        // 综合排序：优先级 -> 时间
        allCards.sort((a, b) => {
            const pa = prioMap[a.front_type] ?? 99, pb = prioMap[b.front_type] ?? 99;
            return pa !== pb ? pa - pb : b.ts - a.ts;
        });

        const page = parseInt(ext.page) || 1;
        const pageSize = 20;
        return jsonify({
            list: allCards.slice((page - 1) * pageSize, page * pageSize),
            page: page,
            pagecount: Math.ceil(allCards.length / pageSize) || 1
        });
    } catch (e) { 
        $utils.toastError("搜索出错: " + e.message);
        return jsonify({ list: [] }); 
    }
}

async function getTracks(ext) {
    ext = argsify(ext);
    if (ext.vod_id === 'tip') return jsonify({ list: [] });
    const { url, pwd, title } = ext;
    return jsonify({
        list: [{
            title: '链接详情',
            tracks: [{ 
                name: `${title}${pwd ? ' [密：' + pwd + ']' : ''}`, 
                pan: url, 
                ext: jsonify({ url }) 
            }]
        }]
    });
}

async function getPlayinfo() { return jsonify({ urls: [] }); }
async function search(ext) { return getCards(ext); }
