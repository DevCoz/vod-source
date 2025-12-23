// 自定义配置格式
// {
//   "pansou_urls": https://api1.example.com,https://api2.example.com",
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
	      date = new Date(ts.toString().length === 10 ? ts * 1000 : ts)
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
	      const healthUrl = `${url}/api/health`
	      const headers = { ...BASE_HEADERS, ...(PAN_TOKEN ? {'Authorization': `Bearer ${PAN_TOKEN}`} : {}) }
	      const response = await $fetch.get(healthUrl, { headers, timeout: 3000 })
	      const latency = Date.now() - start
	      let isValid = response.status >= 200 && response.status < 300
	      if (isValid && response.data) {
	        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
	        if (data.status !== 'ok') isValid = false
	      }
	      if (isValid) {
	        return { url, latency }
	      }
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
	async function getConfig() {
	  return jsonify({
	    ver: 1,
	    title: "盘搜CF｜PAN",
	    site: PAN_URLS[0] || "PanSou",
	    tabs: [{ 
	      name: '搜索', 
	      ext: jsonify({ id: 'search' }) 
	    }]
	  })
	}
	async function getCards(ext) {
	  ext = argsify(ext)
	  let searchText = ext.search_text || ext.text || ext.query || ""
	  if (!searchText) {
	    $utils.toastError("请输入关键词开始搜索")
	    return jsonify({ list: [], page: 1, pagecount: 1, total: 0 })
	  }
	  const apiUrl = await getAvailableAPI()
	  if (!apiUrl) {
	    $utils.toastError("所有配置的 API 地址均不可用")
	    return jsonify({ list: [], page: 1, pagecount: 1, total: 0 })
	  }
	  const enabledCloudTypes = Object.keys(PAN_TYPES_MAP)
	    .filter(key => PAN_TYPES_MAP[key].enabled)
	    .map(key => PAN_TYPES_MAP[key].backend_key)
	  if (enabledCloudTypes.length === 0) {
	    $utils.toastError("未启用任何网盘类型")
	    return jsonify({ list: [], page: 1, pagecount: 1, total: 0 })
	  }
	  const requestBody = {
	    kw: searchText,
	    filter: { include: QUALITY_KEYWORDS, exclude: ["枪版", "预告", "彩蛋"] },
	    cloud_types: enabledCloudTypes
	  }
	  const headers = { ...BASE_HEADERS }
	  if (PAN_TOKEN) headers['Authorization'] = `Bearer ${PAN_TOKEN}`
	  try {
	    const response = await $fetch.post(`${apiUrl}/api/search`, requestBody, { headers: headers })
	    let data = response.data
	    if (typeof data === 'string') data = JSON.parse(data)
	    const mergedData = data?.merged_by_type || data?.data?.merged_by_type
	    if (mergedData) {
	      let cards = []
	      // 遍历所有类型的资源
	      for (const backendKey in mergedData) {
	        const panConfig = Object.values(PAN_TYPES_MAP).find(cfg => cfg.backend_key === backendKey)
	        const frontKey = panConfig ? Object.keys(PAN_TYPES_MAP).find(k => PAN_TYPES_MAP[k] === panConfig) : backendKey
	        const pic = PAN_PIC_MAP[backendKey] || ''
	        const typeResults = mergedData[backendKey]
	        // 1. 先按时间降序排序 (确保选到最新的)
	        typeResults.sort((a, b) => {
	          const timeA = new Date(a.datetime).getTime() || 0
	          const timeB = new Date(b.datetime).getTime() || 0
	          return timeB - timeA
	        })
	        // 2. 限制每个网盘类型仅返回 10 个结果
	        const limitedResults = typeResults.slice(0, 10)
	        limitedResults.forEach(row => {
	          const source = (row.source || '').replace(/plugin:/gi, '插件:').replace(/tg:/gi, '频道:')
	          cards.push({
	            vod_id: row.url,
	            vod_name: row.note || '未命名资源',
	            vod_pic: pic,
	            vod_remarks: `${source} | ${frontKey} | ${formatDateTime(row.datetime)}`,
	            datetime: new Date(row.datetime).getTime(),
	            pan: frontKey,
	            ext: jsonify({ panSouResult: row, searchText })
	          })
	        })
	      }
	      // 构建优先级映射
	      const userPriority = $config?.pan_priority || []
	      const priorityMap = {}
	      let fallbackIndex = userPriority.length
	      userPriority.forEach((key, idx) => {
	        if (PAN_TYPES_MAP[key]) priorityMap[key] = idx
	      })
	      Object.keys(PAN_TYPES_MAP).forEach(key => {
	        if (priorityMap[key] === undefined) priorityMap[key] = fallbackIndex++
	      })
	      // 全局排序：按用户配置的网盘优先级、画质、时间排序
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
	      $utils.toastError("API返回无数据或格式异常")
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
	  if (!row) {
	    $utils.toastError("数据丢失，请重新搜索")
	    return jsonify({ list: [] })
	  }
	  const tracks = [{
	    name: row.note + (row.password ? ` [密码: ${row.password}]` : ''),
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
