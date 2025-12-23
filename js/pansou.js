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
	    // 处理时间戳 (秒或毫秒)
	    if (/^\d+$/.test(datetimeStr)) {
	      const ts = parseInt(datetimeStr)
	      date = new Date(ts.toString().length === 10 ? ts * 1000 : ts)
	    } else {
	      // 处理日期字符串
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
	// 网盘类型映射 (前端键 -> {启用状态, 后端键})
	// 根据 README.md 支持的类型进行映射
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
	// 网盘图标映射 (键对应 backend_key)
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
	// 获取可用的 API 地址 (优化：使用 /api/health 接口检测)
	async function getAvailableAPI() {
	  if (cachedApiUrl) return cachedApiUrl
	  if (PAN_URLS.length === 0) return null
	  // 并发检测所有 URL 的健康状态，选择最快的一个
	  const tasks = PAN_URLS.map(async (url) => {
	    try {
	      const start = Date.now()
	      // 使用 README.md 中定义的 /api/health 接口进行检测，更轻量且准确
	      const healthUrl = `${url}/api/health`
	      const headers = { ...BASE_HEADERS, ...(PAN_TOKEN ? {'Authorization': `Bearer ${PAN_TOKEN}`} : {}) }
	      const response = await $fetch.get(healthUrl, { headers, timeout: 3000 })
	      const latency = Date.now() - start
	      // 检查状态码和响应体中的 status
	      let isValid = response.status >= 200 && response.status < 300
	      if (isValid && response.data) {
	        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
	        if (data.status !== 'ok') isValid = false
	      }
	      if (isValid) {
	        return { url, latency }
	      }
	    } catch (e) {
	      // 忽略单个错误
	    }
	    return null
	  })
	  const results = await Promise.all(tasks)
	  // 过滤掉失败的，按延迟排序
	  const validResults = results.filter(r => r !== null).sort((a, b) => a.latency - b.latency)
	  if (validResults.length > 0) {
	    cachedApiUrl = validResults[0].url
	    console.log(`PanSou API selected: ${cachedApiUrl} (${validResults[0].latency}ms)`)
	    return cachedApiUrl
	  }
	  return null
	}
	// 计算综合得分用于排序
	function getCardScore(name) {
	  let score = 0
	  const upper = name.toUpperCase()
	  // 简单的关键词加权
	  QUALITY_KEYWORDS.forEach(kw => {
	    if (upper.includes(kw.toUpperCase())) score += 10
	  })
	  return score
	}
	// 排序比较函数
	function sortCardsFunc(a, b, priorityMap) {
	  // 1. 优先级
	  const pa = priorityMap[a.pan] ?? 999
	  const pb = priorityMap[b.pan] ?? 999
	  if (pa !== pb) return pa - pb
	  // 2. 画质分数
	  const sa = getCardScore(a.vod_name)
	  const sb = getCardScore(b.vod_name)
	  if (sa !== sb) return sb - sa
	  // 3. 完结状态
	  const ca = COMPLETED_KEYWORDS.some(k => a.vod_name.toUpperCase().includes(k))
	  const cb = COMPLETED_KEYWORDS.some(k => b.vod_name.toUpperCase().includes(k))
	  if (ca && !cb) return -1
	  if (!ca && cb) return 1
	  // 4. 时间倒序
	  return b.datetime - a.datetime
	}
	// ================= 接口实现 =================
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
	  // 获取搜索关键词
	  let searchText = ext.search_text || ext.text || ext.query || ""
	  if (!searchText) {
	    $utils.toastError("请输入关键词开始搜索")
	    return jsonify({ list: [], page: 1, pagecount: 1, total: 0 })
	  }
	  // 获取 API 地址
	  const apiUrl = await getAvailableAPI()
	  if (!apiUrl) {
	    $utils.toastError("所有配置的 API 地址均不可用")
	    return jsonify({ list: [], page: 1, pagecount: 1, total: 0 })
	  }
	  // 构建请求
	  const enabledCloudTypes = Object.keys(PAN_TYPES_MAP)
	    .filter(key => PAN_TYPES_MAP[key].enabled)
	    .map(key => PAN_TYPES_MAP[key].backend_key)
	  if (enabledCloudTypes.length === 0) {
	    $utils.toastError("未启用任何网盘类型")
	    return jsonify({ list: [], page: 1, pagecount: 1, total: 0 })
	  }
	  // 构建请求体，参数符合 PanSou API 文档
	  const requestBody = {
	    kw: searchText,
	    filter: { include: QUALITY_KEYWORDS, exclude: ["枪版", "预告", "彩蛋"] },
	    cloud_types: enabledCloudTypes
	    // 注意：API 文档未提供 limit 和 page 参数，因此移除，依赖客户端分页
	  }
	  const headers = { ...BASE_HEADERS }
	  if (PAN_TOKEN) headers['Authorization'] = `Bearer ${PAN_TOKEN}`
	  try {
	    const response = await $fetch.post(`${apiUrl}/api/search`, requestBody, { headers: headers })
	    let data = response.data
	    if (typeof data === 'string') data = JSON.parse(data)
	    // 兼容处理：直接返回 merged_by_type 或包裹在 data 中
	    // 根据 README.md，成功响应直接包含 merged_by_type，但也可能有中间层代理包裹
	    const mergedData = data?.merged_by_type || data?.data?.merged_by_type
	    if (mergedData) {
	      let cards = []
	      // 遍历所有类型的资源
	      for (const backendKey in mergedData) {
	        // 反向查找前端配置键名
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
	            pan: frontKey, // xptv 识别字段
	            ext: jsonify({ panSouResult: row, searchText })
	          })
	        })
	      }
	      // 构建优先级映射
	      const userPriority = $config?.pan_priority || []
	      const priorityMap = {}
	      let fallbackIndex = userPriority.length
	      // 用户自定义优先级
	      userPriority.forEach((key, idx) => {
	        if (PAN_TYPES_MAP[key]) priorityMap[key] = idx
	      })
	      // 剩余启用的优先级
	      Object.keys(PAN_TYPES_MAP).forEach(key => {
	        if (priorityMap[key] === undefined) priorityMap[key] = fallbackIndex++
	      })
	      // 排序
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
	  // xptv 格式要求
	  const tracks = [{
	    name: row.note + (row.password ? ` [密码: ${row.password}]` : ''),
	    pan: row.url, // 用于网盘唤起
	    pwd: row.password || '' // 密码
	  }]
	  return jsonify({ list: [{ title: '网盘链接', tracks }] })
	}
	async function getPlayinfo(ext) {
	  // 网盘类通常不直接播放视频，返回空即可，xptv 会识别 pan 字段
	  return jsonify({ urls: [], headers: [] })
	}
	async function search(ext) {
	  return await getCards(ext)
	}
