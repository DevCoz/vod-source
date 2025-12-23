	// 自定义配置格式
	// {
	//   "pansou_urls": "https://pansou.xxx.com,https://pansou2.xxx.com",
	//   "pansou_token": "",
	//   "quark": true,
	//   "uc": true,
	//   "pikpak": true,
	//   "xunlei": true,
	//   "a123": true,
	//   "a189": true,
	//   "a139": true,
	//   "a115": true,
	//   "baidu": true,
	//   "ali": true,
	//   "pan_priority": ["ali", "quark", "uc", "pikpak", "xunlei", "a123", "a189", "a139", "a115", "baidu"]
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
	// 网盘类型映射 (前端键 -> {启用状态, 后端键})
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
	// 优化：使用 /api/health 接口检测服务状态，避免使用搜索接口产生无效请求和消耗
	async function getAvailableAPI() {
	  if (cachedApiUrl) return cachedApiUrl
	  if (PAN_URLS.length === 0) return null
	  const tasks = PAN_URLS.map(async (url) => {
	    try {
	      const start = Date.now()
	      // 使用健康检查接口，该接口通常不需要认证且响应极快
	      const testUrl = `${url}/api/health`
	      // 健康检查接口不需要 Authorization（参考 README），添加也无妨
	      const headers = { ...BASE_HEADERS } 
	      const response = await $fetch.get(testUrl, { headers: headers, timeout: 5000 })
	      const latency = Date.now() - start
	      // 检查返回状态是否为 "ok"
	      if (response && response.data && response.data.status === 'ok') {
	        return { url, latency }
	      }
	    } catch (e) {
	      // 忽略错误
	    }
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
	// ================= 接口实现 =================
	async function getConfig() {
	  return jsonify({
	    ver: 1,
	    title: "盘搜CF｜PAN",
	    site: PAN_URLS[0] || "PanSou",
	    tabs: [{ name: '搜索', ext: jsonify({ id: 'search' }) }]
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
	  // 优化：根据 README 文档，请求体仅包含支持的参数
	  const requestBody = {
	    kw: searchText,
	    filter: { include: QUALITY_KEYWORDS, exclude: ["枪版", "预告", "彩蛋"] },
	    cloud_types: enabledCloudTypes
	    // 移除 limit 和 page，因为 README 中 /api/search POST 未列出这些参数，
	    // 结果在 merged_by_type 中返回，由客户端进行切片和分页处理更为准确
	  }
	  const headers = { ...BASE_HEADERS }
	  if (PAN_TOKEN) headers['Authorization'] = `Bearer ${PAN_TOKEN}`
	  try {
	    const response = await $fetch.post(`${apiUrl}/api/search`, requestBody, { headers: headers })
	    let data = response.data
	    if (typeof data === 'string') data = JSON.parse(data)
	    // 兼容处理：检查 code 是否为 0 (常见于此类 API 封装)，直接检查 merged_by_type 也可以
	    if ((data?.code === 0 || !data?.code) && data?.data?.merged_by_type) {
	      let cards = []
	      const mergedData = data.data.merged_by_type
	      for (const backendKey in mergedData) {
	        const panConfig = Object.values(PAN_TYPES_MAP).find(cfg => cfg.backend_key === backendKey)
	        const frontKey = panConfig ? Object.keys(PAN_TYPES_MAP).find(k => PAN_TYPES_MAP[k] === panConfig) : backendKey
	        const pic = PAN_PIC_MAP[backendKey] || ''
	        let rows = mergedData[backendKey]
	        // 按时间倒序排序
	        rows.sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())
	        // 限制每个网盘最多返回 15 个结果 (客户端切片)
	        if (rows.length > 15) {
	          rows = rows.slice(0, 15)
	        }
	        rows.forEach(row => {
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
	      // 客户端分页
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
