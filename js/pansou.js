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
	// ================= 全局初始化 =================
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
	const CACHE_KEY_NODES = "pansou_nodes_cache_v1" // 缓存键
	const CACHE_TTL = 600 * 1000 // 缓存有效期10分钟
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
	// ================= 核心逻辑 =================
	// 获取节点列表（带缓存检测）
	async function getApiNodes() {
	  // 1. 尝试从缓存读取
	  try {
	    const cachedStr = $cache.get(CACHE_KEY_NODES)
	    if (cachedStr) {
	      const cached = argsify(cachedStr)
	      if (cached.timestamp && (Date.now() - cached.timestamp < CACHE_TTL)) {
	        $print(`[PanSou] 使用缓存的节点列表 (剩余${Math.ceil((CACHE_TTL - (Date.now() - cached.timestamp))/1000)}s)`)
	        return cached.list
	      }
	    }
	  } catch (e) {
	    $print(`[PanSou] 读取缓存失败: ${e.message}`)
	  }
	  // 2. 缓存失效或不存在，执行全网测速
	  $print("[PanSou] 开始全网测速...")
	  if (PAN_URLS.length === 0) return []
	  const tasks = PAN_URLS.map(async (url) => {
	    try {
	      const start = Date.now()
	      const testUrl = `${url}/api/search`
	      const headers = { ...BASE_HEADERS }
	      if (PAN_TOKEN) headers['Authorization'] = `Bearer ${PAN_TOKEN}`
	      await $fetch.post(testUrl, { kw: "test", cloud_types: ["baidu"] }, { 
	        headers: headers, 
	        timeout: 5000 
	      })
	      const latency = Date.now() - start
	      $print(`[PanSou] 节点 ${url} 延迟: ${latency}ms`)
	      return { url, latency }
	    } catch (e) {
	      $print(`[PanSou] 节点 ${url} 不可用`)
	      return null
	    }
	  })
	  const results = await Promise.all(tasks)
	  const validResults = results.filter(r => r !== null).sort((a, b) => a.latency - b.latency)
	  // 3. 存入缓存
	  if (validResults.length > 0) {
	    const cacheData = {
	      timestamp: Date.now(),
	      list: validResults
	    }
	    $cache.set(CACHE_KEY_NODES, jsonify(cacheData))
	    $print(`[PanSou] 测速完成，最佳节点: ${validResults[0].url} (${validResults[0].latency}ms)`)
	    return validResults
	  }
	  return []
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
	  const appConfig = {
	    ver: 1,
	    title: "盘搜CF｜PAN",
	    site: PAN_URLS[0] || "PanSou",
	    tabs: [{ 
	      name: '搜索', 
	      ext: jsonify({ id: 'search' }) 
	    }]
	  }
	  return jsonify(appConfig)
	}
	async function getCards(ext) {
	  ext = argsify(ext)
	  const searchText = ext.search_text || ext.text || ext.query || ""
	  if (!searchText) {
	    $utils.toastError("请输入关键词开始搜索")
	    return jsonify({ list: [], page: 1, pagecount: 1, total: 0 })
	  }
	  // 获取可用节点
	  let nodes = await getApiNodes()
	  if (nodes.length === 0) {
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
	  let lastError = null
	  // 遍历节点尝试请求（故障自动切换）
	  for (let i = 0; i < nodes.length; i++) {
	    const currentNode = nodes[i]
	    try {
	      $print(`[PanSou] 正在请求节点: ${currentNode.url}`)
	      const response = await $fetch.post(`${currentNode.url}/api/search`, requestBody, { headers: headers })
	      let data = response.data
	      if (typeof data === 'string') data = JSON.parse(data)
	      if ((data?.code === 0 || !data?.code) && data?.data?.merged_by_type) {
	        $print(`[PanSou] 节点 ${currentNode.url} 请求成功`)
	        let cards = []
	        const mergedData = data.data.merged_by_type
	        for (const backendKey in mergedData) {
	          const panConfig = Object.values(PAN_TYPES_MAP).find(cfg => cfg.backend_key === backendKey)
	          const frontKey = panConfig ? Object.keys(PAN_TYPES_MAP).find(k => PAN_TYPES_MAP[k] === panConfig) : backendKey
	          const pic = PAN_PIC_MAP[backendKey] || ''
	          let rows = mergedData[backendKey]
	          rows.sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())
	          if (rows.length > 15) rows = rows.slice(0, 15)
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
	        // 分页逻辑
	        const pageSize = 20
	        const page = parseInt(ext.page) || 1
	        const total = cards.length
	        const pagecount = Math.ceil(total / pageSize) || 1
	        const start = (page - 1) * pageSize
	        const list = cards.slice(start, start + pageSize)
	        return jsonify({ list, page, pagecount, total })
	      }
	    } catch (error) {
	      lastError = error
	      $print(`[PanSou] 节点 ${currentNode.url} 失败: ${error.message}, 尝试下一个...`)
	    }
	  }
	  $utils.toastError(`所有节点请求失败`)
	  return jsonify({ list: [], page: 1, pagecount: 1, total: 0 })
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
	  ext = argsify(ext)
	  // ext.url 应该在 getTracks 中不传递 url，因为我们只是展示网盘链接
	  // 如果需要实际播放（通常网盘不支持直接播放），这里可以留空或返回处理逻辑
	  // 根据现有逻辑，这里主要返回空，由用户查看网盘地址
	  return jsonify({ urls: [], headers: [] })
	}
	async function search(ext) {
	  return await getCards(ext)
	}
