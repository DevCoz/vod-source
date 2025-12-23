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
	// 解析多个 API 地址
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
	// 缓存经过排序的可用节点列表 [{url: "http://...", latency: 100}, ...]
	let sortedApiNodes = []
	// ================= 核心逻辑 =================
	// 检测并排序所有 API 节点
	async function detectApiNodes() {
	  if (PAN_URLS.length === 0) return []
	  // 并发检测所有节点
	  const tasks = PAN_URLS.map(async (url) => {
	    try {
	      const start = Date.now()
	      const testUrl = `${url}/api/search`
	      const headers = { ...BASE_HEADERS }
	      if (PAN_TOKEN) headers['Authorization'] = `Bearer ${PAN_TOKEN}`
	      // 发送探测请求
	      const response = await $fetch.post(testUrl, { kw: "test", cloud_types: ["baidu"] }, { 
	        headers: headers, 
	        timeout: 5000 
	      })
	      const latency = Date.now() - start
	      if (response && response.status >= 200 && response.status < 300) {
	        return { url, latency }
	      }
	    } catch (e) {
	      // 忽略单个节点错误
	    }
	    return null
	  })
	  const results = await Promise.all(tasks)
	  // 过滤无效节点，并按延迟升序排序（最快的在最前）
	  return results
	    .filter(r => r !== null)
	    .sort((a, b) => a.latency - b.latency)
	}
	// 获取最佳 API 节点（带缓存）
	async function getApiNodes() {
	  // 如果缓存为空，执行一次全量检测
	  if (sortedApiNodes.length === 0) {
	    sortedApiNodes = await detectApiNodes()
	  }
	  return sortedApiNodes
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
	  // 获取已排序的节点列表
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
	  // 【故障自动切换逻辑】
	  // 遍历所有可用节点，按优先级（速度）尝试请求，直到成功或全部失败
	  for (let i = 0; i < nodes.length; i++) {
	    const currentNode = nodes[i]
	    try {
	      const response = await $fetch.post(`${currentNode.url}/api/search`, requestBody, { headers: headers })
	      let data = response.data
	      if (typeof data === 'string') data = JSON.parse(data)
	      if ((data?.code === 0 || !data?.code) && data?.data?.merged_by_type) {
	        // 请求成功，处理数据...
	        let cards = []
	        const mergedData = data.data.merged_by_type
	        for (const backendKey in mergedData) {
	          const panConfig = Object.values(PAN_TYPES_MAP).find(cfg => cfg.backend_key === backendKey)
	          const frontKey = panConfig ? Object.keys(PAN_TYPES_MAP).find(k => PAN_TYPES_MAP[k] === panConfig) : backendKey
	          const pic = PAN_PIC_MAP[backendKey] || ''
	          let rows = mergedData[backendKey]
	          rows.sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())
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
	      }
	    } catch (error) {
	      // 记录错误，继续尝试下一个节点
	      lastError = error
	      console.log(`节点 ${currentNode.url} 请求失败，尝试切换节点...`)
	    }
	  }
	  // 所有节点均尝试失败
	  $utils.toastError(`所有节点请求失败: ${lastError ? lastError.message : '未知错误'}`)
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
	  return jsonify({ urls: [], headers: [] })
	}
	async function search(ext) {
	  return await getCards(ext)
	}
