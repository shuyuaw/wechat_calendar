// utils/request.js
const request = (options) => {
  return new Promise((resolve, reject) => {
    const {
      url,
      method = 'GET',
      data = {},
      requiresAuth = true
    } = options;

    const header = {
      'X-WX-SERVICE': 'my-backend', // 替换为你的云托管服务名
      'Content-Type': 'application/json'
    };

    let token = null;

    if (requiresAuth) {
      token = wx.getStorageSync('token');
      if (!token) {
        wx.showToast({ title: '请先登录', icon: 'none' });
        return reject({ message: 'No token found', statusCode: 401 });
      }
      header['Authorization'] = `Bearer ${token}`;
    }

    wx.cloud.callContainer({
      path: '/api' + url, // 注意这里要带上你后端的路径前缀
      method,
      data,
      header,
      success: (res) => {
        console.log(`[Request Util] Response from ${method} ${'/api' + url}:`, res); // Log the response
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else if (requiresAuth && (res.statusCode === 401 || res.statusCode === 403)) {
          // Authentication error (Invalid/Expired Token)
          console.warn(`[Request Util] Auth failed for ${url}:`, res.data.message);
          wx.showToast({ title: '登录失效，请重试', icon: 'none' });
          reject({ message: res.data.message || '认证失败', statusCode: res.statusCode });
        } else {
          // Other server errors (4xx, 5xx)
          console.error(`[Request Util] Server error for ${url}:`, res);
          wx.showToast({ title: res.data.message || '请求失败', icon: 'error' });
          reject({ message: res.data.message || '请求失败', statusCode: res.statusCode });
        }
      },
      fail: (err) => {
        // Network errors or other wx.request failures
        console.error(`[Request Util] Network error or failure for ${url}:`, err);
        wx.showToast({ title: '网络错误', icon: 'error' });
        reject({ message: '网络错误', error: err });
      }
    });
  });
};

module.exports = {
  request
};
