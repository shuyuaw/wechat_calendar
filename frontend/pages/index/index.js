// frontend/pages/index/index.js
const { request } = require('../../utils/request.js'); // Adjust path if needed
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
        groupedSlots: [], // ADDED: To hold slots grouped by date
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
        const formattedDate = formatDate(today); // Get today's date as YYYY-MM-DD

        // Replace with your actual backend URL if different
        const apiUrl = `http://localhost:3001/api/slots/week?startDate=${formattedDate}`;

        // Corrected console log message
        console.log(`Fetching available slots for week starting around ${formattedDate}...`); // MODIFIED: Corrected "Workspaceing" to "Fetching"

        wx.request({
            url: apiUrl,
            method: 'GET',
            success: (res) => {
                console.log('Received slots:', res.data);
                if (res.statusCode === 200 && Array.isArray(res.data)) {

                    // --- CORRECTED Formatting Logic ---
                    const weekDays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
                    const formattedSlots = res.data.map(slot => {
                        try {
                            // Parse ISO strings into Date objects
                            const startDate = new Date(slot.startTime);
                            const endDate = new Date(slot.endTime);

                            // Format Date part (e.g., YYYY-MM-DD)
                            const year = startDate.getFullYear();
                            const month = (startDate.getMonth() + 1).toString().padStart(2, '0');
                            const day = startDate.getDate().toString().padStart(2, '0');
                            const dayOfWeek = weekDays[startDate.getDay()];
                            const displayDate = `${year}-${month}-${day} ${dayOfWeek}`; // Calculate displayDate

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

                    // --- ADDED: Logic to group slots by date ---
                    const grouped = formattedSlots.reduce((acc, slot) => {
                        // Find an existing group for the date
                        const group = acc.find(g => g.date === slot.displayDate);
                        if (group) {
                            // Add the slot to the existing group
                            group.slots.push(slot);
                        } else {
                            // Create a new group for the date
                            acc.push({
                                date: slot.displayDate,
                                slots: [slot]
                            });
                        }
                        return acc;
                    }, []);
                    // --- End of Grouping Logic ---

                    this.setData({
                        // Use the formatted data instead of the raw res.data
                        availableSlots: formattedSlots,
                        groupedSlots: grouped, // Set the new grouped data
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
    // ****** MODIFIED METHOD: handleBookSlot ******
    handleBookSlot: function (event) {
        if (this.data.isLoading) return;

        const { slotId, startTime } = event.currentTarget.dataset;
        const openid = app.globalData.openid;
        const userInfo = app.globalData.userInfo;

        if (!openid) {
          wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }

        // Check if user's nickname is available
        if (!userInfo || !userInfo.nickName) {
            wx.showModal({
                title: '需要您的微信昵称',
                content: '为了更好地为您服务，请授权获取您的微信昵称。',
                confirmText: '去授权',
                cancelText: '取消',
                success: (modalRes) => {
                    if (modalRes.confirm) {
                        wx.getUserProfile({
                            desc: '用于预约时显示您的昵称', // Declaration for the user
                            success: profileRes => {
                                console.log('[index.js] User profile obtained:', profileRes.userInfo);
                                app.globalData.userInfo = profileRes.userInfo; // Update global user info

                                // Send updated user info to backend (login API handles update)
                                wx.request({
                                    url: 'http://localhost:3001/api/login', // Use your actual backend URL
                                    method: 'POST',
                                    data: {
                                        code: null, // No new code needed, just update user info
                                        openid: openid, // Pass existing openid
                                        userInfo: profileRes.userInfo
                                    },
                                    success: (backendRes) => {
                                        if (backendRes.statusCode === 200) {
                                            console.log('User info updated on backend. Proceeding with booking.');
                                            this.proceedWithBooking(slotId, startTime, openid);
                                        } else {
                                            console.error('Failed to update user info on backend:', backendRes);
                                            wx.showToast({ title: '更新信息失败，请重试', icon: 'none' });
                                        }
                                    },
                                    fail: (err) => {
                                        console.error('Request to update user info failed:', err);
                                        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
                                    }
                                });
                            },
                            fail: profileErr => {
                                console.error('[index.js] wx.getUserProfile failed:', profileErr);
                                wx.showToast({ title: '获取昵称失败，无法预约', icon: 'none' });
                            }
                        });
                    } else if (modalRes.cancel) {
                        wx.showToast({ title: '取消预约', icon: 'none' });
                    }
                }
            });
            return; // Stop here if nickname is not available
        }

        // If nickname is available, proceed with booking
        this.proceedWithBooking(slotId, startTime, openid);
    },

    // New helper function to encapsulate the booking logic
    proceedWithBooking: function(slotId, startTime, openid) {
        const formattedDisplayTime = startTime ? new Date(startTime).toLocaleString() : '这个时段';
        wx.showModal({
            title: '确认预约',
            content: `您确定要预约 ${formattedDisplayTime} 吗？`,
            success: (res) => {
                if (res.confirm) {
                    console.log('User confirmed booking for slot:', slotId);

                    const tmplId_booking_confirmation = 'Bai8NNhUQlXdOJaMrMIUv5bblC_W7wb9w3G9c-Ylip0';
                    const tmplId_booking_reminder = 'YUu-DQjYHd8zUmQdgR5k98fhV7ojQsDYkX_lL-5pfB0';

                    wx.requestSubscribeMessage({
                        tmplIds: [tmplId_booking_confirmation, tmplId_booking_reminder],
                        success: (subscribeRes) => {
                            console.log('wx.requestSubscribeMessage success:', subscribeRes);
                            if (subscribeRes[tmplId_booking_confirmation] === 'accept') {
                                console.log('用户接受了预约成功通知');
                            }
                            if (subscribeRes[tmplId_reminder] === 'accept') {
                                console.log('用户接受了预约提醒通知');
                            }
                        },
                        fail: (subscribeErr) => {
                            console.error('wx.requestSubscribeMessage fail:', subscribeErr);
                        },
                        complete: () => {
                            console.log('Proceeding to callCreateBookingApi for slot:', slotId);
                            this.callCreateBookingApi(slotId, openid);
                        }
                    });
                } else if (res.cancel) {
                    console.log('User cancelled booking action');
                }
            }
        });
    },
    // ****** END OF MODIFIED METHOD: handleBookSlot ******

    /**
     * Helper function to call the backend booking API
     */
    // ****** MODIFIED METHOD: callCreateBookingApi ******
    callCreateBookingApi: function (slotId, userId) {
        wx.showLoading({ title: '正在预约...' });
        this.setData({ isLoading: true }); // Set loading true for the API call duration

        request({
            url: '/api/bookings',
            method: 'POST',
            data: {
                slotId: Number(slotId),
                userId: userId // Ensure backend uses token's openid for actual userId persistence
            },
        })
        .then(response => {
            console.log('Booking API response:', response);
            wx.hideLoading(); // Hide loading from this API call
            wx.showToast({ title: '预约成功!', icon: 'success', duration: 2000 });

            // Refresh slots AFTER the success toast has had a moment.
                        this.fetchAvailableSlots();
            this.setData({ isLoading: false }); // Reset isLoading after fetch and UI updates
        })
        .catch(err => {
            wx.hideLoading();
            this.setData({ isLoading: false }); // Reset isLoading on error
            console.error('Booking API request failed:', err);
            if (err.statusCode === 409) {
                wx.showToast({ title: '手慢了，时段已被预约', icon: 'none', duration: 2500 });
                this.fetchAvailableSlots(); // Refresh to show the slot is gone
            } else {
                const errorMsg = err.message || '请稍后重试';
                wx.showToast({ title: `预约失败: ${errorMsg}`, icon: 'none', duration: 2500 });
            }
        });
    },
    // ****** END OF MODIFIED METHOD: callCreateBookingApi ******

    goToMyBookings: function() {
        // Ensure user is logged in before navigating (optional, but good practice)
        // The myBookings page itself will also do a check.
        if (!app.globalData.openid) {
          wx.showToast({
            title: '请先登录',
            icon: 'none'
          });
          // Optionally, trigger login if you have a universal login trigger
          // Or simply do nothing and let the myBookings page handle it
          return;
        }

        wx.navigateTo({
          url: '/pages/myBookings/myBookings'
        });
    }

    // Add other methods like onPullDownRefresh if needed:
    // onPullDownRefresh: function() {
    //   this.fetchAvailableSlots(() => {
    //     wx.stopPullDownRefresh(); // Stop the refresh animation
    //   });
    // }
})
