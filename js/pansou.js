// 自定义配置格式 {"pansou_urls":"https://pansou.xxx.com,https://pansou2.xxx.com","pansou_token":"","pansou_check_url":"http://192.168.50.50:7024","quark":true,"uc":true,"pikpak":true,"xunlei":true,"a123":true,"a189":true,"a139":true,"a115":true,"baidu":true,"ali":true,"pan_priority":["ali","quark","uc","pikpak","xunlei","a123","a189","a139","a115","baidu"]}
// pansou_urls: 盘搜API地址，支持多个，用逗号(,)或换行分隔，例如 "https://pansou1.com,https://pansou2.com" 或 "https://pansou1.com\nhttps://pansou2.com"。系统会自动轮询检测，优先使用响应最快的节点。
// pansou_token: 如果该实例启用了认证，请填入JWT Token，否则留空
// pansou_check_url: 盘搜链接校验服务地址，例如 "http://192.168.50.50:7024"。如果为空或不填，则不进行链接校验。
// quark,uc,pikpak,xunlei,a123,a189,a139,a115,baidu,ali: 布尔值，true表示启用该网盘，false表示禁用。结果中不会显示被禁用的网盘。
// pan_priority: 数组，定义网盘的优先级顺序，越靠前优先级越高。例如 ["ali","quark","uc"] 表示阿里云盘优先级最高，其次是夸克，然后是UC。未在此数组中的网盘将排在最后，顺序按配置顺序。

// XPTV 要求所有入参与出参都是字符串，因此 getConfig, getCards, getTracks, getPlayinfo, search 的 ext 参数是字符串，返回值也必须是字符串。

const $config = argsify($config_str)
const cheerio = createCheerio()
const CryptoJS = createCryptoJS()

// 解析多个API地址
const PAN_URLS_RAW = $config?.pansou_urls || ""
let PAN_URLS = []
if (PAN_URLS_RAW) {
    PAN_URLS = PAN_URLS_RAW.split(/[\n,]/).map(url => url.trim()).filter(url => url !== '');
}
const PAN_TOKEN = $config?.pansou_token || ""
const PAN_CHECK_URL = $config?.pansou_check_url || "" // 校验服务地址

// 公共请求头
const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  'Content-Type': 'application/json',
}

// 网盘类型映射 (用于发送给后端) - 从配置中读取启用状态
// 前端配置键名 -> 启用状态, 后端标识键名
const PAN_TYPES_MAP = {
  quark: { enabled: $config?.quark !== false, backend_key: "quark" }, // 默认启用
  uc: { enabled: $config?.uc !== false, backend_key: "uc" },
  pikpak: { enabled: $config?.pikpak !== false, backend_key: "pikpak" },
  xunlei: { enabled: $config?.xunlei !== false, backend_key: "xunlei" },
  a123: { enabled: $config?.a123 !== false, backend_key: "123" }, // 前端配置用 'a123'，后端用 '123'
  a189: { enabled: $config?.a189 !== false, backend_key: "tianyi" }, // 前端配置用 'a189'，后端用 'tianyi'
  a139: { enabled: $config?.a139 !== false, backend_key: "mobile" }, // 前端配置用 'a139'，后端用 'mobile'
  a115: { enabled: $config?.a115 !== false, backend_key: "115" }, // 前端配置用 'a115'，后端用 '115'
  baidu: { enabled: $config?.baidu !== false, backend_key: "baidu" },
  ali: { enabled: $config?.ali !== false, backend_key: "aliyun" } // 前端配置用 'ali'，后端用 'aliyun' (根据官方列表)
};

// 网盘图标映射 (后端返回的类型标识 -> 图标URL)
// 根据您提供的官方列表，阿里云盘的后端标识应为 "aliyun"
const PAN_PIC_MAP = {
  aliyun: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/ali.jpg", // 后端用 'aliyun'
  quark: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/quark.png",
  uc: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/uc.png",
  pikpak: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/pikpak.jpg",
  xunlei: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/thunder.png",
  '123': "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/123.png",
  tianyi: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/189.png",
  mobile: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/139.jpg",
  '115': "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/115.jpg",
  'baidu': "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/baidu.jpg",
};

// 高优先级画质关键词（用于排序和后端过滤）
const QUALITY_KEYWORDS = [
  // 优先级从高到低
  'HDR', '杜比', 'DV',
  'REMUX', 'HQ', "臻彩", '高码', '高画质',
  '60FPS', '60帧', '高帧率', '60HZ',
  "4K", "2160P"
];

// 完结关键词（用于排序）
const COMPLETED_KEYWORDS = ["完结", "全集", "已完成", "全"];

// 辅助函数
function jsonify(obj) {
  return JSON.stringify(obj)
}

function argsify(str) {
  if (!str) return {}
  try {
    return JSON.parse(str)
  } catch (e) {
    return {}
  }
}

