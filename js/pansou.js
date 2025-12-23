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
	// 缓存优化：预先计算的大写关键词
	const QUALITY_KEYWORDS_UPPER = QUALITY_KEYWORDS.map(kw => kw.toUpperCase())
	const COMPLETED_KEYWORDS_UPPER = COMPLETED_KEYWORDS.map(kw => kw.toUpperCase())
	// 缓存优化：预先构建后端到前端的映射
	const BACKEND_TO_FRONT_MAP = {}
	Object.entries(PAN_TYPES_MAP).forEach(([frontKey, config]) => {
	  BACKEND_TO_FRONT_MAP[config.backend_key] = frontKey
	})
	// 缓存优化：源字符串替换映射
	const SOURCE_REPLACE_MAP = {
	  'plugin:': '插件:',
	  'tg:': '频道:'
	}
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
	// 计算卡片质量的评分（用于缓存）
	function calculateQualityScore(vodNameUpper) {
	  let score = 0
	  for (const kw of QUALITY_KEYWORDS_UPPER) {
	    if (vodNameUpper.includes(kw)) {
	      score += 10
	    }
	  }
	  return score
	}
	// 判断是否为完结状态（用于缓存）
	function isCompletedStatus(vodNameUpper) {
	  return COMPLETED_KEYWORDS_UPPER.some(kw => vodNameUpper.includes(kw))
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
	  // 性能优化：使用filter+map链式调用，减少中间数组
	  const enabledCloudTypes = Object.entries(PAN_TYPES_MAP)
	    .filter(([_, config]) => config.enabled)
	    .map(([_, config]) => config.backend_key)
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
	      // 性能优化：一次性收集所有类型数据
	      const allTypeResults = []
	      for (const [backendKey, typeResults] of Object.entries(mergedData)) {
	        const frontKey = BACKEND_TO_FRONT_MAP[backendKey] || backendKey
	        const pic = PAN_PIC_MAP[backendKey] || ''
	        // 原地排序，避免创建新数组
	        typeResults.sort((a, b) => {
	          const timeA = new Date(a.datetime).getTime() || 0
	          const timeB = new Date(b.datetime).getTime() || 0
	          return timeB - timeA
	        })
	        allTypeResults.push({ frontKey, pic, typeResults })
	      }
	      // 性能保护：限制总卡片数
	      const maxTotalCards = 1000
	      // 性能优化：使用单次循环构建cards，减少循环次数
	      let cards = []
	      let totalCards = 0
	      for (const { frontKey, pic, typeResults } of allTypeResults) {
	        for (const row of typeResults) {
	          // 提前终止，避免处理过多数据
	          if (totalCards >= maxTotalCards) break
	          totalCards++
	          // 性能优化：使用正则一次替换，替代多次replace调用
	          let source = row.source || ''
	          for (const [from, to] of Object.entries(SOURCE_REPLACE_MAP)) {
	            source = source.replace(new RegExp(from, 'gi'), to)
	          }
	          // 性能优化：预计算评分和时间戳，避免重复计算
	          const vodName = row.note || '未命名资源'
	          const vodNameUpper = vodName.toUpperCase()
	          const datetime = new Date(row.datetime).getTime() || 0
	          const qualityScore = calculateQualityScore(vodNameUpper)
	          const isCompleted = isCompletedStatus(vodNameUpper)
	          cards.push({
	            vod_id: row.url,
	            vod_name: vodName,
	            vod_pic: pic,
	            vod_remarks: `${source} | ${frontKey} | ${formatDateTime(row.datetime)}`,
	            datetime: datetime,
	            pan: frontKey,
	            ext: jsonify({ panSouResult: row, searchText }),
	            // 缓存评分和状态，避免排序时重复计算
	            _qualityScore: qualityScore,
	            _isCompleted: isCompleted
	          })
	        }
	        if (totalCards >= maxTotalCards) break
	      }
	      // 性能优化：构建优先级映射，使用Object.fromEntries简化
	      const userPriority = $config?.pan_priority || []
	      const enabledKeys = new Set(Object.keys(PAN_TYPES_MAP))
	      const priorityMap = Object.fromEntries(
	        userPriority
	          .filter(key => enabledKeys.has(key))
	          .map((key, idx) => [key, idx])
	      )
	      // 为未配置优先级的类型分配优先级
	      const fallbackIndex = userPriority.length
	      const currentPriorityCount = Object.keys(priorityMap).length
	      for (const key of Object.keys(PAN_TYPES_MAP)) {
	        if (priorityMap[key] === undefined) {
	          priorityMap[key] = fallbackIndex + currentPriorityCount
	        }
	      }
	      // 性能优化：使用缓存值进行排序，避免重复计算
	      cards.sort((a, b) => {
	        const pa = priorityMap[a.pan] ?? 999
	        const pb = priorityMap[b.pan] ?? 999
	        if (pa !== pb) return pa - pb
	        const sa = a._qualityScore
	        const sb = b._qualityScore
	        if (sa !== sb) return sb - sa
	        const ca = a._isCompleted
	        const cb = b._isCompleted
	        if (ca && !cb) return -1
	        if (!ca && cb) return 1
	        return b.datetime - a.datetime
	      })
	      // 性能优化：清理缓存字段，减少数据传输量
	      cards.forEach(card => {
	        delete card._qualityScore
	        delete card._isCompleted
	      })
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
