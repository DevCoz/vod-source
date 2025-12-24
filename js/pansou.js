// 自定义配置格式
// {
//   "pansou_urls": "https://api1.example.com,https://api2.example.com",
//   "pansou_token": "",
//   "quark": true,
//   "uc": true,
//   "pikpak": false,
//   "xunlei": false,
//   "a123": false,
//   "a189": true,
//   "a139": false,
//   "a115": true,
//   "baidu": false,
//   "ali": true,
//   "pan_priority": ["quark", "uc", "ali", "a189", "pikpak", "xunlei", "a123", "a139", "a115", "baidu"]
// }

// ================= 用户配置 =================
// 建议在 TVBox/xptv 配置中传入 ext 字符串，此处作为默认回退
const DEFAULT_CONFIG = {
    // API地址列表，支持多个负载均衡
    pansou_urls: "https://api.pan-sou.com,https://备用API.com",
    pansou_token: "", // 认证Token，如启用 Auth 则必填
    // 网盘开关
    quark: true, uc: true, pikpak: false, xunlei: false,
    a123: false, a189: true, a139: false, a115: true, baidu: false, ali: true,
    // 排序优先级 (索引越小优先级越高)
    pan_priority: ["quark", "uc", "ali", "a189", "pikpak", "xunlei", "a123", "a139", "a115", "baidu"]
}

// 解析配置
const $config = (() => {
    try {
        const uConf = argsify($config_str);
        return { ...DEFAULT_CONFIG, ...uConf };
    } catch (e) {
        return DEFAULT_CONFIG;
    }
})();

// ================= 常量定义 =================
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
    'Content-Type': 'application/json',
};

// 关键词权重配置
const KW_CONFIG = {
    QUALITY: ['HDR', '杜比', 'DV', 'REMUX', 'HQ', '臻彩', '高码', '高画质', '60FPS', '4K', '2160P'],
    COMPLETE: ['完结', '全集', '已完成', '全', 'S0', 'E0'],
    // 提交给服务端的过滤词
    EXCLUDE: ["枪版", "预告", "彩蛋", "花絮", "广告"]
};

// 网盘图标映射 (用户自定义)
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

// 后端Key与显示名称映射
const PAN_DEF = {
    quark: { b: 'quark', n: '夸克' },
    uc: { b: 'uc', n: 'UC' },
    pikpak: { b: 'pikpak', n: 'PikPak' },
    xunlei: { b: 'xunlei', n: '迅雷' },
    a123: { b: '123', n: '123盘' },
    a189: { b: 'tianyi', n: '天翼' },
    a139: { b: 'mobile', n: '移动' },
    a115: { b: '115', n: '115' },
    baidu: { b: 'baidu', n: '百度' },
    ali: { b: 'aliyun', n: '阿里' }
};

// 初始化启用的网盘列表
const { ENABLED_CLOUDS, PRIORITY_MAP, BACKEND_TO_KEY } = (() => {
    const enabled = [], prioMap = {}, b2k = {};
    const userPrio = $config.pan_priority || [];
    let defaultIdx = userPrio.length;
    
    Object.keys(PAN_DEF).forEach(k => {
        const def = PAN_DEF[k];
        b2k[def.b] = k; // 建立 backend -> internal key 映射
        if ($config[k] !== false) enabled.push(def.b); // 收集启用的 backend key
        
        const idx = userPrio.indexOf(k);
        prioMap[k] = idx > -1 ? idx : defaultIdx++;
    });
    return { ENABLED_CLOUDS: enabled, PRIORITY_MAP: prioMap, BACKEND_TO_KEY: b2k };
})();

const API_URLS = ($config.pansou_urls || "").split(/[\n,]/).map(u => u.trim()).filter(u => u);

// ================= 全局状态 (用于缓存和分页) =================
let _cachedApiUrl = null;
let _searchCache = { kw: null, data: null, timestamp: 0 };

// ================= 工具函数 =================
const jsonify = (obj) => JSON.stringify(obj);
const argsify = (str) => { try { return str ? JSON.parse(str) : {} } catch (e) { return {} } };