// 计算画质分数
function getQualityScore(name) {
  const upper = name.toUpperCase();
  let score = 0;
  let cnt = 0;
  for (let i = 0; i < QUALITY_KEYWORDS.length; i++) {
    if (upper.includes(QUALITY_KEYWORDS[i].toUpperCase())) {
      score += QUALITY_KEYWORDS.length - i;
      cnt++;
    }
  }
  return score + cnt;
}

// 计算关键词数量
function getCount(name, keywords) {
  const upper = name.toUpperCase();
  let c = 0;
  for (const kw of keywords) {
    if (upper.includes(kw.toUpperCase())) c++;
  }
  return c;
}

// 格式化日期为 MMDDYY
function formatDateTime(datetimeStr) {
  try {
    const date = new Date(datetimeStr);
    if (!isNaN(date.getTime())) {
      // 格式化为 MMDDYY
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const year = String(date.getFullYear()).slice(-2); // 取年份后两位
      return `${month}${day}${year}`;
    }
  } catch (e) {
    // 如果是时间戳
    try {
      const timestamp = parseInt(datetimeStr);
      if (!isNaN(timestamp)) {
        const date = new Date(timestamp * 1000);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = String(date.getFullYear()).slice(-2);
        return `${month}${day}${year}`;
      }
    } catch (e2) {
      // 保持默认值
    }
  }
  return '未知';
}

// 获取一个可用的API地址
async function getAvailableAPI() {
    if (PAN_URLS.length === 0) {
        return null;
    }

    // 简单轮询或测试延迟
    for (const url of PAN_URLS) {
        try {
            // 尝试访问API的健康检查端点或搜索一个简单的词
            const testUrl = `${url}/api/search`;
            const requestBody = { kw: "test", limit: 1 };
            const headers = { ...BASE_HEADERS };
            if (PAN_TOKEN) {
                headers['Authorization'] = `Bearer ${PAN_TOKEN}`;
            }

            const start = Date.now();
            const response = await $fetch.post(testUrl, requestBody, { headers: headers, timeout: 5000 }); // 5秒超时
            const latency = Date.now() - start;

            if (response.status >= 200 && response.status < 300) {
                console.log(`API ${url} 可用，延迟: ${latency}ms`);
                return url; // 返回第一个可用的地址
            }
        } catch (e) {
            console.log(`API ${url} 测试失败: ${e.message}`);
            continue; // 继续尝试下一个
        }
    }

    return null; // 如果所有地址都失败
}

// getConfig 函数，返回字符串格式的配置
async function getConfig() {
  const appConfig = {
    ver: 1,
    title: "盘搜CF｜PAN",
    site: PAN_URLS[0] || "", // 如果有配置地址，使用第一个作为站点标识
    tabs: [
      {
        name: '搜索',
        ext: jsonify({ // ext 本身也是字符串
          id: 'search',
        }),
      }
      // 已移除推荐资源和最新剧集
    ]
  }
  return jsonify(appConfig) // 返回字符串
}

