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
    { name: "🔥 热播电影", kw: "2024 电影 4K", pic: "https://img.icons8.com/clouds/200/movie-projector.png", remark: "4K蓝光原盘/REMUX" },
    { name: "📺 热门剧集", kw: "2024 电视剧 完结", pic: "https://img.icons8.com/clouds/200/tv-show.png", remark: "全集打包/同步更新" },
    { name: "🏮 精品动漫", kw: "动漫 1080P 全集", pic: "https://img.icons8.com/clouds/200/anime.png", remark: "新番连载/经典合集" },
    { name: "🌍 纪录片", kw: "纪录片 4K", pic: "https://img.icons8.com/clouds/200/documentary.png", remark: "地理/人文/自然" },
    { name: "🔎 黑神话", kw: "黑神话 悟空", pic: "https://img.icons8.com/clouds/200/fire-element.png", remark: "游戏资源/攻略合集" }
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
        title: "PanSou 搜索中心", 
        site: PAN_URLS[0] || "",
        tabs: [{ 
            name: '网盘探索', 
            ext: jsonify({ id: 'home' }) 
        }]
    });
}

/**
 * 核心搜索函数：封装 API 请求逻辑
 */
async function performSearch(query, page = 1) {
    const apiUrl = await getAvailableAPI();
    if (!apiUrl) return [];

    try {
        const res = await $fetch.post(`${apiUrl}/api/search`, {
            kw: query,
            res: "merge",
            cloud_types: ENABLED_BACKEND_TYPES,
            src: "all",
            filter: {
                include: ["电影", "电视剧", "动漫", "4K", "REMUX"],
                exclude: ["预告", "枪版", "TC", "广告"]
            }
        }, { headers: { 'Authorization': `Bearer ${PAN_TOKEN}`, 'Content-Type': 'application/json' } });

        const respData = typeof res.data === 'string' ? argsify(res.data) : res.data;
        const mergedData = respData?.merged_by_type || respData?.data?.merged_by_type;
        if (!mergedData) return [];

        const userPrio = $config?.pan_priority || [];
        const prioMap = {};
        userPrio.forEach((p, i) => prioMap[p] = i);

        let cards = [];
        Object.entries(mergedData).forEach(([bKey, items]) => {
            const fKey = BACKEND_TO_FRONT[bKey] || bKey;
            items.forEach(item => {
                cards.push({
                    vod_id: item.url,
                    vod_name: item.note || query,
                    vod_pic: PAN_PIC_MAP[bKey] || "",
                    vod_remarks: `${fKey.toUpperCase()} | ${formatDateTime(item.datetime)}`,
                    ts: item.datetime ? new Date(item.datetime).getTime() : 0,
                    front_type: fKey,
                    ext: jsonify({ url: item.url, pwd: item.password || "", title: item.note || query })
                });
            });
        });

        cards.sort((a, b) => {
            const pa = prioMap[a.front_type] ?? 99, pb = prioMap[b.front_type] ?? 99;
            return pa !== pb ? pa - pb : b.ts - a.ts;
        });

        return cards;
    } catch (e) { return []; }
}

async function getCards(ext) {
    ext = argsify(ext);
    const kw = ext.search_text || ext.text || "";
    
    // --- 1. 首页推荐展示 ---
    if (!kw) {
        return jsonify({ 
            list: HOT_KEYWORDS.map(item => ({
                vod_id: `rec:${item.kw}`,
                vod_name: item.name,
                vod_pic: item.pic,
                vod_remarks: item.remark,
                style: { type: "rect", ratio: 1.4 },
                // 关键修改：将关键词放入 ext，在详情页拦截触发搜索
                ext: jsonify({ is_recommend: true, kw: item.kw }) 
            }))
        });
    }

    // --- 2. 正常搜索逻辑 ---
    const list = await performSearch(kw, ext.page || 1);
    const page = parseInt(ext.page) || 1;
    return jsonify({
        list: list.slice((page - 1) * 20, page * 20),
        page: page,
        pagecount: Math.ceil(list.length / 20) || 1
    });
}

async function getTracks(ext) {
    ext = argsify(ext);
    
    // --- 3. 拦截推荐卡片点击动作 ---
    if (ext.is_recommend) {
        $utils.toastInfo(`正在搜索: ${ext.kw}`);
        const list = await performSearch(ext.kw);
        // 这里返回搜索结果列表，点击推荐卡片后会直接进入该列表页
        return jsonify({
            list: [{
                title: `“${ext.kw}” 的搜索结果`,
                tracks: list.map(item => ({
                    name: item.vod_name,
                    pan: item.vod_id,
                    ext: item.ext // 这里的 ext 包含了真正的网盘链接
                }))
            }]
        });
    }

    // --- 4. 正常网盘详情展示 ---
    const { url, pwd, title } = ext;
    return jsonify({
        list: [{
            title: '资源链接',
            tracks: [{ 
                name: `${title}${pwd ? ' [码：' + pwd + ']' : ''}`, 
                pan: url, 
                ext: jsonify({ url }) 
            }]
        }]
    });
}

async function getPlayinfo() { return jsonify({ urls: [] }); }
async function search(ext) { return getCards(ext); }
