// frontend/pages/myBookings/myBookings.js
const app = getApp(); // Get the global app instance

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
    isLoading: false,
    error: null,
    // Store openid here if needed, though fetching from global is fine
    // openid: null
  },

  /**
   * Lifecycle function--Called when page show
   * Use onShow to refresh data every time the page appears
   */
  onShow: function () {
    console.log('MyBookings page shown');
    // Ensure user openid is available before fetching
    if (app.globalData.openid) {
        // If openid is already available, fetch bookings directly
        console.log('OpenID already available, fetching bookings.');
        this.fetchMyBookings();
      } else {
        // If openid is not yet available, set up a callback
        // The callback will be executed by app.js when login completes
        console.log('OpenID not ready, setting callback.');
        app.openidReadyCallback = openid => { // Use arrow function to maintain 'this' context
            console.log('OpenID ready callback executed in MyBookings.');
            if (openid) {
              this.fetchMyBookings();
            } else {
              // Handle case where login might ultimately fail
               this.setData({ error: '用户登录失败', myBookings: []});
               wx.showToast({ title: '用户登录失败', icon: 'none' });
            }
        }
        // Optionally, still show a loading state while waiting for login?
        // this.setData({ isLoading: true });
      }
  },

  /**
   * Fetch user's upcoming confirmed bookings
   */
  fetchMyBookings: function() {
    this.setData({ isLoading: true, error: null });
    wx.showLoading({ title: '加载中...' });

    // Note: The backend currently uses a hardcoded userId ('test_user_openid_123')
    //       in the getMyUpcomingBookings controller.
    //       So this API call will fetch bookings for that test user,
    //       regardless of the actual app.globalData.openid value for now.
    //       This needs to be fixed when proper backend auth is implemented.
    const apiUrl = 'http://localhost:3001/api/bookings/mine/upcoming';

    wx.request({
      url: apiUrl,
      method: 'GET',
      // TODO: Send actual authentication (e.g., JWT token) in header later
      // header: { 'Authorization': 'Bearer ' + token }
      success: (res) => {
        if (res.statusCode === 200 && Array.isArray(res.data)) {
          // Format times for display
          const formattedBookings = res.data.map(booking => ({
            ...booking,
            displayStart: formatBookingTime(booking.startTime),
            displayEnd: formatBookingTime(booking.endTime)
          }));
          this.setData({ myBookings: formattedBookings, isLoading: false });
        } else {
          console.error("Failed to fetch bookings:", res);
          this.setData({ isLoading: false, error: '无法加载预约列表' });
          wx.showToast({ title: '加载失败', icon: 'error' });
        }
      },
      fail: (err) => {
        console.error("Error fetching bookings:", err);
        this.setData({ isLoading: false, error: '网络错误' });
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  },

/**
   * Handles cancellation button tap
   */
handleCancelBooking: function(event) {
    const { bookingId } = event.currentTarget.dataset; // Get bookingId from data-* attribute

    if (bookingId === undefined) {
      console.error("Cancel button tapped without bookingId");
      return;
    }

    const bookingIdNum = parseInt(bookingId, 10);
    if (isNaN(bookingIdNum)) {
        console.error("Invalid bookingId passed to cancel handler:", bookingId);
        return;
    }

    // Confirm with the user first
    wx.showModal({
      title: '取消预约',
      content: '您确定要取消这个预约吗？', // "Are you sure you want to cancel this booking?"
      success: (res) => {
        if (res.confirm) {
          console.log('User confirmed cancellation for booking ID:', bookingIdNum);
          // Proceed with calling the cancellation API
          this.callCancelBookingApi(bookingIdNum);
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
    this.setData({ isLoading: true }); // Optional: use page loading state

    // Construct the URL with the booking ID
    // Replace with your actual backend URL if different
    const apiUrl = `http://localhost:3001/api/bookings/${bookingId}`;

    wx.request({
      url: apiUrl,
      method: 'DELETE',
      // TODO: Add Authorization header with user's token/session info here
      // header: { 'Authorization': 'Bearer ' + token }
      success: (res) => {
        console.log('Cancel API response:', res);
        if (res.statusCode === 200) { // Backend returns 200 OK on successful delete
          wx.showToast({ title: '取消成功', icon: 'success' });
          // Refresh the list of bookings after cancellation
          this.fetchMyBookings();
        } else {
          // Handle errors like 403 Forbidden, 404 Not Found, 500 Server Error
          const errorMsg = res.data && res.data.error ? res.data.error : '请稍后重试';
          console.error('Cancellation failed:', res);
          wx.showToast({ title: `取消失败: ${errorMsg}`, icon: 'none', duration: 2500 });
          this.setData({ isLoading: false }); // Reset loading state on error
        }
      },
      fail: (err) => {
        console.error('wx.request failed (cancel):', err);
        wx.showToast({ title: '网络错误，取消失败', icon: 'none' });
        this.setData({ isLoading: false });
      },
      complete: () => {
        wx.hideLoading();
        // Ensure loading state is reset if it was set
        // this.setData({ isLoading: false });
      }
    });
  },

  /**
   * Optional: Pull-down refresh
   */
  onPullDownRefresh: function () {
    this.fetchMyBookings();
    // Remember to call wx.stopPullDownRefresh() in the complete callback of wx.request
    // inside fetchMyBookings if you implement this fully.
    // For now, just stop it immediately
    wx.stopPullDownRefresh();
  }
})