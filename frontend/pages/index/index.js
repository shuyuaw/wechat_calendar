// frontend/pages/index/index.js

// Helper function to format Date object to 'YYYY-MM-DD' string
// (Can be moved to utils/util.js later if needed)
const formatDate = date => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Months are 0-indexed
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  Page({
    data: {
      availableSlots: [], // Initialize empty array to hold slots
      isLoading: false,
      error: null,
    },
  
    /**
     * Lifecycle function--Called when page load
     */
    onLoad: function (options) {
      console.log('Index page loaded');
      this.fetchAvailableSlots(); // Fetch slots when page loads
    },
  
    /**
     * Fetch available slots for the current week
     */
    fetchAvailableSlots: function () {
      this.setData({ isLoading: true, error: null }); // Show loading state
      wx.showLoading({ title: '加载中...' });
  
      const today = new Date();
      const formattedDate = formatDate(today); // Get today's date as YYYY-MM-DD
  
      // Replace with your actual backend URL
      const apiUrl = `http://localhost:3001/api/slots/week?startDate=${formattedDate}`;
  
      console.log(`Workspaceing available slots for week starting around ${formattedDate}...`);
  
      wx.request({
        url: apiUrl,
        method: 'GET',
        success: (res) => {
          console.log('Received slots:', res.data);
          if (res.statusCode === 200 && Array.isArray(res.data)) {
            // TODO: Format startTime/endTime for better display later
            this.setData({
              availableSlots: res.data,
              isLoading: false,
            });
          } else {
            console.error('Failed to fetch slots or received invalid data:', res);
            this.setData({
              isLoading: false,
              error: '无法加载可用时段',
              availableSlots: []
            });
            wx.showToast({ title: '加载失败', icon: 'error' });
          }
        },
        fail: (err) => {
          console.error('wx.request failed:', err);
          this.setData({
            isLoading: false,
            error: '网络错误，请稍后重试',
            availableSlots: []
          });
          wx.showToast({ title: '网络错误', icon: 'none' });
        },
        complete: () => {
          wx.hideLoading(); // Hide loading indicator regardless of success/failure
        }
      });
    },
  
    /**
     * Placeholder function for handling slot booking tap
     * We will implement this next.
     */
    handleBookSlot: function (event) {
      const slotId = event.currentTarget.dataset.slotId;
      console.log('User tapped slot with ID:', slotId);
      // TODO: Implement booking logic (show confirmation, call booking API)
      wx.showToast({ title: `预定 Slot ${slotId} (待实现)`, icon: 'none' });
    },
  
    // Other page methods can go here (onShow, onPullDownRefresh, etc.)
  })