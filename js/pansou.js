// 自定义配置格式 {"pansou_urls":"https://pansou.xxx.com,https://pansou2.xxx.com","pansou_token":"","quark":true,"uc":true,"pikpak":true,"xunlei":true,"a123":true,"a189":true,"a139":true,"a115":true,"baidu":true,"ali":true,"pan_priority":["ali","quark","uc","pikpak","xunlei","a123","a189","a139","a115","baidu"]}
// pansou_urls: 盘搜API地址，支持多个，用逗号(,)或换行分隔，例如 "https://pansou1.com,https://pansou2.com" 或 "https://pansou1.com\nhttps://pansou2.com"。系统会自动轮询检测，优先使用响应最快的节点。
// pansou_token: 如果该实例启用了认证，请填入JWT Token，否则留空
// quark,uc,pikpak,xunlei,a123,a189,a139,a115,baidu,ali: 布尔值，true表示启用该网盘，false表示禁用。结果中不会显示被禁用的网盘。
// pan_priority: 数组，定义网盘的优先级顺序，越靠前优先级越高。例如 ["ali","quark","uc"] 表示阿里云盘优先级最高，其次是夸克，然后是UC。未在此数组中的网盘将排在最后，顺序按配置顺序。
// custom_categories: 自定义分类列表（核心功能）。
//   每个分类对象包含：
//   - name: 分类名称（显示在Tab上）
//   - kw: 默认搜索关键词（当用户未输入时使用）
//   - filter: PanSou API 过滤对象 {include: [], exclude: []}
//   - cloud_types: 指定该分类使用的网盘类型后端键 (如 ["aliyun", "quark"])，不填则使用全局配置
//   - source_match: (可选) 本地过滤来源，如 "tg:" 仅显示TG来源
const $config = argsify($config_str)
// ================= 工具函数 =================
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
// 格式化日期 MMDDYY
function formatDateTime(datetimeStr) {
  try {
    let date
    if (/^\d+$/.test(datetimeStr)) {
      const ts = parseInt(datetimeStr)
      date = new Date(ts.length === 10 ? ts * 1000 : ts)
    } else {
      date = new Date(datetimeStr)
    }
    if (!isNaN(date.getTime())) {
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      const y = String(date.getFullYear()).slice(-2)
      return `${m}${d}${y}`
    }
  } catch (e) {}
  return '未知'
}
// ================= 常量与配置 =================
const QUALITY_KEYWORDS = ['HDR', '杜比', 'DV', 'REMUX', 'HQ', '臻彩', '高码', '高画质', '60FPS', '60帧', '高帧率', '60HZ', '4K', '2160P']
const COMPLETED_KEYWORDS = ['完结', '全集', '已完成', '全']
const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  'Content-Type': 'application/json',
}
// 解析 API 列表
const PAN_URLS_RAW = $config?.pansou_urls || ""
const PAN_URLS = PAN_URLS_RAW.split(/[\n,]/).map(url => url.trim()).filter(url => url !== '')
const PAN_TOKEN = $config?.pansou_token || ""
// 解析自定义分类配置
const CUSTOM_CATEGORIES = $config?.custom_categories || []
// 网盘映射表
const PAN_TYPES_MAP = {
  quark: { enabled: $config?.quark !== false, backend_key: "quark" },
  uc: { enabled: $config?.uc !== false, backend_key: "uc" },
  pikpak: { enabled: $config?.pikpak !== false, backend_key: "pikpak" },
  xunlei: { enabled: $config?.xunlei !== false, backend_key: "xunlei" },
  a123: { enabled: $config?.a123 !== false, backend_key: "123" },
  a189: { enabled: $config?.a189 !== false, backend_key: "tianyi" },
  a139: { enabled: $config?.a139 !== false, backend_key: "mobile" },
  a115: { enabled: $config?.a115 !== false, backend_key: "115" },
  baidu: { enabled: $config?.baidu !== false, backend_key: "baidu" },
  ali: { enabled: $config?.ali !== false, backend_key: "aliyun" }
}
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
let cachedApiUrl = null
// ================= 核心逻辑 =================
async function getAvailableAPI() {
  if (cachedApiUrl) return cachedApiUrl
  if (PAN_URLS.length === 0) return null
  const tasks = PAN_URLS.map(async (url) => {
    try {
      const start = Date.now()
      const testUrl = `${url}/api/search`
      const response = await $fetch.post(testUrl, { kw: "", limit: 1 }, { 
        headers: { ...BASE_HEADERS, ...(PAN_TOKEN ? {'Authorization': `Bearer ${PAN_TOKEN}`} : {}) },
        timeout: 3000 
      })
      const latency = Date.now() - start
      if (response.status >= 200 && response.status < 300) return { url, latency }
    } catch (e) {}
    return null
  })
  const results = await Promise.all(tasks)
  const validResults = results.filter(r => r !== null).sort((a, b) => a.latency - b.latency)
  if (validResults.length > 0) {
    cachedApiUrl = validResults[0].url
    console.log(`PanSou API selected: ${cachedApiUrl} (${validResults[0].latency}ms)`)
    return cachedApiUrl
  }
  return null
}
function getCardScore(name) {
  let score = 0
  const upper = name.toUpperCase()
  QUALITY_KEYWORDS.forEach(kw => {
    if (upper.includes(kw.toUpperCase())) score += 10
  })
  return score
}
function sortCardsFunc(a, b, priorityMap) {
  const pa = priorityMap[a.pan] ?? 999
  const pb = priorityMap[b.pan] ?? 999
  if (pa !== pb) return pa - pb
  const sa = getCardScore(a.vod_name)
  const sb = getCardScore(b.vod_name)
  if (sa !== sb) return sb - sa
  const ca = COMPLETED_KEYWORDS.some(k => a.vod_name.toUpperCase().includes(k))
  const cb = COMPLETED_KEYWORDS.some(k => b.vod_name.toUpperCase().includes(k))
  if (ca && !cb) return -1
  if (!ca && cb) return 1
  return b.datetime - a.datetime
}
// 获取启用的网盘列表（支持分类覆盖）
function getEnabledCloudTypes(categoryConfig) {
  if (categoryConfig && categoryConfig.cloud_types && categoryConfig.cloud_types.length > 0) {
    // 如果分类指定了网盘，则直接使用（并校验是否在映射表中存在）
    return categoryConfig.cloud_types.filter(k => Object.values(PAN_TYPES_MAP).some(cfg => cfg.backend_key === k))
  }
  // 否则使用全局配置
  return Object.keys(PAN_TYPES_MAP)
    .filter(key => PAN_TYPES_MAP[key].enabled)
    .map(key => PAN_TYPES_MAP[key].backend_key)
}
// 构建过滤器（支持分类覆盖）
function buildFilter(categoryConfig) {
  const baseFilter = { include: QUALITY_KEYWORDS, exclude: ["枪版", "预告", "彩蛋"] }
  if (!categoryConfig || !categoryConfig.filter) return baseFilter
  // 深度合并配置
  const catFilter = categoryConfig.filter
  const finalFilter = { ...baseFilter }
  if (catFilter.include && Array.isArray(catFilter.include)) {
    finalFilter.include = catFilter.include
  }
  if (catFilter.exclude && Array.isArray(catFilter.exclude)) {
    finalFilter.exclude = catFilter.exclude
  }
  return finalFilter
}
// ================= 接口实现 =================
async function getConfig() {
  const tabs = []
  // 1. 默认搜索标签
  tabs.push({
    name: '搜索',
    ext: jsonify({ id: 'default_search' })
  })
  // 2. 自定义分类标签
  if (CUSTOM_CATEGORIES && CUSTOM_CATEGORIES.length > 0) {
    CUSTOM_CATEGORIES.forEach((cat, index) => {
      tabs.push({
        name: cat.name || `分类${index + 1}`,
        ext: jsonify({ 
          id: 'custom_category',
          category_index: index
        })
      })
    })
  }
  return jsonify({
    ver: 1,
    title: "盘搜CF｜PAN",
    site: PAN_URLS[0] || "PanSou",
    tabs: tabs
  })
}
async function getCards(ext) {
  ext = argsify(ext)
  // 获取当前分类配置
  let categoryConfig = null
  if (ext.id === 'custom_category' && typeof ext.category_index !== 'undefined') {
    categoryConfig = CUSTOM_CATEGORIES[ext.category_index]
  }
  // 确定搜索关键词：优先级：用户输入 > 分类默认关键词
  let searchText = ext.search_text || ext.text || ext.query || ""
  let defaultKw = (categoryConfig && categoryConfig.kw) ? categoryConfig.kw : ""
  // 如果用户没输入，且分类也没默认词，则提示错误（除非是在默认分类且想留空，但API通常需要kw）
  if (!searchText && !defaultKw) {
    // 如果是自定义分类但没设置默认词，提示用户
    if (ext.id === 'custom_category') {
       $utils.toastError(`"${categoryConfig.name}"分类未配置默认关键词，请输入搜索词`)
       return jsonify({ list: [], page: 1, pagecount: 1, total: 0 })
    }
    $utils.toastError("请输入关键词开始搜索")
    return jsonify({ list: [], page: 1, pagecount: 1, total: 0 })
  }
  // 最终发送的关键词
  const finalKw = searchText || defaultKw
  // 获取 API
  const apiUrl = await getAvailableAPI()
  if (!apiUrl) {
    $utils.toastError("API 不可用")
    return jsonify({ list: [], page: 1, pagecount: 1, total: 0 })
  }
  // 构建请求参数
  const cloudTypes = getEnabledCloudTypes(categoryConfig)
  const filter = buildFilter(categoryConfig)
  if (cloudTypes.length === 0) {
    $utils.toastError("当前分类未启用任何网盘")
    return jsonify({ list: [], page: 1, pagecount: 1, total: 0 })
  }
  const requestBody = {
    kw: finalKw,
    filter: filter,
    cloud_types: cloudTypes,
    limit: 100,
    page: 1
  }
  const headers = { ...BASE_HEADERS }
  if (PAN_TOKEN) headers['Authorization'] = `Bearer ${PAN_TOKEN}`
  try {
    const response = await $fetch.post(`${apiUrl}/api/search`, requestBody, { headers: headers })
    let data = response.data
    if (typeof data === 'string') data = JSON.parse(data)
    if (data?.code === 0 && data?.data?.merged_by_type) {
      let cards = []
      const mergedData = data.data.merged_by_type
      // 遍历数据
      for (const backendKey in mergedData) {
        const panConfig = Object.values(PAN_TYPES_MAP).find(cfg => cfg.backend_key === backendKey)
        const frontKey = panConfig ? Object.keys(PAN_TYPES_MAP).find(k => PAN_TYPES_MAP[k] === panConfig) : backendKey
        const pic = PAN_PIC_MAP[backendKey] || ''
        mergedData[backendKey].forEach(row => {
          // --- 本地来源过滤 ---
          if (categoryConfig && categoryConfig.source_match) {
            const source = (row.source || "")
            // 如果配置了 source_match 但不匹配，则跳过该条数据
            if (!source.includes(categoryConfig.source_match)) {
              return
            }
          }
          const sourceText = (row.source || '').replace(/plugin:/gi, '插件:').replace(/tg:/gi, '频道:')
          cards.push({
            vod_id: row.url,
            vod_name: row.note || '未命名资源',
            vod_pic: pic,
            vod_remarks: `${sourceText} | ${frontKey} | ${formatDateTime(row.datetime)}`,
            datetime: new Date(row.datetime).getTime(),
            pan: frontKey,
            ext: jsonify({ panSouResult: row, searchText: finalKw })
          })
        })
      }
      // 排序逻辑
      const userPriority = $config?.pan_priority || []
      const priorityMap = {}
      let fallbackIndex = userPriority.length
      userPriority.forEach((key, idx) => {
        if (PAN_TYPES_MAP[key]) priorityMap[key] = idx
      })
      Object.keys(PAN_TYPES_MAP).forEach(key => {
        if (priorityMap[key] === undefined) priorityMap[key] = fallbackIndex++
      })
      cards.sort((a, b) => sortCardsFunc(a, b, priorityMap))
      // 内存分页
      const pageSize = 20
      const page = parseInt(ext.page) || 1
      const total = cards.length
      const pagecount = Math.ceil(total / pageSize) || 1
      const start = (page - 1) * pageSize
      const list = cards.slice(start, start + pageSize)
      return jsonify({ list, page, pagecount, total })
    } else {
      return jsonify({ list: [], page: 1, pagecount: 1, total: 0 })
    }
  } catch (error) {
    $utils.toastError(`请求失败: ${error.message}`)
    return jsonify({ list: [], page: 1, pagecount: 1, total: 0 })
  }
}
async function getTracks(ext) {
  ext = argsify(ext)
  const row = ext.panSouResult
  if (!row) return jsonify({ list: [] })
  const tracks = [{
    name: row.note + (row.password ? ` (密码: ${row.password})` : ''),
    pan: row.url,
    pwd: row.password || ''
  }]
  return jsonify({ list: [{ title: '网盘链接', tracks }] })
}
async function getPlayinfo(ext) {
  return jsonify({ urls: [], headers: [] })
}
async function search(ext) {
  // 搜索功能默认使用全局配置
  return await getCards(ext)
}
