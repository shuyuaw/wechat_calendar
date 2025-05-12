// frontend/pages/coachConfig/coachConfig.js
const { request } = require('../../utils/request.js');
const app = getApp(); // Get app instance for potential global data access (like userInfo)

Page({
  /**
   * 页面的初始数据
   */
  data: {
    isLoading: true,
    errorMsg: null, // Add variable for error message
    coachConfig: { // Keep the structure for the actual data
      coachId: '',
      weeklyTemplate: {},
      sessionDurationMinutes: 0
    },
    weeklyTemplateStr: '' // Add variable for the string representation
  },

  onLoad(options) {
    this.loadCoachConfig();
  },

  loadCoachConfig() {
    console.log('Attempting to fetch coach config via API...');
    this.setData({ isLoading: true, errorMsg: null }); // Reset error on load

    request({
      url: '/api/coach/config',
      method: 'GET',
    })
    .then(res => {
      // Check if res itself is a valid object and has expected keys (e.g., coachId)
      if (res && res.coachId !== undefined) { // Check for a key property
          console.log('Successfully fetched coach config:', res);
          const templateString = JSON.stringify(res.weeklyTemplate, null, 2); // Define templateString
          this.setData({
            coachConfig: res, // Store the actual object
            weeklyTemplateStr: templateString, // Store the string version for the textarea
            isLoading: false
        });
        console.log('Page data updated:', this.data);
      } else {
        console.error('Received success status but data structure is unexpected:', res);
        this.setData({ isLoading: false, errorMsg: '获取配置数据格式错误' });
        // Removed toast as we now show message in WXML
        // wx.showToast({ title: '获取配置数据格式错误', icon: 'none' });
    }
  })
  .catch(err => {
    console.error('Failed to load coach config:', err);
    // Set an error message to be displayed in the WXML
    this.setData({
        isLoading: false,
        errorMsg: err.message || '加载配置失败，请检查网络连接' // Use message from request util or generic one
    });
  });
  },

  onSave() {
    console.log("onSave triggered");
  
    // 1. Get Current Values
    const duration = parseInt(this.data.coachConfig.sessionDurationMinutes, 10);
    const templateStr = this.data.weeklyTemplateStr;
  
    // --- Add logging ---
    console.log("Duration value:", duration);
    console.log("Template string from textarea:", JSON.stringify(templateStr)); // Log the raw string
  
    // 2. Validate Input
    if (isNaN(duration) || duration <= 0) {
      wx.showToast({ title: '辅导时长必须是正数', icon: 'none' });
      return;
    }
  
    let parsedTemplate;
    try {
      // --- Add check for empty/blank string ---
      if (!templateStr || templateStr.trim() === '') {
          // Handle empty template specifically, maybe default to empty object or show error
          // Option 1: Treat as empty schedule
          // parsedTemplate = {};
          // Option 2: Show error
           throw new Error("模板内容不能为空");
      }
      // --- End check ---
  
      parsedTemplate = JSON.parse(templateStr); // Attempt parsing
  
      // --- Basic Structure Validation (Keep this) ---
      if (typeof parsedTemplate !== 'object' || parsedTemplate === null || Array.isArray(parsedTemplate)) {
          throw new Error("模板必须是JSON对象格式");
      }
      const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      for (const day in parsedTemplate) {
          if (!days.includes(day)) throw new Error(`无效的星期名称: ${day}`);
          if (!Array.isArray(parsedTemplate[day])) throw new Error(`${day}的值必须是数组`);
          // Further validation for time formats can be added here
      }
       // Ensure all days are present, even if empty? (Optional, depends on backend requirement)
      // days.forEach(day => {
      //     if (!(day in parsedTemplate)) {
      //         parsedTemplate[day] = []; // Add missing days with empty array
      //     }
      // });
      // --- End Basic Structure Validation ---
  
    } catch (e) {
      console.error("Failed to parse weeklyTemplateStr:", e);
      wx.showToast({ title: `模板格式错误: ${e.message || '无效的JSON'}`, icon: 'none', duration: 3000 });
      return;
    }
  
    // 3. Prepare Data Payload
    const configToSave = {
      sessionDurationMinutes: duration,
      weeklyTemplate: parsedTemplate
    };
  
    console.log("Attempting to save config:", configToSave);
    wx.showLoading({ title: '保存中...' });
  
    // 4. Call Backend API
    request({
      url: '/api/coach/config',
      method: 'PUT',
      data: configToSave
    })
    .then(res => {
      console.log("Save successful:", res);
      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });
      // Optionally reload data
      // this.loadCoachConfig();
    })
    .catch(err => {
      console.error("Failed to save config:", err);
      wx.hideLoading();
      const errMsg = (err && err.response && err.response.data && err.response.data.message)
                     || err.message
                     || '保存失败，请稍后重试';
      wx.showToast({ title: errMsg, icon: 'none', duration: 3000 });
    });
  },

  onReady() {},

  onShow() {},

  onTemplateChange(event) {
    // console.log('Template input changed:', event.detail.value); // Optional: Log changes
    this.setData({
      weeklyTemplateStr: event.detail.value
    });
  },

  goToViewBookings() {
    wx.navigateTo({
      url: '/pages/coachBookings/coachBookings'
    });
  }
})