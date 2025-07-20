// Helper function to format booking times consistently
const formatBookingDisplay = (startTime, endTime) => {
  if (!startTime || !endTime) return { displayDate: 'N/A', displayTime: 'N/A' };
  try {
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    const weekDays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

    // Format Date part (e.g., YYYY-MM-DD DayOfWeek)
    const year = startDate.getFullYear();
    const month = (startDate.getMonth() + 1).toString().padStart(2, '0');
    const day = startDate.getDate().toString().padStart(2, '0');
    const dayOfWeek = weekDays[startDate.getDay()];
    const displayDate = `${year}-${month}-${day} ${dayOfWeek}`;

    // Format Time part (HH:MM - HH:MM)
    const startHours = startDate.getHours().toString().padStart(2, '0');
    const startMinutes = startDate.getMinutes().toString().padStart(2, '0');
    const endHours = endDate.getHours().toString().padStart(2, '0');
    const endMinutes = endDate.getMinutes().toString().padStart(2, '0');
    const displayTime = `${startHours}:${startMinutes} - ${endHours}:${endMinutes}`;

    return { displayDate, displayTime };
  } catch (e) {
    console.error("Error formatting booking date/time:", e);
    return { displayDate: 'Invalid Date', displayTime: 'Invalid Time' };
  }
};

module.exports = {
  formatBookingDisplay
};
