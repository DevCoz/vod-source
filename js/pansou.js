// 自定义配置格式 {"pansou_url":"https://pansou.dev168.cf","pansou_token":"","only":""}
// pansou_url: 盘搜API地址
// pansou_token: 如果该实例启用了认证，请填入JWT Token，否则留空
// only是过滤网盘用的，内容为域名的截取，如driver.uc.com，就可以填uc，用英文逗号,分割
const cheerio = createCheerio()
const CryptoJS = createCryptoJS()

let $config = argsify($config_str)
const PAN_API_URL = $config?.pansou_url || ""
const PAN_TOKEN = $config?.pansou_token || ""
const ONLY_FILTER = $config?.only || ""

// 公共请求头
const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  'Content-Type': 'application/json',
}

// 辅助函数
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

async function getConfig() {
  const appConfig = {
    ver: 1,
    title: "盘搜CF｜PAN",
    site: PAN_API_URL,
    tabs: [
      {
        name: '搜索',
        ext: jsonify({
          id: 'search',
        }),
      }
    ]
  }
  return jsonify(appConfig)
}

// 创建卡片项的辅助函数
function createCardItem(item, index, searchText) {
  // 生成唯一ID
  const uniqueId = item.unique_id || `${item.channel}_${item.message_id}`
  
  // 格式化日期
  let formattedDate = '未知时间'
  try {
    const date = new Date(item.datetime)
    if (!isNaN(date.getTime())) {
      formattedDate = date.toLocaleDateString('zh-CN')
    }
  } catch (e) {
    // 如果是时间戳
    try {
      const timestamp = parseInt(item.datetime)
      if (!isNaN(timestamp)) {
        formattedDate = new Date(timestamp * 1000).toLocaleDateString('zh-CN')
      }
    } catch (e2) {
      // 保持默认值
    }
  }

  return {
    vod_id: uniqueId,
    vod_name: item.title || `资源 ${index + 1}`,
    vod_pic: item.images && item.images.length > 0 ? item.images[0] : 'https://s.tutu.pm/img/default.webp  ',
    vod_remarks: `${item.channel.replace('@', '')} | ${formattedDate}`,
    ext: jsonify({
      panSouResult: item,
      searchText: searchText
    }),
  }
}

async function getCards(ext) {
  ext = argsify(ext)
  let cards = []
  let searchText = "热门资源"
  
  // 从tab配置或搜索参数获取关键词
  if (ext.search_text) {
    searchText = ext.search_text
  } else if (ext.text) {
    searchText = ext.text
  } else if (ext.query) {
    searchText = ext.query
  }

  const searchUrl = `${PAN_API_URL}/api/search`
  const requestBody = {
    kw: searchText,
    res: "results", // 获取详细结果
    // 可选：设置过滤器，排除失效资源
    filter: {
      exclude: ["失效", "错误", "过期", "无资源"]
    }
  }

  // 构建请求头，添加认证信息（如果配置了token）
  const headers = { ...BASE_HEADERS }
  if (PAN_TOKEN) {
    headers['Authorization'] = `Bearer ${PAN_TOKEN}`
  }

  try {
    const response = await $fetch.post(searchUrl, requestBody, { headers: headers })
    
    if (response.status >= 200 && response.status < 300) {
      // 尝试解析响应数据
      let data = response.data
      
      // 检查数据格式
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data)
        } catch (e) {
          $utils.toastError("API返回非JSON格式数据")
          return jsonify({ list: [] })
        }
      }
      
      // 检查是否有results字段
      if (data && data.results && Array.isArray(data.results)) {
        // 处理直接的results数组
        data.results.forEach((item, index) => {
          cards.push(createCardItem(item, index, searchText))
        })
      } else if (data && data.data && data.data.results && Array.isArray(data.data.results)) {
        // 处理可能的嵌套格式
        data.data.results.forEach((item, index) => {
          cards.push(createCardItem(item, index, searchText))
        })
      } else {
        $utils.toastError("API返回格式异常，缺少results字段")
      }
    } else {
      let errorMsg = `API请求失败，状态码: ${response.status}`
      if (response.data) {
        try {
          const errorData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
          if (errorData.error) errorMsg += `, 错误: ${errorData.error}`
          else if (errorData.message) errorMsg += `, 消息: ${errorData.message}`
        } catch (e) {
          errorMsg += `, 响应: ${JSON.stringify(response.data)}`
        }
      }
      $utils.toastError(errorMsg)
    }
  } catch (error) {
    $utils.toastError(`API请求失败: ${error.message || error}`)
  }

  return jsonify({
    list: cards,
    page: ext.page || 1,
    pagecount: Math.ceil(cards.length / 20) || 1,
    total: cards.length
  })
}

async function getTracks(ext) {
  ext = argsify(ext)
  let tracks = []
  
  const panSouResult = ext.panSouResult
  if (!panSouResult || !Array.isArray(panSouResult.links)) {
    $utils.toastError("获取网盘链接失败，数据格式错误")
    return jsonify({ list: [] })
  }

  const links = panSouResult.links
  
  // 定义排序顺序：夸克 > 阿里云 > UC > 天翼云 > 115
  const order = ["quark.cn", "alipan.com", "uc.cn", "189.cn", "115.com"]
  
  // 解析only过滤条件
  const keys = ONLY_FILTER ? ONLY_FILTER.toLowerCase().split(",").filter(Boolean) : []

  // 处理每个链接
  links.forEach((linkObj, index) => {
    let linkUrl = linkObj.url || ''
    let linkPassword = linkObj.password || ''
    let note = linkObj.work_title || panSouResult.title || `链接 ${(index + 1).toString()}`

    // 应用only过滤规则
    if (keys.length && linkUrl) {
      const match = linkUrl.match(/^(https?:\/\/)?([^\/:]+)/i)
      if (match) {
        const domain = match[2].toLowerCase()
        const hit = keys.some(k => domain.includes(k))
        if (!hit) {
          return
        }
      } else {
        return
      }
    }

    // 生成标题
    let title = note
    if (linkPassword) {
      title += ` (密码: ${linkPassword})`
    }
    title += ` (${(index + 1).toString()})`

    tracks.push({
      name: title,
      pan: linkUrl,
      pwd: linkPassword,
      ext: jsonify({
        url: linkUrl,
        password: linkPassword
      })
    })
  })

  // 按网盘类型排序
  tracks = tracks.sort((a, b) => {
    const getSortIndex = (url) => {
      const match = url.match(/^https?:\/\/([^\/?#]+)/i)
      if (match) {
        const host = match[1].toLowerCase()
        for (let i = 0; i < order.length; i++) {
          if (host.includes(order[i])) return i
        }
      }
      return 999 // 未匹配的排最后
    }

    return getSortIndex(a.pan) - getSortIndex(b.pan)
  })

  // 限制每个网盘类型的数量（避免重复）
  const hostCount = {}
  tracks = tracks.filter(item => {
    const match = item.pan.match(/^https?:\/\/([^\/?#]+)/i)
    const host = match ? match[1].toLowerCase() : "unknown"
    
    hostCount[host] = (hostCount[host] || 0) + 1
    return hostCount[host] <= 5 // 每个网盘最多5个链接
  })
  
  return jsonify({
    list: [
      {
        title: '网盘链接',
        tracks: tracks
      }
    ]
  })
}

async function getPlayinfo(ext) {
  return jsonify({ 
    urls: [],
    headers: [BASE_HEADERS]
  })
}

async function search(ext) {
  return await getCards(ext)
}
