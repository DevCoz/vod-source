// ================= 配置说明 =================
// pansou_urls: PanSou API地址
// pancheck_url: PanCheck 服务地址 (如 http://192.168.1.100:8080)

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

// ================= 常量配置 =================
const PAN_PIC_MAP = {
    aliyun: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/ali.jpg",
    quark: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/quark.png",
    uc: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/uc.png",
    baidu: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/baidu.jpg",
    tianyi: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/189.png"
};

const PAN_URLS = ($config?.pansou_urls || "").split(/[\n,]/).map(u => u.trim()).filter(u => u);
const PAN_TOKEN = $config?.pansou_token || "";
const PANCHECK_URL = $config?.pancheck_url || ""; 

const TYPE_MAP = [
    { front: 'quark', back: 'quark' }, { front: 'ali', back: 'aliyun' },
    { front: 'uc', back: 'uc' }, { front: 'baidu', back: 'baidu' },
    { front: 'a189', back: 'tianyi' }
];

const ENABLED_BACKEND_TYPES = TYPE_MAP.filter(m => $config?.[m.front] !== false).map(m => m.back);
const BACKEND_TO_FRONT = TYPE_MAP.reduce((acc, m) => ({ ...acc, [m.back]: m.front }), {});

// ================= 搜索核心逻辑 =================

async function performSearch(query) {
    if (!PAN_URLS.length) return [];
    let apiUrl = PAN_URLS[0];

    try {
        const res = await $fetch.post(`${apiUrl}/api/search`, {
            kw: query,
            res: "merge",
            cloud_types: ENABLED_BACKEND_TYPES,
            src: "all",
            filter: { 
                include: ["电影", "电视剧", "动漫"],
                exclude: ["预告", "枪版", "广告"] 
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
        title: "网盘搜索(检测版)",
        site: PAN_URLS[0] || "",
        tabs: [{ name: '搜索', ext: { id: 'search' } }]
    });
}

async function getTracks(ext) {
    ext = argsify(ext);
    let rawUrl = ext.url || ext.vod_id;
    if (!rawUrl || rawUrl === 'tip') return jsonify({ list: [] });

    // --- 1. 链接预处理（清洗） ---
    // 提取真正的 URL，防止带入干扰字符
    const urlMatch = rawUrl.match(/https?:\/\/[^\s]+(?=\b|\/)/i);
    const cleanUrl = urlMatch ? urlMatch[0] : rawUrl;

    let statusPrefix = "⏳ [未检测] ";
    
    // --- 2. 识别平台（辅助 PanCheck） ---
    let platform = [];
    if (cleanUrl.includes("quark.cn")) platform = ["quark"];
    else if (cleanUrl.includes("aliyundrive.com") || cleanUrl.includes("alipan.com")) platform = ["aliyun"];
    else if (cleanUrl.includes("pan.baidu.com")) platform = ["baidu"];
    else if (cleanUrl.includes("uc.cn")) platform = ["uc"];
    else if (cleanUrl.includes("189.cn")) platform = ["tianyi"];
    else if (cleanUrl.includes("123pan.com")) platform = ["pan123"];
    else if (cleanUrl.includes("115.com")) platform = ["pan115"];
    else if (cleanUrl.includes("xunlei.com")) platform = ["xunlei"];

    // --- 3. 调用 PanCheck ---
    if (PANCHECK_URL) {
        try {
            $utils.toastInfo("正在深度检测链接有效性...");
            const res = await $fetch.post(`${PANCHECK_URL}/api/v1/links/check`, {
                links: [cleanUrl],
                selectedPlatforms: platform.length > 0 ? platform : undefined
            }, { timeout: 15000 });

            const data = argsify(res.data);
            
            // 只要返回的 valid_links 包含数据，则认为通过
            if (data.valid_links && data.valid_links.length > 0) {
                statusPrefix = "✅ [有效] ";
            } else if (data.invalid_links && data.invalid_links.length > 0) {
                statusPrefix = "❌ [已失效] ";
            } else if (data.pending_links && data.pending_links.length > 0) {
                statusPrefix = "⏳ [排队中] ";
            } else {
                // 如果后端没返回结果，尝试从 URL 判断平台并提示
                const pName = platform.length > 0 ? platform[0].toUpperCase() : "未知";
                statusPrefix = `❓ [${pName}平台暂无法检测] `;
            }
        } catch (e) {
            statusPrefix = "⚠️ [检测系统超时] ";
        }
    }

    return jsonify({
        list: [{
            title: '链接检测结果',
            tracks: [{
                name: `${statusPrefix}${ext.title || '点击进入网盘'}`,
                pan: cleanUrl,
                ext: { url: cleanUrl }
            }]
        }]
    });
}
async function getPlayinfo() { return jsonify({ urls: [] }); }
async function search(ext) { return getCards(ext); }