// getCards 函数，接收字符串 ext，返回字符串结果
async function getCards(ext) {
  ext = argsify(ext) // 将输入的字符串 ext 反序列化为对象
  let cards = []
  let searchText = "热门资源"

  // 从tab配置或搜索参数获取关键词
  if (ext.search_text) {
    searchText = ext.search_text
  } else if (ext.text) {
    searchText = ext.text
  } else if (ext.query) {
    searchText = ext.query
  }

  // 如果搜索关键词为空或默认值，提示用户输入
  if (!searchText || searchText === "热门资源") {
      $utils.toastError("请输入关键词开始搜索")
      return jsonify({ list: [], page: 1, pagecount: 1, total: 0 }) // 返回标准空结果字符串
  }

  // 获取一个可用的API地址
  const apiUrl = await getAvailableAPI();
  if (!apiUrl) {
      $utils.toastError("所有配置的API地址都不可用");
      return jsonify({ list: [], page: 1, pagecount: 1, total: 0 }); // 返回标准空结果字符串
  }

  // 构造过滤参数
  const filterParam = {
    include: QUALITY_KEYWORDS,           // 包含这些关键词的资源
    exclude: ["枪版", "预告", "彩蛋"],   // 排除这些关键词的资源
  };

  const searchUrl = `${apiUrl}/api/search`
  const requestBody = {
    kw: searchText,
    filter: filterParam,                 // 将过滤交给后端
  }

  // 获取启用的网盘类型
  const enabledCloudTypes = Object.keys(PAN_TYPES_MAP).filter(key => PAN_TYPES_MAP[key].enabled).map(key => PAN_TYPES_MAP[key].backend_key);
  if (enabledCloudTypes.length > 0) {
      requestBody.cloud_types = enabledCloudTypes;
  } else {
      // 如果没有启用任何网盘，返回空结果
      $utils.toastError("没有启用任何网盘类型，请检查配置");
      return jsonify({ list: [], page: 1, pagecount: 1, total: 0 });
  }

  const headers = { ...BASE_HEADERS }
  if (PAN_TOKEN) {
    headers['Authorization'] = `Bearer ${PAN_TOKEN}`
  }

  try {
    const response = await $fetch.post(searchUrl, requestBody, { headers: headers })

    if (response.status >= 200 && response.status < 300) {
      let data = response.data
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data)
        } catch (e) {
          $utils.toastError("API返回非JSON格式数据")
          return jsonify({ list: [], page: 1, pagecount: 1, total: 0 }) // 返回标准空结果字符串
        }
      }

      if (data && data.code === 0 && data.data && data.data.merged_by_type) {
        // 处理按类型分组的数据结构
        let rawItems = []; // 存储原始数据项，用于后续校验
        for (const key in data.data.merged_by_type) {
          // 找到对应的前端配置键名 (例如 'ali', 'quark' 等)，用于排序和显示
          // 这里需要反向查找，根据后端返回的 key (如 'aliyun') 找到前端配置的键 (如 'ali')
          const panKey = Object.keys(PAN_TYPES_MAP).find(k => PAN_TYPES_MAP[k].backend_key === key);
          const pic = PAN_PIC_MAP[key] || 'https://s.tutu.pm/img/default.webp  '; // 使用后端返回的类型标识查找图标

          for (const row of data.data.merged_by_type[key] || []) {
            const source = row.source ? row.source.replace(/plugin:/gi, '插件:').replace(/tg:/gi, '频道:') : "";
            rawItems.push({
              row: row,
              panKey: panKey || key, // 网盘类型（用于排序）
              pic: pic,
              source: source
            });
          }
        }

        // --- 链接校验逻辑 ---
        let validLinksSet = new Set(); // 存储有效的链接URL
        const uniqueLinks = [...new Set(rawItems.map(item => item.row.url))]; // 获取唯一链接列表

        if (PAN_CHECK_URL && uniqueLinks.length > 0) { // 如果配置了校验地址且有链接需要校验
            try {
                const checkUrl = `${PAN_CHECK_URL}/api/v1/links/check`;
                const checkHeaders = { ...BASE_HEADERS }; // 校验API可能也需要认证，可根据需要添加
                if (PAN_TOKEN) {
                    checkHeaders['Authorization'] = `Bearer ${PAN_TOKEN}`;
                }
                const checkRequestBody = {
                    links: uniqueLinks,
                    selected_platforms: [
                        "quark", "uc", "tianyi", "pan123", "pan115", "xunlei", "cmcc", "baidu"
                    ],
                };

                console.log("开始校验链接...");
                const checkResponse = await $fetch.post(checkUrl, checkRequestBody, { headers: checkHeaders, timeout: 30000 }); // 30秒超时

                if (checkResponse.status >= 200 && checkResponse.status < 300) {
                    const checkData = checkResponse.data;
                    const VALID_STATUS = ["valid_links"];
                    for (const status of VALID_STATUS) {
                        (checkData[status] || []).forEach(link => validLinksSet.add(link));
                    }
                    console.log(`链接校验完成，有效链接数: ${validLinksSet.size}`);
                } else {
                    console.error("链接校验API请求失败:", checkResponse.status, checkResponse.data);
                    // 如果校验失败，将所有链接视为有效
                    uniqueLinks.forEach(l => validLinksSet.add(l));
                }
            } catch (e) {
                console.error("链接校验过程出错:", e.message);
                // 如果校验过程出错，将所有链接视为有效
                uniqueLinks.forEach(l => validLinksSet.add(l));
            }
        } else {
            // 如果没有配置校验地址，将所有链接视为有效
            uniqueLinks.forEach(l => validLinksSet.add(l));
        }

        // 根据校验结果过滤 rawItems
        const filteredItems = rawItems.filter(item => validLinksSet.has(item.row.url));

        // --- 组装卡片 ---
        for (const item of filteredItems) {
            const row = item.row;
            const pic = item.pic;
            const source = item.source;

            cards.push({
              vod_id: row.url, // 使用 URL 作为唯一 ID
              vod_name: row.note || `资源`,
              vod_pic: pic,
              vod_remarks: `${source || ""} | ${item.panKey || ""} | ${formatDateTime(row.datetime)}`,
              datetime: new Date(row.datetime).getTime(), // 用于排序的时间戳
              pan: item.panKey, // 网盘类型（用于排序）
              ext: jsonify({
                panSouResult: row, // 保存原始数据
                searchText: searchText
              }),
            });
        }

        // --- 排序逻辑 ---
        // 获取用户自定义的网盘优先级顺序
        const userPriority = $config?.pan_priority || [];
        // 获取所有启用的网盘键名
        const allEnabledDriveKeys = Object.keys(PAN_TYPES_MAP).filter(key => PAN_TYPES_MAP[key].enabled);

        // 创建排序映射
        const orderMap = {};
        // 先处理用户自定义优先级列表中的网盘
        userPriority.forEach((key, index) => {
            if (PAN_TYPES_MAP[key] && PAN_TYPES_MAP[key].enabled) { // 确保键存在且已启用
                orderMap[key] = index;
            }
        });

        // 为不在用户自定义列表中的启用网盘分配顺序（放在后面）
        let fallbackIndex = userPriority.length;
        allEnabledDriveKeys.forEach(key => {
            if (orderMap[key] === undefined) { // 如果该键不在用户自定义列表中
                orderMap[key] = fallbackIndex++;
            }
        });

        cards.sort((a, b) => {
          // 1. 云盘顺序 (使用前端配置的键名和用户定义的优先级)
          const oa = orderMap[a.pan] ?? 999; // 如果找不到，给一个很大的序号，排到最后
          const ob = orderMap[b.pan] ?? 999;
          if (oa !== ob) return oa - ob;
          // 2. 画质分数
          const qa = getQualityScore(a.vod_name);
          const qb = getQualityScore(b.vod_name);
          if (qa !== qb) return qb - qa;
          // 3. 完结关键词数量
          const ca = getCount(a.vod_name, COMPLETED_KEYWORDS);
          const cb = getCount(b.vod_name, COMPLETED_KEYWORDS);
          if (ca !== cb) return cb - ca;
          // 4. 画质关键词数量（次要）
          const qa2 = getCount(a.vod_name, QUALITY_KEYWORDS);
          const qb2 = getCount(b.vod_name, QUALITY_KEYWORDS);
          if (qa2 !== qb2) return qb2 - qa2;
          // 5. 时间倒序（最新在前面）
          if (b.datetime !== a.datetime) return b.datetime - a.datetime;
          return 0; // 稳定排序
        });

      } else {
         $utils.toastError("API返回格式异常或无数据")
         console.error("API Response:", data);
         return jsonify({ list: [], page: 1, pagecount: 1, total: 0 }) // 返回标准空结果字符串
      }
    } else {
      let errorMsg = `API请求失败，状态码: ${response.status}`
      if (response.data) {
        try {
          const errorData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
          if (errorData.error) errorMsg += `, 错误: ${errorData.error}`
          else if (errorData.message) errorMsg += `, 消息: ${errorData.message}`
        } catch (e) {
          errorMsg += `, 响应: ${JSON.stringify(response.data)}`
        }
      }
      $utils.toastError(errorMsg)
      return jsonify({ list: [], page: 1, pagecount: 1, total: 0 }) // 返回标准空结果字符串
    }
  } catch (error) {
    $utils.toastError(`API请求失败: ${error.message || error}`)
    return jsonify({ list: [], page: 1, pagecount: 1, total: 0 }) // 返回标准空结果字符串
  }

  return jsonify({ // 返回字符串
    list: cards,
    page: ext.page || 1,
    pagecount: Math.ceil(cards.length / 20) || 1,
    total: cards.length
  })
}

