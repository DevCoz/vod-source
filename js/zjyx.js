// ===================== 基础配置 =====================
const DATA_SOURCES = {
    zjrl: "https://zjrl-1318856176.cos.accelerate.myqcloud.com",
    gist: "https://gist.githubusercontent.com/huangxd-/5ae61c105b417218b9e5bad7073d2f36/raw",
    tmdbImage: "https://image.tmdb.org/t/p/w500"
};

const filterConfig = {
    "today": [{ key: "type", name: "类型", init: "juji", value: [{ n: "剧集", v: "juji" }, { n: "番剧", v: "fanju" }, { n: "国漫", v: "guoman" }, { n: "综艺", v: "zongyi" }] }],
    "tomorrow": [{ key: "type", name: "类型", init: "juji", value: [{ n: "剧集", v: "juji" }, { n: "番剧", v: "fanju" }, { n: "国漫", v: "guoman" }, { n: "综艺", v: "zongyi" }] }],
    "week": [
        { key: "type", name: "类型", init: "juji_week", value: [{ n: "剧集", v: "juji_week" }, { n: "番剧", v: "fanju_week" }, { n: "国漫", v: "guoman_week" }, { n: "综艺", v: "zongyi_week" }] },
        { key: "weekday", name: "周几", init: "Monday", value: [{ n: "周一", v: "Monday" }, { n: "周二", v: "Tuesday" }, { n: "周三", v: "Wednesday" }, { n: "周四", v: "Thursday" }, { n: "周五", v: "Friday" }, { n: "周六", v: "Saturday" }, { n: "周日", v: "Sunday" }] }
    ],
    "rank": [{ key: "type", name: "榜单", init: "华语热门", value: [{ n: "华语热门", v: "华语热门" }, { n: "今日推荐", v: "今日推荐" }, { n: "现正热播", v: "现正热播" }, { n: "新剧雷达", v: "新剧雷达" }, { n: "已收官好剧", v: "已收官好剧" }, { n: "人气 Top 10", v: "人气 Top 10" }, { n: "热门国漫", v: "热门国漫" }, { n: "本季新番", v: "本季新番" }] }],
    "area": [{ key: "type", name: "地区", init: "国产剧", value: [{ n: "国产剧", v: "国产剧" }, { n: "韩剧", v: "韩剧" }, { n: "日剧", v: "日剧" }, { n: "番剧", v: "番剧" }, { n: "英美剧", v: "英美剧" }] }]
};

const reversePanTypes = {
    aliyun: "ali", quark: "quark", uc: "uc", pikpak: "pikpak", xunlei: "xunlei",
    '123': "123", tianyi: "189", mobile: "139", '115': "115", baidu: "baidu"
};

const reversePanNames = {
    aliyun: "阿里云盘", quark: "夸克网盘", uc: "UC网盘", pikpak: "PikPak", xunlei: "迅雷网盘",
    '123': "123云盘", tianyi: "天翼网盘", mobile: "移动云盘", '115': "115网盘", baidu: "百度网盘"
};

const panPic = {
    aliyun: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/ali.jpg",
    quark: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/quark.png",
    uc: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/uc.png",
    baidu: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/baidu.jpg"
};

