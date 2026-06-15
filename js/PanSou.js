// ================= 自定义配置格式 =================
// {
//   "pansou_urls": "https://api1.example.com,https://api2.example.com",
//   "pansou_token": "",
//   "quark": true,
//   "pan_priority": ["baidu","quark","ali"]
// }

const $config = argsify($config_str);
function argsify(str) { try { return str ? JSON.parse(str) : {} } catch(e) { return {} } }
function jsonify(obj) { return JSON.stringify(obj) }

// ================= 常量配置 =================
const PAN_PIC_MAP = {
    baidu:  "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/baidu.jpg",
    quark:  "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/quark.png",
    aliyun: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/ali.jpg",
    '115':  "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/115.jpg",
    tianyi: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/189.png"
};

const PAN = { baidu:'baidu', quark:'quark', ali:'aliyun', a189:'tianyi', a115:'115' };
const B2F = {};
Object.keys(PAN).forEach(function(k) { B2F[PAN[k]] = k; });

const PAN_URLS      = ($config.pansou_urls || "").split(/[\n,]/).map(function(u) { return u.trim(); }).filter(Boolean);
const ENABLED_TYPES = Object.keys(PAN).filter(function(k) { return $config[k] !== false; }).map(function(k) { return PAN[k]; });

async function getAPI() {
    if (!PAN_URLS.length) return null;
    if (PAN_URLS.length === 1) return PAN_URLS[0];
    for (const url of PAN_URLS) {
        try { if ((await $fetch.get(url + '/api/health', {timeout: 2000})).status === 200) return url; } catch(e) {}
    }
    return PAN_URLS[0];
}

async function getConfig() {
    return jsonify({ ver: 1, title: "PanSou", site: PAN_URLS[0] || "", tabs: [] });
}

async function getCards(ext) {
    ext = argsify(ext);
    const kw = ext.text || "";
    if (!kw) return jsonify({ list: [] });

    const api = await getAPI();
    if (!api) return jsonify({ list: [] });

    const headers = { 'Content-Type': 'application/json' };
    if ($config.pansou_token) headers['Authorization'] = 'Bearer ' + $config.pansou_token;

    try {
        const res = await $fetch.post(api + '/api/search', jsonify({
            kw: kw, res: "merge", src: "all", cloud_types: ENABLED_TYPES,
            filter: {
                include: ["HDR","杜比","DV","REMUX","HQ","臻彩","高码","高画质","60FPS","60帧","高帧率","60HZ","4K","2160P"],
                exclude: ["预告","花絮","枪版","TS","广告"]
            }
        }), { headers: headers });

        const respBody = typeof res.data === 'string' ? argsify(res.data) : res.data;
        const data     = (respBody && respBody.merged_by_type) ||
                         (respBody && respBody.data && respBody.data.merged_by_type) || {};

        const prio = ($config.pan_priority || []).reduce(function(o, k, i) { o[k] = i; return o; }, {});

        const list = [];
        Object.keys(data).forEach(function(bKey) {
            (data[bKey] || []).forEach(function(item) {
                list.push({
                    vod_id:      item.url,
                    vod_name:    item.note || kw,
                    vod_pic:     PAN_PIC_MAP[bKey] || "",
                    vod_remarks: (B2F[bKey] || bKey).toUpperCase() + ' | ' + (item.datetime ? item.datetime.split('T')[0] : ''),
                    ts:          item.datetime ? new Date(item.datetime).getTime() : 0,
                    fKey:        B2F[bKey] || bKey,
                    ext:         jsonify({ url: item.url, pwd: item.password || "", title: item.note || kw })
                });
            });
        });

        list.sort(function(a, b) {
            const pa = prio[a.fKey] !== undefined ? prio[a.fKey] : 99;
            const pb = prio[b.fKey] !== undefined ? prio[b.fKey] : 99;
            return pa - pb || b.ts - a.ts;
        });

        const page = parseInt(ext.page) || 1;
        return jsonify({ list: list.slice((page-1)*20, page*20), page: page, pagecount: Math.ceil(list.length/20) || 1 });
    } catch(e) { return jsonify({ list: [] }); }
}

async function getTracks(ext) {
    const { url = "", pwd = "", title = "" } = argsify(ext);
    return jsonify({
        list: [{ title: '链接详情', tracks: [{ name: title + (pwd ? ' ['+pwd+']' : ''), pan: url, ext: jsonify({}) }] }]
    });
}

async function getPlayinfo(ext) { return jsonify({ urls: [] }); }
async function search(ext)      { return getCards(ext); }
