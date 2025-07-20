// frontend/pages/index/index.js
const { request } = require('../../utils/request.js');
const app = getApp();

const formatDate = date => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
};

Page({
    data: {
        availableSlots: [],
        groupedSlots: [],
        isLoading: false,
        error: null,
    },

    onLoad: function (options) {
        console.log('Index page loaded');
        this.fetchAvailableSlots();
    },

    // ADDED THIS FUNCTION
    onShow: function () {
        console.log('Index page shown, re-fetching slots...');
        this.fetchAvailableSlots();
    },

    fetchAvailableSlots: function () {
        this.setData({ isLoading: true, error: null });
        wx.showLoading({ title: '加载中...' });

        const formattedDate = formatDate(new Date());
        console.log(`Fetching available slots for week starting around ${formattedDate}...`);

        // --- FIXED: Use the request utility ---
        request({
            url: `/slots/week?startDate=${formattedDate}`,
            method: 'GET',
            requiresAuth: false // Viewing slots is public
        })
        .then(data => {
            console.log('Received slots:', data);
            const weekDays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
            const formattedSlots = data.map(slot => {
                // Parse UTC times from backend and display in local timezone
                const startDate = new Date(slot.startTime); // This will parse the UTC string and convert to local Date object
                const endDate = new Date(slot.endTime);     // This will parse the UTC string and convert to local Date object
                
                const year = startDate.getFullYear();
                const month = (startDate.getMonth() + 1).toString().padStart(2, '0');
                const day = startDate.getDate().toString().padStart(2, '0');
                const dayOfWeek = weekDays[startDate.getDay()];
                const displayDate = `${year}-${month}-${day} ${dayOfWeek}`;
                
                const startHours = startDate.getHours().toString().padStart(2, '0');
                const startMinutes = startDate.getMinutes().toString().padStart(2, '0');
                const endHours = endDate.getHours().toString().padStart(2, '0');
                const endMinutes = endDate.getMinutes().toString().padStart(2, '0');
                const displayTime = `${startHours}:${startMinutes} - ${endHours}:${endMinutes}`;
                return { ...slot, displayDate, displayTime };
            });

            const grouped = formattedSlots.reduce((acc, slot) => {
                const group = acc.find(g => g.date === slot.displayDate);
                if (group) {
                    group.slots.push(slot);
                } else {
                    acc.push({ date: slot.displayDate, slots: [slot] });
                }
                return acc;
            }, []);

            this.setData({
                availableSlots: formattedSlots,
                groupedSlots: grouped,
                isLoading: false,
            });
        })
        .catch(err => {
            console.error('Failed to fetch slots:', err);
            this.setData({ isLoading: false, error: '无法加载可用时段' });
            wx.showToast({ title: '加载失败', icon: 'error' });
        })
        .finally(() => {
            wx.hideLoading();
        });
    },

    handleBookSlot: function (event) {
        if (this.data.isLoading) return;

        const { slotId, startTime } = event.currentTarget.dataset;
        const openid = app.globalData.openid;
        const userInfo = app.globalData.userInfo;
        
        // Convert startTime to local string for display in modal
        const formattedDisplayTime = startTime ? new Date(startTime).toLocaleString() : '这个时段';

        if (!openid) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }

        if (!userInfo || !userInfo.nickName) {
            wx.showModal({
                title: '需要您的微信昵称',
                content: '为了更好地为您服务，请授权获取您的微信昵称。',
                success: (modalRes) => {
                    if (modalRes.confirm) {
                        wx.getUserProfile({
                            desc: '用于预约时显示您的昵称',
                            success: profileRes => {
                                app.globalData.userInfo = profileRes.userInfo;

                                // --- FIXED: Use the request utility to update user info ---
                                request({
                                    url: '/login',
                                    method: 'POST',
                                    data: { openid: openid, userInfo: profileRes.userInfo },
                                    requiresAuth: false
                                })
                                .then(() => {
                                    console.log('User info updated on backend. Proceeding with booking.');
                                    this.proceedWithBooking(slotId, startTime, openid, formattedDisplayTime);
                                })
                                .catch(err => {
                                    console.error('Failed to update user info on backend:', err);
                                    wx.showToast({ title: '更新信息失败，请重试', icon: 'none' });
                                });
                            }
                        });
                    }
                }
            });
            return;
        }
        this.proceedWithBooking(slotId, startTime, openid, formattedDisplayTime);
    },

    proceedWithBooking: function(slotId, startTime, openid, formattedDisplayTime) {
        wx.showModal({
            title: '确认预约',
            content: `您确定要预约 ${formattedDisplayTime} 吗？`,
            success: (res) => {
                if (res.confirm) {
                    const tmplId_booking_confirmation = 'YOUR_TEMPLATE_ID_HERE'; // Replace
                    const tmplId_booking_reminder = 'YOUR_TEMPLATE_ID_HERE'; // Replace

                    wx.requestSubscribeMessage({
                        tmplIds: [tmplId_booking_confirmation, tmplId_booking_reminder],
                        complete: () => {
                            console.log('Proceeding to callCreateBookingApi for slot:', slotId);
                            this.callCreateBookingApi(slotId, openid);
                        }
                    });
                }
            }
        });
    },
    
    callCreateBookingApi: function (slotId, userId) {
        wx.showLoading({ title: '正在预约...' });
        this.setData({ isLoading: true });

        // --- FIXED: Use the request utility ---
        request({
            url: '/bookings', // The utility adds the /api prefix
            method: 'POST',
            data: {
                slotId: Number(slotId),
                userId: userId
            },
            requiresAuth: true // Booking requires a token
        })
        .then(response => {
            console.log('Booking API response:', response);
            wx.showToast({ title: '预约成功!', icon: 'success' });
            this.fetchAvailableSlots(); // Refresh the list
        })
        .catch(err => {
            console.error('Booking API request failed:', err);
            if (err.statusCode === 409) {
                wx.showToast({ title: '手慢了，时段已被预约', icon: 'none' });
                this.fetchAvailableSlots();
            } else {
                wx.showToast({ title: '预约失败，请重试', icon: 'none' });
            }
        })
        .finally(() => {
            wx.hideLoading();
            this.setData({ isLoading: false });
        });
    },

    goToMyBookings: function() {
        if (!app.globalData.openid) {
          wx.showToast({ title: '请先登录', icon: 'none' });
          return;
        }
        wx.navigateTo({
          url: '/pages/myBookings/myBookings'
        });
    }
})
