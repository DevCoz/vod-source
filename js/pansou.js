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
	function jsonify(obj) { return JSON.stringify(obj) }
	function argsify(str) { try { return str ? JSON.parse(str) : {} } catch (e) { return {} } }
	function formatDateTime(str) {
	  try {
	    let d = /^\d+$/.test(str) ? new Date(parseInt(str) * (str.length === 10 ? 1000 : 1)) : new Date(str)
	    if (!isNaN(d.getTime())) return `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getFullYear()).slice(-2)}`
	  } catch (e) {}
	  return '未知'
	}
	// ================= 常量与配置 =================
	const BASE_HEADERS = {
	  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
	  'Content-Type': 'application/json',
	}
	const QUALITY_KW = ['HDR', '杜比', 'DV', 'REMUX', 'HQ', '臻彩', '高码', '高画质', '60FPS', '60帧', '高帧率', '60HZ', '4K', '2160P']
	const COMPLETE_KW = ['完结', '全集', '已完成', '全']
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
	// 预处理配置与映射
	const PAN_URLS = ($config?.pansou_urls || "").split(/[\n,]/).map(u => u.trim()).filter(u => u)
	const PAN_TOKEN = $config?.pansou_token || ""
	const PAN_TYPES_DEF = [
	  { k: 'quark', b: 'quark' }, { k: 'uc', b: 'uc' }, { k: 'pikpak', b: 'pikpak' }, { k: 'xunlei', b: 'xunlei' },
	  { k: 'a123', b: '123' }, { k: 'a189', b: 'tianyi' }, { k: 'a139', b: 'mobile' }, { k: 'a115', b: '115' },
	  { k: 'baidu', b: 'baidu' }, { k: 'ali', b: 'aliyun' }
	]
	const PAN_TYPES = {}
	const BACKEND_TO_FRONT = {} 
	const ENABLED_TYPES = []
	PAN_TYPES_DEF.forEach(({ k, b }) => {
	  const enabled = $config?.[k] !== false
	  PAN_TYPES[k] = { enabled, backend_key: b }
	  BACKEND_TO_FRONT[b] = k
	  if (enabled) ENABLED_TYPES.push(b)
	})
	// ================= 核心逻辑 =================
	let cachedApi = null
	function getHeaders() {
	  return PAN_TOKEN ? { ...BASE_HEADERS, 'Authorization': `Bearer ${PAN_TOKEN}` } : BASE_HEADERS
	}
	const EMPTY_RES = jsonify({ list: [], page: 1, pagecount: 1, total: 0 })
	async function getAvailableAPI() {
	  if (cachedApi) return cachedApi
	  if (!PAN_URLS.length) return null
	  const tasks = PAN_URLS.map(async url => {
	    try {
	      const start = Date.now()
	      const res = await $fetch.post(`${url}/api/search`, { kw: "", limit: 1 }, { headers: getHeaders(), timeout: 3000 })
	      return (res.status >= 200 && res.status < 300) ? { url, latency: Date.now() - start } : null
	    } catch (e) { return null }
	  })
	  const valid = (await Promise.all(tasks)).filter(Boolean).sort((a, b) => a.latency - b.latency)
	  if (valid.length) {
	    cachedApi = valid[0].url
	    console.log(`Selected: ${cachedApi} (${valid[0].latency}ms)`)
	  }
	  return cachedApi
	}
	function getScore(name) {
	  let s = 0
	  QUALITY_KW.forEach(k => { if (name.toUpperCase().includes(k.toUpperCase())) s += 10 })
	  return s
	}
	function sortFunc(a, b, priorityMap) {
	  const pa = priorityMap[a.pan] ?? 999, pb = priorityMap[b.pan] ?? 999
	  if (pa !== pb) return pa - pb
	  const sa = getScore(a.vod_name), sb = getScore(b.vod_name)
	  if (sa !== sb) return sb - sa
	  const ca = COMPLETE_KW.some(k => a.vod_name.toUpperCase().includes(k))
	  const cb = COMPLETE_KW.some(k => b.vod_name.toUpperCase().includes(k))
	  return ca === cb ? b.datetime - a.datetime : (ca ? -1 : 1)
	}
	// ================= 接口实现 =================
	async function getConfig() {
	  return jsonify({
	    ver: 1, title: "盘搜CF｜PAN", site: PAN_URLS[0] || "PanSou",
	    tabs: [{ name: '搜索', ext: jsonify({ id: 'search' }) }]
	  })
	}
	async function getCards(ext) {
	  ext = argsify(ext)
	  const kw = ext.search_text || ext.text || ext.query || ""
	  if (!kw) return $utils.toastError("请输入关键词") || EMPTY_RES
	  const apiUrl = await getAvailableAPI()
	  if (!apiUrl) return $utils.toastError("API地址不可用") || EMPTY_RES
	  if (!ENABLED_TYPES.length) return $utils.toastError("未启用任何网盘") || EMPTY_RES
	  try {
	    const res = await $fetch.post(`${apiUrl}/api/search`, {
	      kw, filter: { include: QUALITY_KW, exclude: ["枪版", "预告", "彩蛋"] },
	      cloud_types: ENABLED_TYPES, limit: 100, page: 1
	    }, { headers: getHeaders() })
	    let data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
	    if (data?.code === 0 && data?.data?.merged_by_type) {
	      const cards = []
	      const merged = data.data.merged_by_type
	      const userPrio = $config?.pan_priority || []
	      const prioMap = {}
	      let fallbackIdx = userPrio.length
	      Object.keys(PAN_TYPES).forEach(k => { prioMap[k] = userPrio.includes(k) ? userPrio.indexOf(k) : fallbackIdx++ })
	      Object.entries(merged).forEach(([bKey, rows]) => {
	        const fKey = BACKEND_TO_FRONT[bKey] || bKey
	        const pic = PAN_PIC_MAP[bKey] || ""
	        rows.forEach(row => {
	          const dt = new Date(row.datetime).getTime()
	          cards.push({
	            vod_id: row.url,
	            vod_name: row.note || '未命名资源',
	            vod_pic: pic,
	            vod_remarks: `${(row.source || '').replace(/plugin:/gi, '插件:').replace(/tg:/gi, '频道:')} | ${fKey} | ${formatDateTime(row.datetime)}`,
	            datetime: dt,
	            pan: fKey,
	            ext: jsonify({ panSouResult: row, searchText: kw })
	          })
	        })
	      })
	      cards.sort((a, b) => sortFunc(a, b, prioMap))
	      const pg = parseInt(ext.page) || 1
	      const size = 20
	      const total = cards.length
	      return jsonify({
	        list: cards.slice((pg - 1) * size, pg * size),
	        page: pg, pagecount: Math.ceil(total / size) || 1, total
	      })
	    }
	    return $utils.toastError("API返回无数据") || EMPTY_RES
	  } catch (e) {
	    return $utils.toastError(`请求失败: ${e.message}`) || EMPTY_RES
	  }
	}
	async function getTracks(ext) {
	  ext = argsify(ext)
	  const row = ext.panSouResult
	  if (!row) return $utils.toastError("数据丢失") || jsonify({ list: [] })
	  const track = { name: row.note + (row.password ? ` (密码: ${row.password})` : ''), pan: row.url, pwd: row.password || '' }
	  return jsonify({ list: [{ title: '网盘链接', tracks: [track] }] })
	}
	async function getPlayinfo() { return jsonify({ urls: [], headers: [] }) }
	async function search(ext) { return getCards(ext) }
