	// 自定义配置格式
	// {
	//   "pansou_urls": "https://pansou.xxx.com,https://pansou2.xxx.com",
	//   "pansou_token": "",
	//   "pancheck_url": "http://your-pancheck-server.com/api/v1/links/check", // 新增：网盘链接检测系统地址，留空则不检测
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
	// XPTV 要求所有入参与出参都是字符串，因此 getConfig, getCards, getTracks, getPlayinfo, search 的 ext 参数是字符串，返回值也必须是字符串。
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
	// 优先级关键词
	const QUALITY_KEYWORDS = ['HDR', '杜比', 'DV', 'REMUX', 'HQ', '臻彩', '高码', '高画质', '60FPS', '60帧', '高帧率', '60HZ', '4K', '2160P']
	const COMPLETED_KEYWORDS = ['完结', '全集', '已完成', '全']
	// 公共请求头
	const BASE_HEADERS = {
	  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
	  'Content-Type': 'application/json',
	}
	// 解析 API 地址列表
	const PAN_URLS_RAW = $config?.pansou_urls || ""
	const PAN_URLS = PAN_URLS_RAW.split(/[\n,]/).map(url => url.trim()).filter(url => url !== '')
	const PAN_TOKEN = $config?.pansou_token || ""
	// 解析网盘检测系统地址
	const PANCHECK_URL = $config?.pancheck_url || ""
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
	// 网盘图标映射
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
	// 缓存可用的 API 地址
	let cachedApiUrl = null
	// ================= 核心逻辑 =================
	// 获取可用的 API 地址 (带缓存)
	async function getAvailableAPI() {
	  if (cachedApiUrl) return cachedApiUrl
	  if (PAN_URLS.length === 0) return null
	  const tasks = PAN_URLS.map(async (url) => {
	    try {
	      const start = Date.now()
	      const testUrl = `${url}/api/search`
	      // 移除 timeout 选项以兼容性更好，使用系统默认超时
	      const response = await $fetch.post(testUrl, { kw: "", limit: 1 }, { 
	        headers: { ...BASE_HEADERS, ...(PAN_TOKEN ? {'Authorization': `Bearer ${PAN_TOKEN}`} : {}) }
	      })
	      const latency = Date.now() - start
	      if (response && response.status >= 200 && response.status < 300) {
	        return { url, latency }
	      }
	    } catch (e) {
	      $print(`API检测异常: ${url} - ${e.message}`)
	    }
	    return null
	  })
	  const results = await Promise.all(tasks)
	  const validResults = results.filter(r => r !== null).sort((a, b) => a.latency - b.latency)
	  if (validResults.length > 0) {
	    cachedApiUrl = validResults[0].url
	    $print(`PanSou API selected: ${cachedApiUrl} (${validResults[0].latency}ms)`)
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
	// ================= 网盘链接检测系统集成 (修复版) =================
	/**
	 * 使用 PanCheck API 过滤有效链接
	 * 逻辑修改：如果检测失败或返回结果为空（全部失效），
	 * 为了防止搜索无结果，默认返回原始列表。
	 */
	async function filterValidLinks(cards) {
	  // 如果未配置检测地址或卡片列表为空，直接返回原列表
	  if (!PANCHECK_URL || cards.length === 0) {
	    return cards
	  }
	  $print(`开始网盘有效性检测，数量: ${cards.length}`)
	  // 提取所有待检测的链接
	  const linksToCheck = cards.map(card => card.vod_id)
	  try {
	    // 构造请求参数
	    const requestBody = {
	      links: linksToCheck
	    }
	    // 发送请求
	    // 移除 timeout，防止在某些环境下不支持而导致请求错误
	    const response = await $fetch.post(PANCHECK_URL, requestBody, { 
	      headers: { 'Content-Type': 'application/json' }
	    })
	    // 检查响应是否存在
	    if (!response) {
	      $print("PanCheck 响应为空，检测失败")
	      return cards
	    }
	    // 解析响应
	    let data = response.data
	    if (typeof data === 'string') {
	      try { data = JSON.parse(data) } catch(e) { $print("PanCheck JSON解析失败"); return cards; }
	    }
	    // 验证响应格式并筛选有效链接
	    if (data && Array.isArray(data.valid_links)) {
	      const validSet = new Set(data.valid_links)
	      const validCards = cards.filter(card => validSet.has(card.vod_id))
	      $print(`检测完成，原始: ${cards.length}, 有效: ${validCards.length}`)
	      // 【关键修复】：如果过滤后没有有效链接，但原始列表有数据
	      // 为了防止用户看到空列表，这里返回原始列表（容错处理）
	      // 如果需要严格模式（只显示有效），请去掉此 if 判断
	      if (validCards.length === 0 && cards.length > 0) {
	        $print("警告：所有链接似乎均已失效，为保留搜索结果，返回原始列表。")
	        return cards
	      }
	      return validCards
	    } else {
	      $print(`PanCheck 响应格式异常: ${JSON.stringify(data)}`)
	      return cards
	    }
	  } catch (error) {
	    $print(`PanCheck 请求异常: ${error.message}`)
	    // 发生错误（如网络超时、服务不可用），返回原数据，确保有结果显示
	    return cards
	  }
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
	  const requestBody = {
	    kw: searchText,
	    filter: { include: QUALITY_KEYWORDS, exclude: ["枪版", "预告", "彩蛋"] },
	    cloud_types: enabledCloudTypes,
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
	      for (const backendKey in mergedData) {
	        const panConfig = Object.values(PAN_TYPES_MAP).find(cfg => cfg.backend_key === backendKey)
	        const frontKey = panConfig ? Object.keys(PAN_TYPES_MAP).find(k => PAN_TYPES_MAP[k] === panConfig) : backendKey
	        const pic = PAN_PIC_MAP[backendKey] || ''
	        mergedData[backendKey].forEach(row => {
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
	      // ================== 调用网盘链接检测系统 ==================
	      if (cards.length > 0) {
	        try {
	            cards = await filterValidLinks(cards)
	        } catch (e) {
	            $print(`filterValidLinks 发生未捕获异常: ${e.message}`)
	            // 异常情况下保持 cards 不变
	        }
	      }
	      // ==========================================================
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
