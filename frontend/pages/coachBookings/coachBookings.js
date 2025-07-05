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
    console.log('[coachBookings.js] Page loaded.'); // ADDED
    if (app.globalData.openid) {
      console.log('[coachBookings.js] OpenID was already available.'); // ADDED
      this.checkAuthorization(app.globalData.openid);
    } else {
      console.log('[coachBookings.js] OpenID not ready. Setting a callback.'); // ADDED
      app.openidReadyCallback = openid => {
        console.log('[coachBookings.js] openidReadyCallback has been executed.'); // ADDED
        if (openid) {
          this.checkAuthorization(openid);
        } else {
          this.handleAuthorizationFailure("登录失败");
        }
      };
    }
  },

  checkAuthorization(openid) {
    console.log("Current User's OpenID:", openid); 
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
      console.warn("fetchBookings called without authorization flag set.");
      return;
    }
    this.setData({ isLoading: true, errorMsg: null, bookings: [] });
    const dateToFetch = this.data.selectedDate;
    console.log(`Workspaceing bookings for date: ${dateToFetch}.`); // MODIFIED (from Log 9)

    request({
      url: `/api/coach/bookings?date=${dateToFetch}`,
      method: 'GET',
    })
    .then(apiResponseBookings => {
      console.log(`Received API response for bookings on ${dateToFetch}. Count: ${Array.isArray(apiResponseBookings) ? apiResponseBookings.length : 'N/A (not an array)'}`);


    if (Array.isArray(apiResponseBookings)) {
      const formattedBookings = apiResponseBookings.map(booking => {
        const startTimeShort = booking.startTime ? booking.startTime.substring(11, 16) : 'N/A';
        const endTimeShort = booking.endTime ? booking.endTime.substring(11, 16) : 'N/A';
        return {
            ...booking,
          displayStartTime: startTimeShort,
          displayEndTime: endTimeShort
        };
      });

        console.log(`Successfully fetched and formatted ${formattedBookings.length} bookings for ${dateToFetch}.`); // MODIFIED (from Log 11)
          this.setData({
          bookings: formattedBookings,
            isLoading: false
          });
        } else {
        console.error(`Invalid data format received for bookings on ${dateToFetch}:`, apiResponseBookings); // MODIFIED (from Log 13) to include date
      this.setData({ isLoading: false, errorMsg: '返回数据格式错误', bookings: [] });
        }
      })
      .catch(err => {
      console.error(`Failed to fetch bookings for date ${dateToFetch}:`, err); // MODIFIED (from Log 14) to include date
        this.setData({
          isLoading: false,
        errorMsg: err.message || '加载预约失败'
        });
      });
  },

  onDateChange(event) {
    if (event && event.detail) {
    const newDate = event.detail.value;

    this.setData({
      selectedDate: newDate
    });

      if (this.data.isCoach) {
        this.fetchBookings();
      } else {
        console.warn('Not calling fetchBookings in onDateChange because user is not authorized.'); // Log 5 - KEPT (context improved)
      }
    } else {
      console.error('onDateChange triggered but event or event.detail is undefined.'); // Log 6 - KEPT
    }
  },

  goToConfigPage() {
    wx.navigateTo({
      url: '/pages/coachConfig/coachConfig'
    });
  }
  // ... other methods like onCancelBooking if present ...
});