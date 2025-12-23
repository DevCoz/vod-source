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
	const PAN_URLS_RAW = $config?.pansou_urls || ""
	const PAN_URLS = PAN_URLS_RAW.split(/[\n,]/).map(url => url.trim()).filter(url => url !== '')
	const PAN_TOKEN = $config?.pansou_token || ""
	const CUSTOM_CATEGORIES = $config?.custom_categories || []
	// 调试日志：检查配置是否加载
	if (CUSTOM_CATEGORIES.length > 0) {
	    console.log(`[PanSou Config] 已加载 ${CUSTOM_CATEGORIES.length} 个自定义分类`)
	} else {
	    console.log(`[PanSou Config] 警告：未检测到自定义分类，请检查JSON配置格式`)
	}
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
	    return cachedApiUrl
	  }
	  return null
	}
	function getEnabledCloudTypes(categoryConfig) {
	  let types = []
	  if (categoryConfig && categoryConfig.cloud_types && categoryConfig.cloud_types.length > 0) {
	    types = categoryConfig.cloud_types.map(k => {
	      if (PAN_TYPES_MAP[k] && PAN_TYPES_MAP[k].enabled) return PAN_TYPES_MAP[k].backend_key
	      const isBackendKey = Object.values(PAN_TYPES_MAP).some(cfg => cfg.backend_key === k && cfg.enabled)
	      if (isBackendKey) return k
	      return null
	    }).filter(k => k !== null)
	  } else {
	    types = Object.keys(PAN_TYPES_MAP)
	      .filter(key => PAN_TYPES_MAP[key].enabled)
	      .map(key => PAN_TYPES_MAP[key].backend_key)
	  }
	  return types
	}
	function buildFilter(categoryConfig) {
	  const baseFilter = { include: QUALITY_KEYWORDS, exclude: ["枪版", "预告", "彩蛋"] }
	  if (!categoryConfig || !categoryConfig.filter) return baseFilter
	  const catFilter = categoryConfig.filter
	  const finalFilter = { ...baseFilter }
	  if (catFilter.include && Array.isArray(catFilter.include)) finalFilter.include = catFilter.include
	  if (catFilter.exclude && Array.isArray(catFilter.exclude)) finalFilter.exclude = catFilter.exclude
	  return finalFilter
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
	// ================= 接口实现 =================
	async function getConfig() {
	  const tabs = []
	  tabs.push({ name: '搜索', ext: jsonify({ id: 'default_search' }) })
	  if (CUSTOM_CATEGORIES && CUSTOM_CATEGORIES.length > 0) {
	    CUSTOM_CATEGORIES.forEach((cat, index) => {
	      tabs.push({
	        name: cat.name || `分类${index + 1}`,
	        // 确保同时传递 id 和 index，双重保险
	        ext: jsonify({ id: 'custom_category', category_index: index, cat_name: cat.name })
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
	  // --- 增强的分类加载逻辑 (容错) ---
	  let categoryConfig = null
	  // 1. 正常情况：ID匹配
	  if (ext.id === 'custom_category' && typeof ext.category_index !== 'undefined') {
	    categoryConfig = CUSTOM_CATEGORIES[ext.category_index]
	    console.log(`[PanSou] 加载分类: ${categoryConfig?.name}`)
	  } 
	  // 2. 容错情况：ID丢失但有索引 (某些前端环境会丢失ID)
	  else if (typeof ext.category_index !== 'undefined' && CUSTOM_CATEGORIES && CUSTOM_CATEGORIES[ext.category_index]) {
	    categoryConfig = CUSTOM_CATEGORIES[ext.category_index]
	    console.log(`[PanSou] 容错加载: ID丢失，通过索引 ${ext.category_index} 加载分类 ${categoryConfig.name}`)
	  }
	  let searchText = ext.search_text || ext.text || ext.query || ""
	  let defaultKw = (categoryConfig && categoryConfig.kw) ? categoryConfig.kw : ""
	  // 决定最终搜索词
	  // 如果有分类配置，即使没输入也使用默认词
	  // 如果是默认搜索且没输入，则报错
	  if (!searchText) {
	    if (categoryConfig && defaultKw) {
	      // 使用分类默认词
	      console.log(`[PanSou] 使用分类默认词: ${defaultKw}`)
	    } else {
	      // 没有分类配置，且没有输入
	      $utils.toastError("请输入关键词开始搜索")
	      return jsonify({ list: [], page: 1, pagecount: 1, total: 0 })
	    }
	  }
	  const finalKw = searchText || defaultKw || ""
	  const apiUrl = await getAvailableAPI()
	  if (!apiUrl) {
	    $utils.toastError("API 不可用")
	    return jsonify({ list: [], page: 1, pagecount: 1, total: 0 })
	  }
	  const cloudTypes = getEnabledCloudTypes(categoryConfig)
	  if (cloudTypes.length === 0) {
	    $utils.toastError("当前分类配置的网盘未启用或Key错误")
	    return jsonify({ list: [], page: 1, pagecount: 1, total: 0 })
	  }
	  const filter = buildFilter(categoryConfig)
	  const requestBody = {
	    kw: finalKw,
	    filter: filter,
	    cloud_types: cloudTypes,
	    limit: 100,
	    page: 1
	  }
	  console.log(`[PanSou] 请求参数: ${JSON.stringify(requestBody)}`)
	  const headers = { ...BASE_HEADERS }
	  if (PAN_TOKEN) headers['Authorization'] = `Bearer ${PAN_TOKEN}`
	  try {
	    const response = await $fetch.post(`${apiUrl}/api/search`, requestBody, { headers: headers })
	    let data = response.data
	    if (typeof data === 'string') data = JSON.parse(data)
	    if (data?.code === 0 && data?.data && data.data.merged_by_type) {
	      let cards = []
	      const mergedData = data.data.merged_by_type
	      let hasRawData = false
	      for (const backendKey in mergedData) {
	        if (mergedData[backendKey].length > 0) hasRawData = true
	        const panConfig = Object.values(PAN_TYPES_MAP).find(cfg => cfg.backend_key === backendKey)
	        const frontKey = panConfig ? Object.keys(PAN_TYPES_MAP).find(k => PAN_TYPES_MAP[k] === panConfig) : backendKey
	        const pic = PAN_PIC_MAP[backendKey] || ''
	        mergedData[backendKey].forEach(row => {
	          if (categoryConfig && categoryConfig.source_match) {
	            const source = (row.source || "")
	            if (!source.toUpperCase().includes(categoryConfig.source_match.toUpperCase())) {
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
	      if (hasRawData && cards.length === 0) {
	        $utils.toastError("结果已被本地过滤规则(如来源匹配)全部过滤")
	      } else if (!hasRawData) {
	         // 静默返回空，不弹窗
	      }
	      const userPriority = $config?.pan_priority || []
	      const priorityMap = {}
	      let fallbackIndex = userPriority.length
	      userPriority.forEach((key, idx) => { if (PAN_TYPES_MAP[key]) priorityMap[key] = idx })
	      Object.keys(PAN_TYPES_MAP).forEach(key => { if (priorityMap[key] === undefined) priorityMap[key] = fallbackIndex++ })
	      cards.sort((a, b) => sortCardsFunc(a, b, priorityMap))
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
	  return await getCards(ext)
	}
