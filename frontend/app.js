// app.js
App({
  onLaunch() {
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 登录
    wx.login({
      success: res => {
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
        if (res.code) {
          console.log('获取用户登录凭证：' + res.code);
          // 发起网络请求
          wx.request({
            // TODO: Replace with your actual backend login API URL
            url: 'http://localhost:3001/api/login',
            method: 'POST',
            data: {
              code: res.code
            },
            success: apiRes => {
              console.log('Backend login response:', apiRes.data);
              if (apiRes.statusCode === 200 && apiRes.data.token) { // Assuming backend returns a token
                // Store the token
                wx.setStorageSync('token', apiRes.data.token);
                // Store user info if available
                // this.globalData.userInfo = apiRes.data.userInfo;
                console.log('登录成功，Token已存储');

                // You might want to trigger a global event or callback
                // if other pages need to know when login is complete
                if (this.userInfoReadyCallback) {
                  this.userInfoReadyCallback(apiRes.data)
                }

              } else {
                // Handle login failure from backend
                console.error('后端登录失败:', apiRes);
                wx.showToast({ title: '登录失败，请稍后重试', icon: 'none' });
              }
            },
            fail: err => {
              // Handle network failure
              console.error('请求后端登录接口失败:', err);
              wx.showToast({ title: '网络错误，登录失败', icon: 'none' });
            }
          })
        } else {
          console.error('wx.login 获取 code 失败！' + res.errMsg)
          wx.showToast({ title: '微信登录失败', icon: 'none' });
        }
      },
      fail: err => {
          console.error('wx.login 调用失败:', err);
          wx.showToast({ title: '无法调用微信登录', icon: 'none' });
      }
    })
  },
  globalData: {
    userInfo: null,
    // TODO: Add your backend base URL here or in a config file
    // baseUrl: 'http://YOUR_BACKEND_IP:PORT/api'
  }
})