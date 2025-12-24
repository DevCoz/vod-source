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
        return isNaN(d.getTime()) ? '未知' : `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getFullYear()).slice(-2)}`;
    } catch (e) { return '未知'; }
}

// ================= 常量与配置 =================
const HOT_KEYWORDS = [
    { name: "热播电影", kw: "2024 电影 4K", pic: "https://img.icons8.com/clouds/200/movie-projector.png", remark: "近期院线与热门大片" },
    { name: "热门剧集", kw: "2024 电视剧 完结", pic: "https://img.icons8.com/clouds/200/tv-show.png", remark: "同步更新最新剧集" },
    { name: "精品动漫", kw: "动漫 1080P 全集", pic: "https://img.icons8.com/clouds/200/anime.png", remark: "新番与经典补番" },
    { name: "纪录片控", kw: "纪录片 4K", pic: "https://img.icons8.com/clouds/200/documentary.png", remark: "高画质人文地理" },
    { name: "近期热搜", kw: "黑神话 悟空", pic: "https://img.icons8.com/clouds/200/fire-element.png", remark: "大家都在找" }
];

const PAN_PIC_MAP = {
    aliyun: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/ali.jpg",
    quark: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/quark.png",
    uc: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/uc.png",
    pikpak: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/pikpak.jpg",
    xunlei: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/thunder.png",
    tianyi: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/189.png",
    baidu: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/baidu.jpg",
};

const PAN_URLS = ($config?.pansou_urls || "").split(/[\n,]/).map(u => u.trim()).filter(u => u);
const PAN_TOKEN = $config?.pansou_token || "";

const TYPE_MAP = [
    { front: 'quark', back: 'quark' }, { front: 'uc', back: 'uc' }, { front: 'ali', back: 'aliyun' },
    { front: 'a189', back: 'tianyi' }, { front: 'baidu', back: 'baidu' }, { front: 'pikpak', back: 'pikpak' }
];

const ENABLED_BACKEND_TYPES = TYPE_MAP.filter(m => $config?.[m.front] !== false).map(m => m.back);
const BACKEND_TO_FRONT = TYPE_MAP.reduce((acc, m) => ({ ...acc, [m.back]: m.front }), {});

// ================= 核心逻辑 =================

async function getAvailableAPI() {
    if (!PAN_URLS.length) return null;
    const tasks = PAN_URLS.map(async url => {
        try {
            const res = await $fetch.get(`${url}/api/health`, { timeout: 2000 });
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
        title: "PanSou 智能搜索", 
        site: PAN_URLS[0] || "",
        tabs: [{ 
            name: '探索 & 搜索', 
            ext: jsonify({ id: 'home' }) 
        }]
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    // 兼容 xptv 的多种搜索文本字段
    const kw = ext.search_text || ext.text || ext.kw || "";
    
    // --- 1. 首页推荐逻辑 ---
    if (!kw) {
        return jsonify({ 
            list: HOT_KEYWORDS.map(item => ({
                vod_id: `search:${item.kw}`,
                vod_name: item.name,
                vod_pic: item.pic,
                vod_remarks: item.remark,
                style: { type: "rect", ratio: 1.5 }, // 调整比例为矩形
                ext: jsonify({ search_text: item.kw }) // 点击触发搜索
            }))
        });
    }

    // --- 2. 处理点击推荐词跳转搜索 ---
    const searchTarget = kw.startsWith('search:') ? kw.split('search:')[1] : kw;

    const apiUrl = await getAvailableAPI();
    if (!apiUrl) return $utils.toastError("API地址无效") || jsonify({ list: [] });

    try {
        const res = await $fetch.post(`${apiUrl}/api/search`, {
            kw: searchTarget,
            res: "merge", 
            cloud_types: ENABLED_BACKEND_TYPES,
            src: "all",
            filter: { 
                include: ["电影", "电视剧", "动漫", "4K", "1080P", "REMUX"],
                exclude: ["预告", "枪版", "TC", "广告", "短剧"]
            }
        }, { headers: { 'Authorization': `Bearer ${PAN_TOKEN}`, 'Content-Type': 'application/json' } });

        const respData = typeof res.data === 'string' ? argsify(res.data) : res.data;
        const mergedData = respData?.merged_by_type || respData?.data?.merged_by_type;
        
        if (!mergedData) {
            $utils.toastInfo("未找到相关结果");
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
                allCards.push({
                    vod_id: item.url,
                    vod_name: item.note || searchTarget,
                    vod_pic: pic,
                    vod_remarks: `${fKey.toUpperCase()} | ${formatDateTime(item.datetime)} | ${item.source || ''}`,
                    ts: item.datetime ? new Date(item.datetime).getTime() : 0,
                    front_type: fKey,
                    ext: jsonify({ url: item.url, pwd: item.password || "", title: item.note || searchTarget })
                });
            });
        });

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
    } catch (e) { return jsonify({ list: [] }); }
}

async function getTracks(ext) {
    ext = argsify(ext);
    // 处理从推荐词卡片点进来的情况
    if (ext.search_text) {
        return getCards(ext); 
    }
    const { url, pwd, title } = ext;
    return jsonify({
        list: [{
            title: '网盘链接',
            tracks: [{ name: `${title}${pwd ? ' [码：' + pwd + ']' : ''}`, pan: url, ext: jsonify({ url }) }]
        }]
    });
}

async function getPlayinfo() { return jsonify({ urls: [] }); }
async function search(ext) { return getCards(ext); }
