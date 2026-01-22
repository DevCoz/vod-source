// ================= 自定义配置格式 =================
// {
//   "pansou_urls": "https://api1.example.com,https://api2.example.com",
//   "pansou_token": "",
//   "quark": true,
//   "uc": true,
//   "ali": true,
//   "pan_priority": ["quark", "ali", "uc"]
// }

const $config = argsify($config_str);

function argsify(str) { try { return str ? JSON.parse(str) : {} } catch (e) { return {} } }
function jsonify(obj) { return JSON.stringify(obj) }

// ================= 常量配置 =================
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
};

const TYPE_MAP = [
    { front: 'quark', back: 'quark' }, { front: 'uc', back: 'uc' }, 
    { front: 'ali', back: 'aliyun' }, { front: 'a189', back: 'tianyi' },
    { front: 'a139', back: 'mobile' }, { front: 'a115', back: '115' },
    { front: 'baidu', back: 'baidu' }, { front: 'pikpak', back: 'pikpak' },
    { front: 'xunlei', back: 'xunlei' }, { front: 'a123', back: '123' }
];

const PAN_URLS = ($config?.pansou_urls || "").split(/[\n,]/).map(u => u.trim()).filter(Boolean);
const ENABLED_TYPES = TYPE_MAP.filter(m => $config?.[m.front] !== false).map(m => m.back);
const B2F = TYPE_MAP.reduce((acc, m) => ({ ...acc, [m.back]: m.front }), {});

// ================= 核心逻辑 =================

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

async function getConfig() {
    return jsonify({
        ver: 1, title: "PanSou 网盘搜索", site: PAN_URLS[0] || "",
        tabs: [{ name: '网盘搜索', ext: jsonify({ id: 'search' }) }]
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const kw = ext.search_text || ext.text || "";
    if (!kw) return jsonify({ list: [] });

    const api = await getAPI();
    if (!api) return jsonify({ list: [] });

    try {
        const res = await $fetch.post(`${api}/api/search`, {
            kw, res: "merge", src: "all", cloud_types: ENABLED_TYPES,
            filter: { 
                include: ["HDR","杜比","DV","REMUX","HQ","臻彩","高码","高画质","60FPS","60帧',"高帧率","60HZ","4K","2160P"],
                exclude: ["预告", "花絮", "枪版", "TS", "广告"]
            }
        }, { 
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': $config?.pansou_token ? `Bearer ${$config.pansou_token}` : '' 
            } 
        });

        const respBody = typeof res.data === 'string' ? argsify(res.data) : res.data;
        const data = (respBody?.merged_by_type || respBody?.data?.merged_by_type) || {};
        const prio = ($config?.pan_priority || []).reduce((acc, k, i) => ({ ...acc, [k]: i }), {});

        let list = [];
        Object.entries(data).forEach(([bKey, items]) => {
            items.forEach(item => list.push({
                vod_id: item.url,
                vod_name: item.note || kw,
                vod_pic: PAN_PIC_MAP[bKey] || "",
                vod_remarks: `${(B2F[bKey] || bKey).toUpperCase()} | ${item.datetime?.split('T')[0] || ''}`,
                ts: item.datetime ? new Date(item.datetime).getTime() : 0,
                fKey: B2F[bKey] || bKey,
                ext: jsonify({ url: item.url, pwd: item.password || "", title: item.note || kw })
            }));
        });

        list.sort((a, b) => (prio[a.fKey] ?? 99) - (prio[b.fKey] ?? 99) || b.ts - a.ts);

        const page = parseInt(ext.page) || 1;
        return jsonify({ 
            list: list.slice((page - 1) * 20, page * 20), 
            page, 
            pagecount: Math.ceil(list.length / 20) || 1 
        });
    } catch (e) { return jsonify({ list: [] }); }
}

async function getTracks(ext) {
    const { url, pwd, title } = argsify(ext);
    return jsonify({
        list: [{ title: '链接详情', tracks: [{ name: `${title}${pwd ? ' [' + pwd + ']' : ''}`, pan: url, ext: jsonify({ url }) }] }]
    });
}

async function getPlayinfo() { return jsonify({ urls: [] }); }
async function search(ext) { return getCards(ext); }
