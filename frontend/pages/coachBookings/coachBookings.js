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
    console.log('--- fetchBookings function started ---'); // Log 8
    if (!this.data.isCoach) {
      console.warn("fetchBookings called without authorization flag set.");
      return;
    }
    this.setData({ isLoading: true, errorMsg: null, bookings: [] });
    const dateToFetch = this.data.selectedDate;
    console.log(`Log 9: Fetching bookings for date (read from this.data.selectedDate): ${dateToFetch}. Making request call next...`);

    request({
      url: `/api/coach/bookings?date=${dateToFetch}`,
      method: 'GET',
    })
  .then(apiResponseBookings => { // Renamed 'res' to 'apiResponseBookings' for clarity
    console.log('Log 10: Raw response received in fetchBookings:', JSON.stringify(apiResponseBookings));

    if (Array.isArray(apiResponseBookings)) {
      // --- Format the times for display ---
      const formattedBookings = apiResponseBookings.map(booking => {
        // Basic time extraction (assumes YYYY-MM-DDTHH:MM:SS format)
        const startTimeShort = booking.startTime ? booking.startTime.substring(11, 16) : 'N/A';
        const endTimeShort = booking.endTime ? booking.endTime.substring(11, 16) : 'N/A';
        return {
          ...booking, // Keep all original booking properties
          displayStartTime: startTimeShort,
          displayEndTime: endTimeShort
        };
      });
      // --- End formatting ---

      console.log(`Log 11: Successfully fetched and formatted ${formattedBookings.length} bookings. Data:`, formattedBookings);
          this.setData({
        bookings: formattedBookings, // Use the new array with formatted times
            isLoading: false
          });
        console.log('Log 12: this.data.bookings after setData:', this.data.bookings);
        } else {
      console.error("Log 13: Invalid data format received for bookings:", apiResponseBookings);
      this.setData({ isLoading: false, errorMsg: '返回数据格式错误', bookings: [] });
        }
      })
      .catch(err => {
      console.error("Log 14: Failed to fetch bookings:", err);
        this.setData({
          isLoading: false,
        errorMsg: err.message || '加载预约失败'
        });
      });
  },

  onDateChange(event) {
    console.log('--- onDateChange function started ---'); // Log 1
    if (event && event.detail) {
    const newDate = event.detail.value;
      console.log(`Log 2: Date selected in picker (event.detail.value): ${newDate}`);

    this.setData({
      selectedDate: newDate
    });
      console.log(`Log 3: this.data.selectedDate IMMEDIATELY after setData: ${this.data.selectedDate}`);

      if (this.data.isCoach) {
        console.log('Log 4: Calling fetchBookings from onDateChange...');
        this.fetchBookings(); // Call fetchBookings
      } else {
        console.warn('Log 5: Not calling fetchBookings in onDateChange because not authorized.');
      }
    } else {
      console.error('Log 6: onDateChange triggered but event or event.detail is undefined.');
    }
    console.log('--- onDateChange function ended ---'); // Log 7
  },

  goToConfigPage() {
    wx.navigateTo({
      url: '/pages/coachConfig/coachConfig'
    });
  }
  // ... other methods like onCancelBooking if present ...
});
