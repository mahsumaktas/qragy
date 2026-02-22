"use strict";

/**
 * Support Hours Service
 *
 * Timezone-aware support availability calculation.
 * Factory pattern — config getters injected via deps.
 */
function createSupportHoursService(deps) {
  const {
    getEnabled,
    getTimezone,
    getOpenHour,
    getCloseHour,
    getOpenDays,
  } = deps;

  function getTimePartsInTimeZone(date, timeZone) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const weekdayText = parts.find((part) => part.type === "weekday")?.value || "";
    const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
    const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);

    const weekdayMap = {
      Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7
    };

    return {
      weekday: weekdayMap[weekdayText] || 0,
      hour: Number.isFinite(hour) ? hour : 0,
      minute: Number.isFinite(minute) ? minute : 0
    };
  }

  function isHourWithinWindow(hour, startHour, endHour) {
    if (startHour === endHour) return true;
    if (startHour < endHour) return hour >= startHour && hour < endHour;
    return hour >= startHour || hour < endHour;
  }

  function getSupportAvailability(now = new Date()) {
    const enabled = getEnabled();
    const timezone = getTimezone();
    const openHour = getOpenHour();
    const closeHour = getCloseHour();
    const openDays = getOpenDays();

    const base = {
      enabled,
      timezone,
      openHour,
      closeHour,
      openDays,
      isOpen: true,
      weekday: 0,
      hour: 0,
      minute: 0
    };

    if (!enabled) return base;

    try {
      const timeParts = getTimePartsInTimeZone(now, timezone);
      const openDaySet = openDays.length ? openDays : [1, 2, 3, 4, 5, 6, 7];
      const isOpenDay = openDaySet.includes(timeParts.weekday);
      const isOpenHour = isHourWithinWindow(timeParts.hour, openHour, closeHour);

      return {
        ...base,
        weekday: timeParts.weekday,
        hour: timeParts.hour,
        minute: timeParts.minute,
        isOpen: isOpenDay && isOpenHour
      };
    } catch (_error) {
      return base;
    }
  }

  return { getSupportAvailability };
}

module.exports = { createSupportHoursService };