// ===================== 工具函数 =====================
async function fetchJSON(url) {
    try {
        const { data } = await $fetch.get(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        return typeof data === 'string' ? JSON.parse(data) : data;
    } catch (e) {
        $print(`[请求失败] ${url}: ${e}`);
        return null;
    }
}

function getConfigObj() {
    try {
        return typeof $config !== 'undefined' && $config ? argsify($config) : {};
    } catch (e) {
        return {};
    }
}

// ===================== 数据抓取 =====================
async function getDayData(type, day) {
    if (type === 'juji' || type === 'fanju') {
        const data = await fetchJSON(`${DATA_SOURCES.zjrl}/home1.json`);
        if (!data) return [];
        const titleMap = {
            'juji_today': '今天播出的剧集',
            'juji_tomorrow': '明天播出的剧集',
            'fanju_today': '今天播出的番剧',
            'fanju_tomorrow': '明天播出的番剧'
        };
        const item = data.find(i => i.title === titleMap[`${type}_${day}`]);
        return item ? item.content : [];
    }
    const data = await fetchJSON(`${DATA_SOURCES.gist}/${type}_${day}.json`);
    return Array.isArray(data) ? data : [];
}

async function getWeekData(type, weekday) {
    const data = await fetchJSON(`${DATA_SOURCES.gist}/${type}.json`);
    if (!data) return [];
    const targetDay = (!weekday || weekday === 'All') ? 'Monday' : weekday;
    return data[targetDay] || [];
}

async function getRankData(rankType) {
    const areaTypes = ["国产剧", "日剧", "英美剧", "番剧", "韩剧", "港台剧"];
    if (areaTypes.includes(rankType)) {
        const data = await fetchJSON(`${DATA_SOURCES.zjrl}/home0.json`);
        if (!data) return [];
        const category = data.find(item => item.type === "category");
        if (!category) return [];
        const area = category.content.find(item => item.title === rankType);
        return area ? (area.data || area) : [];
    }
    const specialRanks = ["华语热门", "本季新番", "今日推荐"];
    const isSpecial = specialRanks.includes(rankType);
    const url = isSpecial ? `${DATA_SOURCES.zjrl}/home0.json` : `${DATA_SOURCES.zjrl}/home1.json`;
    const data = await fetchJSON(url);
    if (!data) return [];

    if (rankType === "今日推荐") {
        const rec = data.find(item => item.type === "1s");
        return rec ? rec.content : [];
    }
    const item = data.find(i => i.title === rankType);
    return item ? item.content : [];
}

function convertItem(item) {
    if (!item) return null;
    let title = item.title || item.name || item.cn_name || item.original_name || item.t1;
    if (!title) {
        const possibleFields = ['show_name', 'tv_name', 'series_name', 'program_name', 'zh_name'];
        for (const field of possibleFields) {
            if (item[field]) { title = item[field]; break; }
        }
    }
    if (!title) return null;

    const year = item.year || item.release_year || (item.first_air_date ? item.first_air_date.substring(0, 4) : "") || "";
    const episode = item.episode || item.episode_number || item.latest_episode || "";

    let pic = item.poster_path ? `${DATA_SOURCES.tmdbImage}${item.poster_path}` : (item.pic || item.cover || item.image || item.img || item.poster || item.thumb || item.thumbnail || "");

    let remarks = episode;
    if (!remarks && (item.vote_average || item.t3)) remarks = `${item.vote_average || item.t3}分`;
    if (!remarks && item.rating) remarks = `${item.rating}分`;
    if (!remarks) remarks = year || "追剧日历";

    return {
        vod_id: `zjrl_${encodeURIComponent(title)}`,
        vod_name: title,
        vod_pic: pic,
        vod_remarks: remarks,
        ext: { title: title, pic: pic, remarks: remarks }
    };
}

// ===================== XPTV 接口实现 =====================

async function getConfig() {
    return jsonify({
        ver: 1,
        title: "追剧优选",
        site: "https://zjrl-1318856176.cos.accelerate.myqcloud.com",
        tabs: [
            { name: '🔥 热门榜单', ext: { id: 'rank' } },
            { name: '📺 今日播出', ext: { id: 'today' } },
            { name: '📅 明日播出', ext: { id: 'tomorrow' } },
            { name: '📆 播出周历', ext: { id: 'week' } },
            { name: '🌏 地区榜单', ext: { id: 'area' } }
        ]
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const id = ext.id || 'rank';
    const page = ext.page || 1;
    const filters = ext.filters || {};

    let currentFilters = filterConfig[id] || [];

    // 应用默认过滤项
    currentFilters.forEach(f => {
        if (!filters[f.key]) filters[f.key] = f.init;
    });

    let items = [];
    if (id === "today") items = await getDayData(filters.type, 'today');
    else if (id === "tomorrow") items = await getDayData(filters.type, 'tomorrow');
    else if (id === "week") items = await getWeekData(filters.type, filters.weekday);
    else if (id === "rank" || id === "area") items = await getRankData(filters.type);

    const pageSize = 20;
    const start = (page - 1) * pageSize;
    const pageItems = items.slice(start, start + pageSize);
    const cards = pageItems.map(item => convertItem(item)).filter(Boolean);

    return jsonify({
        list: cards,
        filter: currentFilters
    });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = ext.wd;
    const configObj = getConfigObj();
    const pansouUrl = configObj.pansou_url;

    if (!pansouUrl) {
        $utils.toastInfo("请在源配置中设置盘搜接口URL(pansou_url)");
        return jsonify({ list: [] });
    }

    let cards = [];
    try {
        const cloudTypes = ["aliyun", "quark", "uc", "baidu"];
        const { data } = await $fetch.post(`${pansouUrl}/api/search`, {
            kw: wd,
            cloud_types: cloudTypes
        }, { headers: { "Content-Type": "application/json" } });

        const ret = typeof data === 'string' ? JSON.parse(data) : data;
        if (ret.code === 0 && ret.data && ret.data.merged_by_type) {
            for (const type in ret.data.merged_by_type) {
                const items = ret.data.merged_by_type[type];
                if (items && items.length > 0) {
                    cards.push({
                        vod_id: `search_${encodeURIComponent(wd)}_${type}`,
                        vod_name: `${wd} [${reversePanNames[type] || type}]`,
                        vod_pic: panPic[type] || "",
                        vod_remarks: `共 ${items.length} 个资源`,
                        ext: { wd: wd, type: type, items: items }
                    });
                }
            }
        }
    } catch (e) {
        $print("Search Error: " + e);
    }

    return jsonify({ list: cards });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const configObj = getConfigObj();
    const pansouUrl = configObj.pansou_url;
    let list = [];

    // 从搜索结果进入
    if (ext.items) {
        let tracks = [];
        ext.items.forEach((item, index) => {
            tracks.push({
                name: item.note || `资源 ${index + 1}`,
                pan: reversePanTypes[ext.type] || '',
                ext: { url: item.url }
            });
        });
        list.push({ title: '搜索结果', tracks: tracks });
    } 
    // 从日历进入
    else if (ext.title) {
        const wd = ext.title;
        if (!pansouUrl) {
            $utils.toastInfo("源配置缺失pansou_url，无法获取网盘资源");
            return jsonify({ list: [] });
        }

        try {
            const cloudTypes = ["aliyun", "quark", "uc", "baidu", "pikpak", "xunlei", "115"];
            const { data } = await $fetch.post(`${pansouUrl}/api/search`, {
                kw: wd,
                cloud_types: cloudTypes
            }, { headers: { "Content-Type": "application/json" } });

            const ret = typeof data === 'string' ? JSON.parse(data) : data;
            if (ret.code === 0 && ret.data && ret.data.merged_by_type) {
                for (const type in ret.data.merged_by_type) {
                    let tracks = [];
                    const items = ret.data.merged_by_type[type];
                    const panId = reversePanTypes[type] || type;
                    
                    items.slice(0, 5).forEach((item, index) => {  // 限制每个盘显示前5个结果，防止卡顿
                        tracks.push({
                            name: item.note || `线路 ${index + 1}`,
                            pan: panId,
                            ext: { url: item.url }
                        });
                    });
                    
                    if (tracks.length > 0) {
                        list.push({
                            title: reversePanNames[type] || type,
                            tracks: tracks
                        });
                    }
                }
            }
        } catch (e) {
            $print("Get Tracks Error: " + e);
        }
    }

    return jsonify({ list: list });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    // XPTV 会自动接管标准的网盘分享链接进行解析播放
    return jsonify({
        urls: [ext.url]
    });
}
