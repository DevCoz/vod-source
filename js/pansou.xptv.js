// ================= 自定义配置格式 =================
// {
//   "pansou_urls": "https://api1.example.com,https://api2.example.com",
//   "pansou_token": "",
//   "quark": true,
//   "ali": true,
//   "pan_priority": ["quark", "ali", "115", "tianyi"],
//   "check_enabled": true
// }

const $config = argsify(typeof $config_str !== 'undefined' ? $config_str : '{}');

function argsify(str) { try { return str ? JSON.parse(str) : {} } catch (e) { return {} } }
function jsonify(obj) { return JSON.stringify(obj) }

// ================= 常量配置 =================
const PAN_PIC_MAP = {
    aliyun: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/ali.jpg",
    quark: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/quark.png",
    '115': "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/115.jpg",
    tianyi: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/189.png",
};

// 链接检测状态中文映射
const CHECK_STATE_MAP = {
    ok: '✅ 有效',
    bad: '❌ 失效',
    locked: '🔒 加密',
    unsupported: '⚠️ 不支持',
    uncertain: '❓ 未知',
};

// ================= 类型映射 =================
const TYPE_MAP = [
    { front: 'quark', back: 'quark' },
    { front: 'ali', back: 'aliyun' },
    { front: 'a189', back: 'tianyi' },
    { front: 'a115', back: '115' },
];

const PAN_URLS = ($config?.pansou_urls || "").split(/[\n,]/).map(u => u.trim()).filter(Boolean);
const ENABLED_TYPES = TYPE_MAP.filter(m => $config?.[m.front] !== false).map(m => m.back);
const B2F = TYPE_MAP.reduce((acc, m) => ({ ...acc, [m.back]: m.front }), {});
const CHECK_ENABLED = $config?.check_enabled !== false;

// ================= 核心逻辑 =================

// 健康检查：遍历多个 PanSou 后端，返回第一个可用的
async function getAPI() {
    if (!PAN_URLS.length) return null;
    for (const url of PAN_URLS) {
        try {
            const res = await $fetch.get(`${url}/api/health`, { timeout: 2000 });
            if (res.status === 200) return url;
        } catch (e) {}
    }
    return PAN_URLS[0];
}

// 链接检测：POST /api/check 批量检测网盘链接状态
let checkSupported = true; // 自动降级：首次404后跳过
async function checkLinks(api, items) {
    if (!items || items.length === 0 || !checkSupported) return {};
    const BATCH_SIZE = 20;
    const allResults = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        try {
            const resp = await $fetch.post(`${api}/api/check/links`, { items: batch }, {
                headers: { 'Content-Type': 'application/json' },
            });
            if (resp.status === 404) {
                $print('check API not available (404), skipping');
                checkSupported = false;
                return {};
            }
            const body = typeof resp.data === 'string' ? argsify(resp.data) : resp.data;
            const results = body?.results || body?.data?.results || [];
            for (const r of results) allResults.push(r);
        } catch (e) {
            $print(`checkLinks error: ${e.message || e}`);
            checkSupported = false;
            return {};
        }
    }
    const map = {};
    for (const r of allResults) {
        map[r.url] = { state: r.state || 'uncertain', summary: r.summary || '' };
    }
    return map;
}

// ================= 六个接口 =================

async function getLocalInfo() {
    return jsonify({
        ver: 1,
        name: 'PanSou网盘搜索',
        api: 'csp_pansou',
        type: 3,
    });
}

async function getConfig() {
    return jsonify({
        ver: 1,
        title: "PanSou 网盘搜索",
        site: PAN_URLS[0] || "",
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const kw = ext.search_text || ext.text || "";
    if (!kw) return jsonify({ list: [] });

    const api = await getAPI();
    if (!api) return jsonify({ list: [] });

    try {
        // 搜索
        const { data: searchData } = await $fetch.post(`${api}/api/search`, {
            kw, res: "merge", src: "all", cloud_types: ENABLED_TYPES,
            filter: {
                include: ["HDR", "杜比", "DV", "REMUX", "HQ", "臻彩", "高码", "高画质", "60FPS", "60帧", "高帧率", "60HZ", "4K", "2160P"],
                exclude: ["预告", "花絮", "枪版", "TS", "广告"],
            },
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': $config?.pansou_token ? `Bearer ${$config.pansou_token}` : '',
            },
        });

        const respBody = typeof searchData === 'string' ? argsify(searchData) : searchData;
        const mergedData = (respBody?.merged_by_type || respBody?.data?.merged_by_type) || {};
        const prio = ($config?.pan_priority || []).reduce((acc, k, i) => ({ ...acc, [k]: i }), {});

        // 构造待检测链接列表
        const checkItems = [];
        for (const [bKey, items] of Object.entries(mergedData)) {
            for (const item of items) {
                checkItems.push({
                    disk_type: bKey,
                    url: item.url,
                    password: item.password || '',
                });
            }
        }

        // 批量链接检测
        let checkMap = {};
        if (CHECK_ENABLED && checkItems.length > 0) {
            checkMap = await checkLinks(api, checkItems);
        }

        let list = [];
        Object.entries(mergedData).forEach(([bKey, items]) => {
            items.forEach(item => {
                const checkResult = checkMap[item.url];
                const checkState = checkResult?.state || '';
                const checkLabel = CHECK_STATE_MAP[checkState] || '';

                list.push({
                    vod_id: item.url,
                    vod_name: item.note || kw,
                    vod_pic: PAN_PIC_MAP[bKey] || "",
                    vod_remarks: `${(B2F[bKey] || bKey).toUpperCase()} | ${item.datetime?.split('T')[0] || ''}${checkLabel ? ' | ' + checkLabel : ''}`,
                    ts: item.datetime ? new Date(item.datetime).getTime() : 0,
                    fKey: B2F[bKey] || bKey,
                    check_state: checkState,
                    ext: jsonify({ url: item.url, pwd: item.password || "", title: item.note || kw }),
                });
            });
        });

        // 排序：有效链接优先，再按网盘优先级和时间
        list.sort((a, b) => {
            // 失效链接排最后
            if (a.check_state === 'bad' && b.check_state !== 'bad') return 1;
            if (b.check_state === 'bad' && a.check_state !== 'bad') return -1;
            // 网盘优先级
            const prioDiff = (prio[a.fKey] ?? 99) - (prio[b.fKey] ?? 99);
            if (prioDiff !== 0) return prioDiff;
            // 时间倒序
            return b.ts - a.ts;
        });

        const page = parseInt(ext.page) || 1;
        return jsonify({
            list: list.slice((page - 1) * 20, page * 20),
            page,
            pagecount: Math.ceil(list.length / 20) || 1,
        });
    } catch (e) { return jsonify({ list: [] }); }
}

async function getTracks(ext) {
    const { url, pwd, title } = argsify(ext);
    return jsonify({
        list: [{
            title: '链接详情',
            tracks: [{
                name: `${title}${pwd ? ' [' + pwd + ']' : ''}`,
                pan: url,
                ext: jsonify({ url }),
            }],
        }],
    });
}

async function getPlayinfo() { return jsonify({ urls: [] }); }
async function search(ext) { return getCards(ext); }
