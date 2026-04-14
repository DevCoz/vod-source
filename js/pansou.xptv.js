// PanSou 盘搜 XPTV 源
// 网盘资源搜索API：https://so.252035.xyz
// 需要对应网盘 APP 或插件才能播放（夸克/阿里/115/天翼）

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SITE = 'https://so.252035.xyz';
const API_SEARCH = `${SITE}/api/search`;

const SUPPORTED_PAN_TYPES = ['quark', 'aliyun', '115', 'tianyi'];

const PAN_TYPE_NAMES = {
  'quark': '夸克网盘',
  'aliyun': '阿里网盘',
  '115': '115网盘',
  'tianyi': '天翼网盘'
};

function detectPanType(url) {
  if (!url) return '';
  if (url.includes('pan.quark.cn') || url.includes('pan.qoark.cn')) return 'quark';
  if (url.includes('pan.aliyun.com') || url.includes('alipan.com') || url.includes('aliyundrive.com')) return 'aliyun';
  if (url.includes('115.com') || url.includes('115cdn.com')) return '115';
  if (url.includes('cloud.189.cn')) return 'tianyi';
  return '';
}

async function getLocalInfo() {
  return jsonify({
    ver: 1,
    name: '盘搜',
    api: 'csp_pansou',
    type: 3
  });
}

async function getConfig() {
  return jsonify({
    ver: 1,
    title: '盘搜',
    site: SITE,
    tabs: []
  });
}

async function getCards(ext) {
  return jsonify({ list: [], page: 1 });
}

async function getTracks(ext) {
  ext = argsify(ext);
  const { url, password, note, panType } = ext;

  if (!url) {
    return jsonify({ list: [] });
  }

  let finalUrl = url;
  if (password && !url.includes('?pwd=') && !url.includes('&pwd=') && !url.includes('password=')) {
    finalUrl = url.includes('?') ? `${url}&pwd=${password}` : `${url}?pwd=${password}`;
  }

  return jsonify({
    list: [{
      title: PAN_TYPE_NAMES[panType] || '网盘资源',
      tracks: [{
        name: note || PAN_TYPE_NAMES[panType] || '网盘资源',
        pan: finalUrl,
        ext: {}
      }]
    }]
  });
}

async function getPlayinfo(ext) {
  return jsonify({ urls: [] });
}

async function search(ext) {
  ext = argsify(ext);
  const { text, wd, page = 1 } = ext;
  const keyword = text || wd || '';

  if (!keyword) {
    return jsonify({ list: [], page: 1 });
  }

  try {
    const { data: apiResponse } = await $fetch.post(API_SEARCH, JSON.stringify({ kw: keyword }), {
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/json',
        'Referer': SITE + '/'
      }
    });

    let responseData;
    try {
      responseData = typeof apiResponse === 'string' ? JSON.parse(apiResponse) : apiResponse;
    } catch (e) {
      return jsonify({ list: [], page: 1 });
    }

    if (responseData.code !== 0 || !responseData.data) {
      return jsonify({ list: [], page: 1 });
    }

    const mergedByType = responseData.data.merged_by_type || {};
    const list = [];

    for (const panType of SUPPORTED_PAN_TYPES) {
      const items = mergedByType[panType] || [];
      for (const item of items) {
        if (!item.url) continue;

        const detectedType = detectPanType(item.url) || panType;
        if (!SUPPORTED_PAN_TYPES.includes(detectedType)) continue;

        list.push({
          vod_id: `${detectedType}_${item.url}_${item.datetime || ''}`,
          vod_name: item.note || `${PAN_TYPE_NAMES[detectedType]}资源`,
          vod_pic: (item.images && item.images.length > 0) ? item.images[0] : '',
          vod_remarks: item.datetime ? item.datetime.split('T')[0] : '',
          ext: {
            url: item.url,
            password: (item.password && item.password !== '***') ? item.password : '',
            note: item.note || '',
            panType: detectedType
          }
        });
      }
    }

    list.sort((a, b) => (b.vod_remarks || '').localeCompare(a.vod_remarks || ''));

    return jsonify({ list, page });

  } catch (error) {
    return jsonify({ list: [], page: 1 });
  }
}
