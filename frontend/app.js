// frontend/app.js
App({
  /**
   * Global data for the application
   */
  globalData: {
    userInfo: null, // Placeholder for potential user profile info
    openid: null,   // Store the user's unique OpenID
    // No need to store token in globalData, using wx.setStorageSync instead
    // BASE_URL: 'http://localhost:3001/api' // Define base URL if needed elsewhere
  },

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
            // *** IMPORTANT: Replace with your actual backend URL ***
            // If your server is running locally for testing:
            url: 'http://localhost:3001/api/login',
            // If deployed or using a different URL, update this:
            // url: 'YOUR_DEPLOYED_BACKEND_URL/api/login',
            method: 'POST',
            data: {
              code: res.code
            },
            success: (loginRes) => {
              // 3. Handle the backend response
              // Check status code and expected data structure from your backend API
              if (loginRes.statusCode === 200 && loginRes.data && loginRes.data.token && loginRes.data.openid) {
                console.log('Backend /api/login success:', loginRes.data);

                // Store the OpenID in globalData
                this.globalData.openid = loginRes.data.openid;
                console.log('Stored openid in globalData:', this.globalData.openid);

                // --- *** THIS IS THE FIX *** ---
                // Store the token persistently using WeChat's synchronous storage API
                try {
                  wx.setStorageSync('token', loginRes.data.token);
                  console.log('Token stored successfully in wx.setStorageSync.');
                } catch (e) {
                  console.error('Failed to store token in wx.setStorageSync:', e);
                  // Optional: Show an error to the user if storing fails critically
                  // wx.showToast({ title: '登录状态保存失败', icon: 'error' });
                }
                // --- *** END OF FIX *** ---

                // Optional: Store other user info if your login endpoint returns it
                // this.globalData.userInfo = loginRes.data.userInfo || null;

                // TODO: Maybe trigger a callback or event if pages need to know login is complete
                // For example, using wx.event or a simple flag/callback system


              } else {
                // Handle cases where backend returned an error or unexpected data
                console.error('Backend /api/login error response:', loginRes);
                wx.showToast({ title: '登录失败[Server]', icon: 'none' }); // Use 'none' for custom msg
              }
            },
            fail: (err) => {
              // Handle network errors or failure to reach the backend
              console.error('wx.request to /api/login failed:', err);
              wx.showToast({ title: '网络错误，请稍后重试', icon: 'none' });
            }
          });
        } else {
          // Handle cases where wx.login itself fails to get a code
          console.error('wx.login failed to get code:', res);
          wx.showToast({ title: '微信登录接口调用失败', icon: 'none' });
        }
      },
      fail: err => {
        // Handle errors in the wx.login call itself
        console.error('wx.login API call failed:', err);
        wx.showToast({ title: '微信登录失败', icon: 'none' });
      }
    });
  }

  // You can add other global methods or properties here if needed
})