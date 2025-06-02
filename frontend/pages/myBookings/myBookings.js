// frontend/pages/myBookings/myBookings.js
const { request } = require('../../utils/request.js'); // Adjusted path assuming utils is in the root of the project, or ../../utils if utils is sibling to pages
const app = getApp();

// Helper function (can be moved to utils.js)
const formatBookingTime = (isoString) => {
  if (!isoString) return 'N/A';
  try {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    // Example format: YYYY-MM-DD HH:MM
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  } catch (e) {
    console.error("Error formatting date:", e);
    return isoString; // Return original if error
  }
};


Page({

  /**
   * Page initial data
   */
  data: {
    myBookings: [],
    // MODIFIED: Start with loading true, as we will fetch in onShow
    isLoading: true,
    error: null,
    // Store openid here if needed, though fetching from global is fine
    // openid: null
  },

  /**
   * Lifecycle function--Called when page show
   * Use onShow to refresh data every time the page appears
   */
  // MODIFIED: Replaced onShow with new logic
  onShow: function () {
    console.log('MyBookings page shown. Checking for OpenID...');
    this.setData({ isLoading: true, myBookings: [], error: null }); // Reset on show

    // Function to attempt fetching bookings once OpenID is confirmed
    const attemptFetchBookings = () => {
      if (app.globalData.openid) {
        console.log('OpenID is now available:', app.globalData.openid, 'Fetching bookings.');
        this.fetchMyBookings();
      } else {
        // This case should ideally be rare if checkOpenIDReady handles it
        console.error('OpenID still not available after checks.');
        this.setData({ error: '用户登录状态获取失败', isLoading: false });
        wx.showToast({ title: '登录状态异常', icon: 'none' });
      }
    };

    // Check if OpenID is ready, if not, poll for a short period
    if (app.globalData.openid) {
      console.log('OpenID immediately available in onShow.');
      attemptFetchBookings();
    } else {
      console.log('OpenID not immediately available. Polling...');
      let attempts = 0;
      const maxAttempts = 10; // Try for 5 seconds (10 * 500ms)
      const intervalId = setInterval(() => {
        attempts++;
        if (app.globalData.openid) {
          clearInterval(intervalId);
          attemptFetchBookings();
        } else if (attempts >= maxAttempts) {
          clearInterval(intervalId);
          console.error('OpenID not available after polling.');
          this.setData({ error: '用户登录超时', isLoading: false });
          wx.showToast({ title: '登录超时', icon: 'none' });
        } else {
          console.log(`Polling for OpenID, attempt ${attempts}`);
        }
      }, 500); // Check every 500ms
    }
  },

  /**
   * Fetch user's upcoming confirmed bookings
   */
  fetchMyBookings: function() {
    // MODIFIED: Ensure isLoading is set to true at the start if not already
    if (!this.data.isLoading) {
        this.setData({ isLoading: true, error: null });
    }
    // wx.showLoading({ title: '加载中...' }); // This is handled by isLoading state or can be added if preferred

    // The request utility should handle adding the base URL and Authorization header.
    // The backend controller for '/api/bookings/mine/upcoming'
    // MUST use the authenticated user's ID (e.g., req.user.openid)
    // to fetch the correct bookings.
    request({
      url: '/api/bookings/mine/upcoming', // Relative path, base URL is in request.js
      method: 'GET'
      // requiresAuth defaults to true in the request utility, so token will be sent
    })
    .then(apiResponseBookings => { // apiResponseBookings is the data part from the successful response
      console.log('Fetched my bookings:', apiResponseBookings);
      if (Array.isArray(apiResponseBookings)) {
        const formattedBookings = apiResponseBookings.map(booking => ({
          ...booking,
          // Ensure 'bookingId' from API response or '_id' from DB is consistently used.
          // If API returns `_id` (common for MongoDB), use booking._id.
          // If API returns `bookingId` (as seen in previous logs), use booking.bookingId.
          // The key in WXML and data-attribute should match this.
          id: booking.bookingId || booking._id, // Use 'id' as a consistent property for the template
          displayStart: formatBookingTime(booking.startTime),
          displayEnd: formatBookingTime(booking.endTime)
        }));
        this.setData({ myBookings: formattedBookings, isLoading: false });
      } else {
        // This case might occur if the backend returns an object instead of an array on success,
        // or if the data isn't in the expected format.
        console.error("Failed to fetch bookings or invalid data format. Expected array, got:", apiResponseBookings);
        this.setData({ isLoading: false, error: '无法加载预约列表', myBookings: [] });
        wx.showToast({ title: '加载失败: 格式错误', icon: 'error' });
      }
    })
    .catch(err => {
      console.error("Error fetching bookings:", err);
      // The request utility should ideally return an error object with a 'message' property.
      // It might also handle showing a generic toast for network errors.
      this.setData({
        isLoading: false,
        error: err.message || '网络错误，无法加载预约',
        myBookings: []
      });
      // Toast can be redundant if request utility already shows one for major failures.
      // wx.showToast({ title: err.message || '网络错误', icon: 'none' });
    })
    .finally(() => {
      // MODIFIED: isLoading is set to false in .then() and .catch()
      // wx.hideLoading(); // Only use if wx.showLoading was called
      if (wx.hideLoading) { // Check if function exists before calling
        wx.hideLoading();
      }
    });
  },

/**
   * Handles cancellation button tap
   */
  handleCancelBooking: function(event) {
    const { bookingid } = event.currentTarget.dataset; // Use all lowercase
    // const bookingId = event.currentTarget.dataset.bookingid; // Alternative way

    if (bookingid === undefined) {
      console.error("Cancel button tapped, bookingid not found in dataset:", event.currentTarget.dataset);
      return;
    }

    wx.showModal({
      title: '取消预约',
      content: '您确定要取消这个预约吗？',
      success: (res) => {
        if (res.confirm) {
          console.log('User confirmed cancellation for booking ID:', bookingid);
          this.callCancelBookingApi(bookingid);
        } else if (res.cancel) {
          console.log('User cancelled the cancellation action');
        }
      }
    })
  },

  /**
   * Helper function to call the backend DELETE booking API
   */
  callCancelBookingApi: function(bookingId) {
    wx.showLoading({ title: '正在取消...' });
    this.setData({ isLoading: true }); // Optional: use page loading state for more feedback

    request({
      url: `/api/bookings/${bookingId}`, // Relative path; bookingId is part of the path
      method: 'DELETE'
    })
    .then(response => { 
      console.log('Cancel API response:', response);
      wx.showToast({ title: '取消成功', icon: 'success' });
      this.fetchMyBookings(); 
    })
    .catch(err => {
      console.error('Cancellation failed:', err);
      this.setData({ isLoading: false }); 
      const errorMsg = (err && err.data && err.data.error) || err.message || '请稍后重试';
      wx.showToast({ title: `取消失败: ${errorMsg}`, icon: 'none', duration: 2500 });
    })
    .finally(() => {
      wx.hideLoading();
      if(this.data.isLoading) {
           this.setData({ isLoading: false });
      }
    });
  },

  /**
   * Optional: Pull-down refresh
   */
  onPullDownRefresh: function () {
    if (this.data.isLoading) return; 
    console.log("Pull down to refresh triggered.");
    // MODIFIED: Ensure fetchMyBookings is called correctly and isLoading state is managed
    this.setData({ isLoading: true, error: null }); // Set loading state before fetching
    this.fetchMyBookings()
        .finally(() => { // Assuming fetchMyBookings returns a promise
            wx.stopPullDownRefresh();
        });
    // If fetchMyBookings doesn't return a promise or if you prefer simpler logic:
    // this.fetchMyBookings();
    // setTimeout(() => { // This timeout might be removed if .finally handles it well
    //     wx.stopPullDownRefresh();
    // }, 1000);
  }
})