function formatDateTime(input) {
    if (!input) return '未知';
    try {
        let date = /^\d+$/.test(input) ? new Date(parseInt(input) * (input.length === 10 ? 1000 : 1)) : new Date(input);
        if (isNaN(date.getTime())) return '未知';
        return `${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    } catch { return '未知'; }
}

function getHeaders() {
    const h = { ...HEADERS };
    // 如果配置了 Token，添加到 Header
    if ($config.pansou_token) h['Authorization'] = `Bearer ${$config.pansou_token}`;
    return h;
}

// 并发测速选择最快的 API
async function getFastestApi() {
    if (_cachedApiUrl) return _cachedApiUrl;
    if (!API_URLS.length) return null;
    
    // 简单的并发竞速
    const checks = API_URLS.map(async (url) => {
        try {
            const start = Date.now();
            // 使用 health 接口或轻量 search 进行探测
            await $fetch.get(`${url}/api/health`, { headers: getHeaders(), timeout: 3000 });
            return { url, latency: Date.now() - start };
        } catch (e) { return null; }
    });

    const valid = (await Promise.all(checks)).filter(Boolean).sort((a, b) => a.latency - b.latency);
    if (valid.length) {
        $print(`[PanSou] 优选API: ${valid[0].url} (${valid[0].latency}ms)`);
        _cachedApiUrl = valid[0].url;
        return _cachedApiUrl;
    }
    return API_URLS[0]; // 兜底
}

// 排序算法
function sortResults(a, b) {
    // 1. 网盘优先级
    const pA = PRIORITY_MAP[a.panKey] ?? 999;
    const pB = PRIORITY_MAP[b.panKey] ?? 999;
    if (pA !== pB) return pA - pB;
    
    // 2. 完结匹配
    const isFullA = KW_CONFIG.COMPLETE.some(k => a.vod_name.includes(k));
    const isFullB = KW_CONFIG.COMPLETE.some(k => b.vod_name.includes(k));
    if (isFullA !== isFullB) return isFullA ? -1 : 1;
    
    // 3. 时间倒序
    return b.datetime - a.datetime;
}

// ================= 核心接口实现 =================

async function getConfig() {
    return jsonify({
        ver: 1,
        title: "聚合盘搜",
        site: "PanSou",
        tabs: [{ name: '搜索结果', ext: jsonify({ id: 'search' }) }]
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const kw = ext.search_text || ext.text || ext.query || ext.wd || "";
    const page = parseInt(ext.page) || 1;
    const pageSize = 20;

    if (!kw) return jsonify({ list: [] });

    try {
        let allItems = [];

        // 缓存命中检查：如果关键词相同且有数据，直接读内存，不请求 API
        if (_searchCache.kw === kw && _searchCache.data) {
            allItems = _searchCache.data;
        } else {
            const apiUrl = await getFastestApi();
            if (!apiUrl) return $utils.toastError("无可用API") || jsonify({ list: [] });

            // 构造请求体
            const reqBody = {
                kw: kw,
                // 服务端过滤：直接在源头去除无效资源
                filter: { exclude: KW_CONFIG.EXCLUDE },
                cloud_types: ENABLED_CLOUDS,
                res: "merge", // 请求聚合后的数据
                src: "all"
            };

            const res = await $fetch.post(`${apiUrl}/api/search`, reqBody, { headers: getHeaders() });
            const data = argsify(res.data);

            if (data && data.merged_by_type) {
                // 扁平化数据结构
                Object.entries(data.merged_by_type).forEach(([bKey, rows]) => {
                    const fKey = BACKEND_TO_KEY[bKey]; // 转为内部Key (如 tianyi -> a189)
                    if (!fKey) return;
                    
                    const panName = PAN_DEF[fKey].n;
                    // 使用用户自定义的图标 Map
                    const pic = PAN_PIC_MAP[bKey] || PAN_PIC_MAP[fKey] || "";

                    rows.forEach(row => {
                        const dt = new Date(row.datetime).getTime();
                        allItems.push({
                            vod_id: row.url,
                            vod_name: row.note || '未命名资源',
                            vod_pic: pic,
                            vod_remarks: `${panName} | ${formatDateTime(dt)}`,
                            // 内部字段供排序和详情使用
                            datetime: dt,
                            panKey: fKey,
                            raw: row
                        });
                    });
                });
                
                // 执行排序
                allItems.sort(sortResults);
                
                // 更新缓存
                _searchCache = { kw: kw, data: allItems, timestamp: Date.now() };
            }
        }

        // 内存分页逻辑
        const total = allItems.length;
        const pageCount = Math.ceil(total / pageSize) || 1;
        const start = (page - 1) * pageSize;
        const pagedList = allItems.slice(start, start + pageSize);

        // 映射为 TVBox Card 格式
        return jsonify({
            list: pagedList.map(item => ({
                vod_id: item.vod_id,
                vod_name: item.vod_name,
                vod_pic: item.vod_pic,
                vod_remarks: item.vod_remarks,
                // 将详情页需要的关键数据放入 ext
                ext: jsonify({ 
                    url: item.vod_id, 
                    name: item.vod_name, 
                    pwd: item.raw.password || '' 
                })
            })),
            page: page,
            pagecount: pageCount,
            total: total
        });

    } catch (e) {
        $print(`Search Error: ${e.message}`);
        return $utils.toastError(`搜索失败: ${e.message}`) || jsonify({ list: [] });
    }
}

async function getTracks(ext) {
    ext = argsify(ext);
    // ext 包含 url, name, pwd
    const { url, name, pwd } = ext;
    
    // 拼接展示名称
    const trackTitle = pwd ? `${name} (密码: ${pwd})` : name;
    
    return jsonify({
        list: [{
            title: '网盘链接',
            tracks: [{
                name: trackTitle,
                pan: url, // xptv 会自动识别 pan 字段调用对应解析
                ext: jsonify({ url: url }) // 传递给 getPlayinfo (如有需要)
            }]
        }]
    });
}

async function getPlayinfo(ext) {
    // 通常网盘资源不需要在此处解析，xptv 内部处理
    // 但为了兼容性返回标准结构
    ext = argsify(ext);
    return jsonify({ urls: [ext.url], headers: [] });
}

async function search(ext) {
    // 搜索入口直接复用 getCards 逻辑
    return getCards(ext);
}
