// frontend/pages/coachBookings/coachBookings.js
console.log('--- coachBookings.js file executing ---'); // <-- Log 1

const { request } = require('../../utils/request.js');
const app = getApp();
const formatDate = (date) => {
  // ... (keep formatDate function)
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const DESIGNATED_COACH_OPENID = 'oc5am7UF8nlgd-3LxJQrgMG84ews'; // Replace with actual ID

console.log('--- coachBookings.js imports done, defining Page ---'); // <-- Log 2

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
    console.log('--- coachBookings.js onLoad triggered ---'); // <-- Log 3

    // --- Authorization Check ---
    // (Keep the rest of your onLoad, checkAuthorization, handleAuthorizationFailure logic here)
    if (app.globalData.openid) {
      console.log("OpenID found in globalData on coachBookings load");
      this.checkAuthorization(app.globalData.openid);
    } else {
      console.log("OpenID not found on coachBookings load, setting up callback");
      app.openidReadyCallback = openid => {
        console.log("openidReadyCallback executed in coachBookings");
        if (openid) {
          this.checkAuthorization(openid);
        } else {
          this.handleAuthorizationFailure("登录失败");
        }
      };
      if (!app.globalData.openid) {
        console.warn("Login might have failed or is severely delayed.");
      }
    }
    // --- End Authorization Check ---
  },

  checkAuthorization(openid) {
    console.log('--- coachBookings.js checkAuthorization called ---');
    console.log("Checking authorization for openid:", openid);
    console.log("Comparing against DESIGNATED_COACH_OPENID:", DESIGNATED_COACH_OPENID);
    if (openid === DESIGNATED_COACH_OPENID) {
      console.log("Authorization successful: User is the coach."); // Add this log
      this.setData({
        isCoach: true,
        openid: openid
      });
      // --- ADD THIS LOG ---
      console.log("Set isCoach=true in data. Current this.data.isCoach:", this.data.isCoach);
      // --- END ADD LOG ---
      this.fetchBookings();
    } else {
      // ... handle failure ...
    }
  },

  handleAuthorizationFailure(message) {
    console.log('--- coachBookings.js handleAuthorizationFailure called ---'); // <-- Log 5
    // ... (rest of handleAuthorizationFailure logic) ...
  },


  fetchBookings() {
    console.log('--- coachBookings.js fetchBookings called ---'); // <-- Log 6

    // --- ADD THIS LOG ---
    console.log("Checking this.data.isCoach inside fetchBookings:", this.data.isCoach);
    if (!this.data.isCoach) {
      console.warn("fetchBookings exiting because !this.data.isCoach."); // Add this log
      return;
    }
    // --- END ADD LOG ---

    // --- ADD THIS LOG ---
    console.log("Setting loading state...");
    this.setData({ isLoading: true, errorMsg: null, bookings: [] });
    const date = this.data.selectedDate;
    // --- ADD THIS LOG ---
    console.log(`Workspaceing bookings for date: ${date}. Making request call next...`);

    request({ // Execution seems to stop before or during this
      url: `/api/coach/bookings?date=${date}`,
      method: 'GET',
    })
      .then(res => {
        // ... success handling ...
      })
      .catch(err => {
        // ... error handling ...
      });
  },

  // ... onDateChange, onCancelBooking ...
})