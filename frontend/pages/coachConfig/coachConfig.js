// frontend/pages/coachConfig/coachConfig.js
const { request } = require('../../utils/request.js');
const app = getApp(); // Get app instance for potential global data access (like userInfo)

Page({
  /**
   * 页面的初始数据
   */
  data: {
    sessionDurationMinutes: null,
    weeklyTemplate: {}, // Store the template as an object
    weeklyTemplateStr: '', // For temporary display in textarea
    loading: false,
    error: null,
    isCoach: false, // Flag to control access
    coachConfig: { // Initialize with expected structure
      coachId: '',
      weeklyTemplate: {},
      sessionDurationMinutes: 0
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    // **TODO: Implement Coach Authorization Check**
    // Example: Check if the logged-in user is the designated coach
    // const userInfo = wx.getStorageSync('userInfo'); // Or however you store user info
    // const designatedCoachId = 'COACH_OPENID_OR_ID'; // Replace with actual coach identifier
    // if (!userInfo || userInfo.openid !== designatedCoachId) {
    //   wx.showToast({ title: '无权访问', icon: 'error' });
    //   wx.navigateBack(); // Or redirect to index
    //   return;
    // }
    this.setData({ isCoach: true }); // Assume authorized for now

    // Fetch current config when page loads
    this.loadCoachConfig();
  },

  // Function to load coach configuration from backend
  loadCoachConfig() {
    console.log('Attempting to fetch coach config via API...');
    this.setData({ isLoading: true });

    request({
      url: '/api/coach/config',
      method: 'GET',
    })
    .then(res => {
      // Check if res itself is a valid object and has expected keys (e.g., coachId)
      if (res && res.coachId !== undefined) { // Check for a key property
          console.log('Successfully fetched coach config:', res);
          this.setData({
              coachConfig: res, // Use res directly as it IS the data
              isLoading: false
          });
          console.log('Page data updated with coachConfig:', this.data.coachConfig);
      } else {
          // Handle cases where API returned 200 OK but data might be missing/malformed
          console.error('Received success status but data structure is unexpected:', res);
          this.setData({ isLoading: false });
          wx.showToast({ title: '获取配置数据格式错误', icon: 'none' });
      }
  })
  .catch(err => {
      // Error handling remains the same
      console.error('Failed to load coach config:', err);
      this.setData({ isLoading: false });
      // Toast might already be shown by request.js
  });
  },

  // Function to handle saving the configuration
  onSave() {
    if (!this.data.isCoach) return; // Don't save if not authorized

    this.setData({ loading: true, error: null });

    let weeklyTemplateObj;
    try {
      // Convert the string back to an object for sending
      // **Important**: Add validation here if using textarea directly!
      weeklyTemplateObj = JSON.parse(this.data.weeklyTemplateStr || '{}');
    } catch (e) {
      wx.showToast({ title: '模板格式错误', icon: 'error' });
      this.setData({ loading: false, error: '模板JSON格式无效' });
      return;
    }

    const configData = {
      sessionDurationMinutes: parseInt(this.data.sessionDurationMinutes, 10), // Ensure it's a number
      weeklyTemplate: weeklyTemplateObj
    };

    // **TODO: Call Backend API PUT /api/coach/config**
    // Replace with your actual request function call
    console.log("Saving coach config:", configData);
    // Example using a hypothetical request function:
    // request({ url: '/api/coach/config', method: 'PUT', data: configData })
    //   .then(res => {
    //     if (res.success) {
    //       this.setData({ loading: false });
    //       wx.showToast({ title: '保存成功', icon: 'success' });
    //       // Optionally navigate back or refresh something
    //     } else {
    //       throw new Error(res.message || '未能保存配置');
    //     }
    //   })
    //   .catch(err => {
    //     this.setData({ error: err.message || '保存失败', loading: false });
    //     wx.showToast({ title: '保存失败', icon: 'error' });
    //   });

    // **Temporary Placeholder Action** (Remove when API call is implemented)
     setTimeout(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '保存成功 (模拟)', icon: 'success' });
      console.log("Simulated save successful.");
    }, 500); // Simulate network delay
  },

  // Helper function to update weeklyTemplateStr when textarea changes
  // Note: This requires using `model:value` in WXML for the textarea
  // If not using `model:value`, you'd use a bindinput handler
  // bindinput="onTemplateInputChange"
  /*
  onTemplateInputChange(e) {
    this.setData({
      weeklyTemplateStr: e.detail.value
    })
  }
  */

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {},

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {},

  // ... other lifecycle methods
})