// getTracks 函数，接收字符串 ext，返回字符串结果
async function getTracks(ext) {
  ext = argsify(ext) // 将输入的字符串 ext 反序列化为对象
  let tracks = []

  const panSouResult = ext.panSouResult
  if (!panSouResult) {
    $utils.toastError("获取网盘链接失败，数据格式错误")
    return jsonify({ list: [] }) // 返回字符串
  }

  // 盘搜后端通常会返回单个链接，而不是数组，我们构造一个模拟结构
  const linkUrl = panSouResult.url || '';
  const linkPassword = panSouResult.password || '';
  const note = panSouResult.note || `链接`;

  // 生成标题
  let title = note;
  if (linkPassword) {
    title += ` (密码: ${linkPassword})`
  }

  tracks.push({
    name: title,
    pan: linkUrl,
    pwd: linkPassword,
    ext: jsonify({
      url: linkUrl,
      password: linkPassword
    })
  })

  return jsonify({ // 返回字符串
    list: [
      {
        title: '网盘链接',
        tracks: tracks
      }
    ]
  })
}

// getPlayinfo 函数，接收字符串 ext，返回字符串结果
async function getPlayinfo(ext) {
  ext = argsify(ext) // 将输入的字符串 ext 反序列化为对象
  return jsonify({ // 返回字符串
    urls: [],
    headers: [BASE_HEADERS] // Headers 通常以数组形式返回，包含对象
  })
}

// search 函数，接收字符串 ext，返回字符串结果 (功能上与 getCards 相同)
async function search(ext) {
  return await getCards(ext) // getCards 已经返回字符串，直接返回
}
