// frontend/pages/index/index.js
const app = getApp(); // Get the global app instance to access globalData

// Helper function to format Date object to 'YYYY-MM-DD' string
// (Can be moved to utils/util.js later if needed)
const formatDate = date => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Months are 0-indexed
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
};

Page({
    /**
     * Page initial data
     */
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
     * Lifecycle function--Called when page show
     * Also fetch slots here in case user navigates back to the page
     * after booking/cancellation elsewhere (though not strictly needed yet)
     */
    // onShow: function () {
    //   this.fetchAvailableSlots();
    // },

    /**
     * Fetch available slots for the current week
     */
    fetchAvailableSlots: function () {
        this.setData({ isLoading: true, error: null }); // Show loading state
        wx.showLoading({ title: '加载中...' });

        const today = new Date();
        const formattedDate = formatDate(today); // Get today's date as<y_bin_46>-MM-DD

        // Replace with your actual backend URL if different
        const apiUrl = `http://localhost:3001/api/slots/week?startDate=${formattedDate}`;

        // Corrected console log message
        console.log(`Workspaceing available slots for week starting around ${formattedDate}...`);

        wx.request({
            url: apiUrl,
            method: 'GET',
            success: (res) => {
                console.log('Received slots:', res.data);
                if (res.statusCode === 200 && Array.isArray(res.data)) {

                    // --- CORRECTED Formatting Logic ---
                    const formattedSlots = res.data.map(slot => {
                        try {
                            // Parse ISO strings into Date objects
                            const startDate = new Date(slot.startTime);
                            const endDate = new Date(slot.endTime);

                            // Format Date part (e.g.,<y_bin_46>-MM-DD)
                            const year = startDate.getFullYear();
                            const month = (startDate.getMonth() + 1).toString().padStart(2, '0');
                            const day = startDate.getDate().toString().padStart(2, '0');
                            const displayDate = `${year}-${month}-${day}`; // Calculate displayDate

                            // Format Time part (HH:MM - HH:MM)
                            const startHours = startDate.getHours().toString().padStart(2, '0');
                            const startMinutes = startDate.getMinutes().toString().padStart(2, '0');
                            const endHours = endDate.getHours().toString().padStart(2, '0');
                            const endMinutes = endDate.getMinutes().toString().padStart(2, '0');
                            const displayTime = `${startHours}:${startMinutes} - ${endHours}:${endMinutes}`; // Calculate displayTime

                            // Return BOTH displayDate and displayTime
                            return {
                                ...slot,
                                displayDate: displayDate, // Return displayDate
                                displayTime: displayTime  // Return displayTime
                              };
                        } catch (e) {
                            console.error("Error formatting time/date for slot:", slot, e);
                            // Also return both, even if invalid
                            return { ...slot, displayDate: 'Invalid Date', displayTime: 'Invalid Time' };
                        }
                    });
                    // --- End Formatting Logic ---

                    this.setData({
                        // Use the formatted data instead of the raw res.data
                        availableSlots: formattedSlots,
                        isLoading: false,
                    });
                } else {
                    // Handle cases where backend might return error or non-array
                    console.error('Failed to fetch slots or received invalid data:', res);
                    this.setData({ isLoading: false, error: '无法加载可用时段', availableSlots: [] });
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
     * Handles tapping on an available slot to book it.
     */
    handleBookSlot: function (event) {
        // Ensure we don't accidentally trigger while loading
        if (this.data.isLoading) {
            return;
        }

        const { slotId, startTime } = event.currentTarget.dataset; // Get slotId and startTime from data-* attributes
        const openid = app.globalData.openid; // Get openid stored during login

        console.log(`Attempting to book Slot ID: ${slotId} for User: ${openid}`);

        // 1. Check if user is logged in (openid available)
        if (!openid) {
            wx.showToast({
                title: '请先登录', // "Please login first"
                icon: 'none',
                duration: 2000
            });
            // Optionally redirect to a login page if you had one
            return;
        }

        // 2. Confirm with the user
        //    (Optional: Format startTime for better display in the modal)
        const formattedDisplayTime = startTime ? new Date(startTime).toLocaleString() : '这个时段'; // Basic formatting for modal
        wx.showModal({
            title: '确认预约',
            content: `您确定要预约 ${formattedDisplayTime} 吗？`, // "Are you sure you want to book the slot [startTime]?"
            success: (res) => {
                if (res.confirm) {
                    console.log('User confirmed booking for slot:', slotId);
                    // 3. User confirmed, proceed to call backend API
                    this.callCreateBookingApi(slotId, openid);
                } else if (res.cancel) {
                    console.log('User cancelled booking');
                }
            }
        });
    },

    /**
     * Helper function to call the backend booking API
     */
    callCreateBookingApi: function (slotId, userId) {
        wx.showLoading({ title: '正在预约...' }); // Show loading
        this.setData({ isLoading: true }); // Also set page loading state if desired

        // Replace with your actual backend URL if different
        const apiUrl = 'http://localhost:3001/api/bookings';

        wx.request({
            url: apiUrl,
            method: 'POST',
            data: {
                slotId: Number(slotId), // Ensure slotId is sent as a number
                userId: userId
            },
            success: (res) => {
                console.log('Booking API response:', res);
                if (res.statusCode === 201) { // 201 Created is the typical success code for POST
                    wx.showToast({ title: '预约成功!', icon: 'success', duration: 2000 });
                    // Refresh the slot list after successful booking
                    this.fetchAvailableSlots(); // Call fetch again
                } else if (res.statusCode === 409) { // 409 Conflict (Already booked)
                    wx.showToast({ title: '手慢了，时段已被预约', icon: 'none', duration: 2500 });
                    // Refresh the list to show the updated status
                    this.fetchAvailableSlots(); // Call fetch again
                } else {
                    // Other errors from backend
                    const errorMsg = res.data && res.data.error ? res.data.error : '请稍后重试';
                    console.error('Booking failed with status:', res.statusCode, 'data:', res.data);
                    wx.showToast({ title: `预约失败: ${errorMsg}`, icon: 'none', duration: 2500 });
                    this.setData({ isLoading: false }); // Reset loading state on error
                }
            },
            fail: (err) => {
                console.error('wx.request failed (booking):', err);
                wx.showToast({ title: '网络错误，预约失败', icon: 'none', duration: 2000 });
                this.setData({ isLoading: false }); // Reset loading state on error
            },
            complete: () => {
                // isLoading might already be false from success/error, but ensure hideLoading is called
                wx.hideLoading();
                // Ensure isLoading is reset if not already done in success/fail
                if(this.data.isLoading) {
                    this.setData({ isLoading: false });
                }
            }
        });
    }

    // Add other methods like onPullDownRefresh if needed:
    // onPullDownRefresh: function() {
    //   this.fetchAvailableSlots(() => {
    //     wx.stopPullDownRefresh(); // Stop the refresh animation
    //   });
    // }
})