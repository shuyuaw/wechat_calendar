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
    this.setData({ isLoading: true, errorMsg: null }); // Reset error on load

    request({
      url: '/api/coach/config',
      method: 'GET',
    })
    .then(res => {
      if (res && res.coachId !== undefined) {
        console.log('Successfully fetched coach config.'); // Simplified log
        const templateString = JSON.stringify(res.weeklyTemplate, null, 2);
          this.setData({
          coachConfig: res,
          weeklyTemplateStr: templateString,
            isLoading: false
        });
      } else {
        console.error('Received success status but data structure is unexpected:', res);
        this.setData({ isLoading: false, errorMsg: '获取配置数据格式错误' });
    }
  })
  .catch(err => {
    console.error('Failed to load coach config:', err);
    this.setData({
        isLoading: false,
        errorMsg: err.message || '加载配置失败，请检查网络连接'
    });
  });
  },

  onSave() {
  
    const duration = parseInt(this.data.coachConfig.sessionDurationMinutes, 10);
    const templateStr = this.data.weeklyTemplateStr;
      if (isNaN(duration) || duration <= 0) {
      wx.showToast({ title: '辅导时长必须是正数', icon: 'none' });
      return;
    }
  
    let parsedTemplate;
    try {
      if (!templateStr || templateStr.trim() === '') {
           throw new Error("模板内容不能为空");
      }
      parsedTemplate = JSON.parse(templateStr);
  
      if (typeof parsedTemplate !== 'object' || parsedTemplate === null || Array.isArray(parsedTemplate)) {
          throw new Error("模板必须是JSON对象格式");
      }
      const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      for (const day in parsedTemplate) {
          if (!days.includes(day)) throw new Error(`无效的星期名称: ${day}`);
          if (!Array.isArray(parsedTemplate[day])) throw new Error(`${day}的值必须是数组`);
      }
    } catch (e) {
      console.error("Failed to parse weeklyTemplateStr for saving:", e); // Specified context
      wx.showToast({ title: `模板格式错误: ${e.message || '无效的JSON'}`, icon: 'none', duration: 3000 });
      return;
    }
  
    const configToSave = {
      sessionDurationMinutes: duration,
      weeklyTemplate: parsedTemplate
    };
  
    console.log("Attempting to save coach config:", configToSave); // Kept for debugging payload issues
    wx.showLoading({ title: '保存中...' });
  
    request({
      url: '/api/coach/config',
      method: 'PUT',
      data: configToSave
    })
    .then(res => {
      console.log("Coach config saved successfully."); // Simplified log, removed 'res'
      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });
      // Optionally reload data
      // this.loadCoachConfig();
    })
    .catch(err => {
      console.error("Failed to save coach config:", err);
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