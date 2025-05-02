// frontend/app.js
App({
    // This function runs once when the Mini Program starts
    onLaunch: function () {
      console.log('App Launching...'); // Log when app starts
  
      // --- Perform Login ---
      wx.login({
        success: res => { // Use arrow function for correct 'this' scope if needed later
          console.log('wx.login success, code:', res.code);
          // Send res.code to backend to exchange for openId
          if (res.code) {
            // Initiate network request to our backend
            wx.request({
              // IMPORTANT: Use your actual backend server address.
              // For local testing, use localhost or your local IP.
              // Make sure your backend server is running!
              url: 'http://localhost:3001/api/login', // Replace with your backend URL
              method: 'POST',
              data: {
                code: res.code // Send the code obtained from wx.login
              },
              success: loginRes => { // Use arrow function
                console.log('Backend /api/login success:', loginRes.data);
                if (loginRes.statusCode === 200 && loginRes.data.openid) {
                  // Login successful, store the openid globally
                  this.globalData.openid = loginRes.data.openid;
                  console.log('Stored openid in globalData:', this.globalData.openid);
  
                  // TODO: Add callback logic here if other pages need to know login is complete
                  // Example: if (this.userInfoReadyCallback) { this.userInfoReadyCallback(loginRes) }
  
                } else {
                  // Backend returned an error or unexpected response
                  console.error('Backend login failed:', loginRes);
                  // Optionally show a user-facing error
                  wx.showToast({
                    title: '登录失败',
                    icon: 'error',
                    duration: 2000
                  });
                }
              },
              fail: loginErr => {
                console.error('wx.request to /api/login failed:', loginErr);
                // Handle network errors or other request failures
                wx.showToast({
                  title: '网络错误，登录失败',
                  icon: 'none',
                  duration: 2000
                });
              }
            });
          } else {
            console.error('wx.login failed! Error:', res.errMsg);
            wx.showToast({
              title: '微信登录失败',
              icon: 'error',
              duration: 2000
            });
          }
        },
        fail: err => {
            console.error('wx.login API call failed! Error:', err);
            wx.showToast({
              title: '无法调用微信登录',
              icon: 'error',
              duration: 2000
            });
        }
      });
      // --- End Login ---
  
      // Other onLaunch logic can go here (e.g., checking update manager)
    },
  
    // Define global data object
    globalData: {
      userInfo: null,
      openid: null // We will store the openid here after successful login
    }
  })