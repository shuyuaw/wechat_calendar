// frontend/app.js
App({
  /**
   * Global data for the application
   */
  globalData: {
    userInfo: null, // Placeholder for potential user profile info
    openid: null,   // Store the user's unique OpenID
  },

  /**
   * Callback function for pages waiting for OpenID.
   * Pages can set this in their onLoad if openid isn't ready yet.
   */
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
          console.log('wx.login success, code:', res.code);
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
                console.log('Backend /api/login success:', loginRes.data);

                // Store the OpenID in globalData
                this.globalData.openid = loginRes.data.openid;
                console.log('Stored openid in globalData:', this.globalData.openid);

                // Store the token persistently
                try {
                  wx.setStorageSync('token', loginRes.data.token);
                  console.log('Token stored successfully in wx.setStorageSync.');
                } catch (e) {
                  console.error('Failed to store token in wx.setStorageSync:', e);
                }

                // --- Check for and execute the callback ---
                console.log('[App.js] Checking for openidReadyCallback. Value:', this.openidReadyCallback);
                if (this.openidReadyCallback) {
                  console.log('[App.js] Executing openidReadyCallback...');
                  // Pass the obtained openid to the callback function
                  this.openidReadyCallback(this.globalData.openid);
                  // Clear the callback after use to prevent multiple calls if not desired
                  this.openidReadyCallback = null;
                } else {
                   console.log('[App.js] No openidReadyCallback found (or already executed).');
                }
                // --- End callback execution ---

              } else {
                // Handle backend login error
                console.error('Backend /api/login error response:', loginRes);
                wx.showToast({ title: '登录失败[Server]', icon: 'none' });
                // If login fails, make sure any waiting callback knows (optional)
                if (this.openidReadyCallback) {
                    console.log('[App.js] Executing openidReadyCallback with null due to login failure.');
                    this.openidReadyCallback(null); // Pass null to indicate failure
                    this.openidReadyCallback = null;
                }
              }
            },
            fail: (err) => {
              // Handle network errors
              console.error('wx.request to /api/login failed:', err);
              wx.showToast({ title: '网络错误，请稍后重试', icon: 'none' });
              // If login fails, make sure any waiting callback knows (optional)
               if (this.openidReadyCallback) {
                    console.log('[App.js] Executing openidReadyCallback with null due to network failure.');
                    this.openidReadyCallback(null); // Pass null to indicate failure
                    this.openidReadyCallback = null;
               }
            }
          });
        } else {
          // Handle wx.login failure
          console.error('wx.login failed to get code:', res);
          wx.showToast({ title: '微信登录接口调用失败', icon: 'none' });
           if (this.openidReadyCallback) {
               console.log('[App.js] Executing openidReadyCallback with null due to wx.login failure.');
               this.openidReadyCallback(null); // Pass null to indicate failure
               this.openidReadyCallback = null;
           }
        }
      },
      fail: err => {
        // Handle wx.login call failure
        console.error('wx.login API call failed:', err);
        wx.showToast({ title: '微信登录失败', icon: 'none' });
         if (this.openidReadyCallback) {
             console.log('[App.js] Executing openidReadyCallback with null due to wx.login API failure.');
             this.openidReadyCallback(null); // Pass null to indicate failure
             this.openidReadyCallback = null;
         }
      }
    });
  }
})