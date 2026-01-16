export function formatLocalISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateFR(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

export function formatLocalDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function getDateRange(currentDate, currentView) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  let startDate, endDate;

  if (currentView === 'week') {
    startDate = new Date(currentDate);
    const day = startDate.getDay();
    const diff = startDate.getDate() - (day === 0 ? 6 : day - 1);
    startDate.setDate(diff);
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
  } else if (currentView === 'month') {
    startDate = new Date(year, month, 1);
    const dayOfWeek = startDate.getDay();
    const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startDate.setDate(1 - adjustedDay);
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 41);
  } else if (currentView === 'year') {
    startDate = new Date(year, 0, 1);
    endDate = new Date(year, 11, 31);
  }

  return {
    startDate: formatLocalISODate(startDate),
    endDate: formatLocalISODate(endDate)
  };
}

export function syncDateInputs(startId, endId, options = {}) {
  const startInput = document.getElementById(startId);
  const endInput = document.getElementById(endId);
  if (!startInput || !endInput) return;

  const ensureOrder = () => {
    if (!startInput.value) return;

    endInput.min = startInput.value;

    if (!endInput.value || endInput.value < startInput.value) {
      const baseDate = new Date(startInput.value);
      if (Number.isNaN(baseDate.getTime())) return;
      baseDate.setHours(baseDate.getHours() + 1);
      endInput.value = formatLocalDateTime(baseDate);
    }
  };

  if (!startInput.dataset.syncBound) {
    ['change', 'input'].forEach(evt => {
      startInput.addEventListener(evt, ensureOrder);
    });
    startInput.dataset.syncBound = 'true';
  }

  if (options.forceUpdate) {
    ensureOrder();
  }
}
