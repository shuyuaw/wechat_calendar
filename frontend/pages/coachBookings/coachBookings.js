const { request } = require('../../utils/request.js');
const app = getApp();
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const DESIGNATED_COACH_OPENID = 'oc5am7UF8nlgd-3LxJQrgMG84ews';

Page({
  data: {
    selectedDate: formatDate(new Date()),
    bookings: [],
    isLoading: false,
    errorMsg: null,
    isCoach: false,
    openid: null
  },

  onLoad(options) {
    if (app.globalData.openid) {
      this.checkAuthorization(app.globalData.openid);
    } else {
      app.openidReadyCallback = openid => {
        if (openid) {
          this.checkAuthorization(openid);
        } else {
          this.handleAuthorizationFailure("登录失败");
        }
      };
      if (!app.globalData.openid) {
        // It's generally good practice to inform the user or log critical warnings
        // if something essential like login might have failed.
        // However, per your request, all console logs are removed.
        // Consider if any critical error logging should be retained or handled differently.
      }
    }
  },

  checkAuthorization(openid) {
    if (openid === DESIGNATED_COACH_OPENID) {
      this.setData({
        isCoach: true,
        openid: openid
      });
      this.fetchBookings();
    } else {
      this.handleAuthorizationFailure("您没有权限查看此页面");
    }
  },

  handleAuthorizationFailure(message) {
    this.setData({
      isLoading: false,
      errorMsg: message,
      isCoach: false,
      bookings: []
    });
    wx.showToast({
      title: message,
      icon: 'none',
      duration: 2000
    });
  },

  fetchBookings() {
    if (!this.data.isCoach) {
      return;
    }

    this.setData({ isLoading: true, errorMsg: null, bookings: [] });
    const date = this.data.selectedDate;

    request({
      url: `/api/coach/bookings?date=${date}`,
      method: 'GET',
    })
      .then(res => {
        if (Array.isArray(res)) {
          this.setData({
            bookings: res,
            isLoading: false
          });
        } else {
          this.setData({ isLoading: false, errorMsg: '返回数据格式错误' });
        }
      })
      .catch(err => {
        this.setData({
          isLoading: false,
          errorMsg: `加载失败: ${err.errMsg || '请稍后重试'}`,
          bookings: []
        });
        wx.showToast({
          title: `加载失败: ${err.errMsg || '网络错误'}`,
          icon: 'none',
          duration: 2000
        });
      });
  },

  onDateChange(event) {
    const newDate = event.detail.value;
    this.setData({
      selectedDate: newDate
    });
    this.fetchBookings();
  },

})