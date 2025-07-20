// frontend/pages/coachBookings/coachBookings.js
const { request } = require('../../utils/request.js');
const { formatBookingDisplay } = require('../../utils/time.js');
const app = getApp();

const formatDate = (date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
};

Page({
    data: {
        selectedDate: formatDate(new Date()),
        bookings: [],
        isLoading: false,
        errorMsg: null,
        isCoach: false, // We will rely on backend authorization
        showAll: false
    },

    onLoad(options) {
        // We will fetch data in onShow, as it runs every time the page is displayed
    },

    onShow() {
        // onShow is better for fetching data that might change
        this.fetchBookings();
    },

    fetchBookings(all = false) {
        this.setData({ isLoading: true, errorMsg: null, bookings: [] });
        
        // --- FIXED: Removed /api prefix from URLs ---
        let url = all ? '/coach/all-bookings' : '/coach/bookings';
        const dateToFetch = all ? null : this.data.selectedDate;

        if (dateToFetch) {
            console.log(`Fetching bookings for date: ${dateToFetch}.`);
            url += `?date=${dateToFetch}`;
        } else {
            console.log('Fetching all bookings.');
        }

        request({
            url: url,
            method: 'GET',
        })
        .then(apiResponseBookings => {
            // Check if the user is authorized based on a successful response
            this.setData({ isCoach: true }); 
            
            const logDate = dateToFetch || 'all dates';
            console.log(`Received API response for bookings on ${logDate}.`);

            if (Array.isArray(apiResponseBookings)) {
                let bookingsToDisplay = apiResponseBookings;

                if (all) {
                    const now = new Date();
                    bookingsToDisplay = apiResponseBookings.filter(booking => new Date(booking.startTime) >= now);
                }

                const formattedBookings = bookingsToDisplay.map(booking => {
                    const { displayDate, displayTime } = formatBookingDisplay(booking.startTime, booking.endTime);
                    const [displayStartTime, displayEndTime] = displayTime.split(' - ');
                    return { ...booking, displayStartTime, displayEndTime, displayDate };
                });

                this.setData({
                    bookings: formattedBookings,
                    isLoading: false
                });
            } else {
                this.setData({ isLoading: false, errorMsg: '返回数据格式错误', bookings: [] });
            }
        })
        .catch(err => {
            console.error(`Failed to fetch coach bookings:`, err);
            // If the error is 403, it means the user is not the coach
            const errorMessage = err.statusCode === 403 ? '您没有权限查看此页面' : (err.message || '加载预约失败');
            this.setData({
                isLoading: false,
                errorMsg: errorMessage,
                isCoach: false // Set isCoach to false on auth failure
            });
        });
    },

    onDateChange(event) {
        const newDate = event.detail.value;
        this.setData({
            selectedDate: newDate,
            showAll: false
        });
        this.fetchBookings(false);
    },

    showAllFutureBookings() {
        this.setData({
            showAll: true,
            selectedDate: '所有未来预约'
        });
        this.fetchBookings(true);
    },

    // Add this new function
    goToStudentView: function() {
        wx.navigateTo({
          url: '/pages/index/index',
        })
    },

    goToConfigPage() {
        wx.navigateTo({
            url: '/pages/coachConfig/coachConfig'
        });
    }
});
