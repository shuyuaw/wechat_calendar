// frontend/app.js
const { request } = require('./utils/request.js'); // Import the request utility

App({
  globalData: {
        userInfo: null,
        openid: null,
  },

  openidReadyCallback: null,

  onLaunch() {
    console.log('App Launching...');
    this.loginUser();
  },


  loginUser() {
    wx.login({
      success: res => {
        if (res.code) {
          request({
            url: '/login',
            method: 'POST',
            data: { code: res.code },
            requiresAuth: false
          })
          .then(loginRes => {
            console.log('[app.js] Login successful.');
            this.globalData.openid = loginRes.openid;
            wx.setStorageSync('token', loginRes.token);

            // --- REDIRECT LOGIC ---
            // IMPORTANT: This should match the COACH_OPENID on your backend
            const COACH_OPENID = 'oc5am7UF8nlgd-3LxJQrgMG84ews'; 
            
            if (loginRes.openid === COACH_OPENID) {
              // If user is the coach, go directly to their page
              wx.redirectTo({
                url: '/pages/coachBookings/coachBookings'
              });
            } else {
              // If user is a student, the app will load the index page normally.
              // We call the callback if a page is waiting for the openid.
              if (this.openidReadyCallback) {
                this.openidReadyCallback(this.globalData.openid);
              }
            }
          })
          .catch(err => {
            console.error('App.js: Backend login failed.', err);
            wx.showToast({ title: '登录失败', icon: 'none' });
          });
        } else {
          console.error('App.js: wx.login failed to get code.', res);
        }
      }
    });
  }


})