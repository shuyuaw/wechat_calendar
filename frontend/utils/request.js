// utils/request.js

// TODO: Replace with your actual backend base URL
const BASE_URL = 'http://localhost:3001'; // Note: Includes '/api' prefix

/**
 * Makes an authenticated request to the backend API.
 * Automatically adds the Authorization header with the stored JWT token.
 * Handles common errors like missing token or 401/403 responses.
 * @param {object} options - The request options.
 * @param {string} options.url - The specific API endpoint (e.g., '/slots', '/coach/config'). Should start with '/'.
 * @param {string} [options.method='GET'] - The HTTP method (GET, POST, PUT, DELETE).
 * @param {object} [options.data={}] - The data payload for POST/PUT requests.
 * @param {boolean} [options.requiresAuth=true] - Set to false for public endpoints if needed (though login is handled separately).
 * @returns {Promise<object>} A promise that resolves with the response data on success (status 2xx) or rejects on failure.
 */
const request = (options) => {
  return new Promise((resolve, reject) => {
    const {
      url,
      method = 'GET',
      data = {},
      requiresAuth = true // Assume most endpoints require auth by default
    } = options;

    const header = {
      'Content-Type': 'application/json'
    };

    let token = null;

    // Add Authorization header if the endpoint requires authentication
    if (requiresAuth) {
      token = wx.getStorageSync('token');
      if (!token) {
        console.error(`[Request Util] No token found for protected route: ${url}`);
        wx.showToast({ title: '请先登录', icon: 'none' });
        // Optional: Redirect to login page automatically
        // wx.navigateTo({ url: '/pages/login/login' });
        return reject({ message: 'No token found', statusCode: 401 }); // Reject the promise
      }
      header['Authorization'] = `Bearer ${token}`;
    }

    // Construct the full URL
    const fullUrl = BASE_URL + url;
    console.log(`[Request Util] Making ${method} request to ${fullUrl}`); // Log the request

    wx.request({
      url: fullUrl,
      method: method,
      data: data,
      header: header,
      success: (res) => {
        console.log(`[Request Util] Response from ${method} ${fullUrl}:`, res); // Log the response
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Request successful
          resolve(res.data); // Resolve the promise with the response data
        } else if (requiresAuth && (res.statusCode === 401 || res.statusCode === 403)) {
          // Authentication error (Invalid/Expired Token)
          console.warn(`[Request Util] Auth failed for ${url}:`, res.data.message);
          wx.showToast({ title: '登录失效，请重试', icon: 'none' });
          // Optional: Clear expired token and redirect to login
          // wx.removeStorageSync('token');
          // wx.navigateTo({ url: '/pages/login/login' });
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

// Export the function to be used in other pages
module.exports = {
  request
};