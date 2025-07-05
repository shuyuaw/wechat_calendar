// frontend/app.js
App({
  /**
   * Global data for the application
   */
  globalData: {
    userInfo: null, // Placeholder for potential user profile info
    openid: null,   // Store the user's unique OpenID
  },

  openidReadyCallback: null,

  /**
   * Lifecycle callback - Called when the Mini Program initializes.
   */
  onLaunch() {
    console.log('App Launching...');
    this.loginUser();
  },

  /**
   * Custom method to handle user login
   */
  loginUser() {
    // 1. Get the login code from WeChat
    wx.login({
      success: res => {
        if (res.code) {
          // 2. Send the code to the backend server to exchange for openid and token
          wx.request({
            url: 'http://localhost:3001/api/login', // Use your actual backend URL
            method: 'POST',
            data: {
              code: res.code
            },
            success: (loginRes) => {
              // 3. Handle the backend response
              if (loginRes.statusCode === 200 && loginRes.data && loginRes.data.token && loginRes.data.openid) {
                // MODIFICATION START: Added logs and callback execution as requested
                console.log('[app.js] Login successful. OpenID received.');
                
                // Store the OpenID in globalData
                this.globalData.openid = loginRes.data.openid;

                // Store the token persistently
                try {
                  wx.setStorageSync('token', loginRes.data.token);
                } catch (e) {
                  console.error('Failed to store token in wx.setStorageSync:', e);
                }

                // IMPORTANT: Check if the callback has been set by the page
                if (this.openidReadyCallback) {
                  console.log('[app.js] Found a callback. Executing openidReadyCallback.');
                  this.openidReadyCallback(this.globalData.openid);
                }
                // MODIFICATION END

              } else {
                // Handle backend login error
                console.error('App.js: Backend login failed.', loginRes);
                wx.showToast({ title: '登录失败[Server]', icon: 'none' });
              }
            },
            fail: (err) => {
              // Handle network errors
              console.error('App.js: wx.request to /api/login failed.', err);
              wx.showToast({ title: '网络错误，请稍后重试', icon: 'none' });
            }
          });
        } else {
          // Handle wx.login failure
          console.error('App.js: wx.login failed to get code.', res);
          wx.showToast({ title: '微信登录接口调用失败', icon: 'none' });
        }
      },
      fail: err => {
        // Handle wx.login call failure
        console.error('App.js: wx.login API call failed.', err);
        wx.showToast({ title: '微信登录失败', icon: 'none' });
      }
    });
  }
})