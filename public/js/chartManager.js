/**
 * @file chartManager.js
 * @description Chart.js visualization and analytics manager for Daylign.
 * Aggregates historical timeLogs client-side into 7-day and 30-day buckets,
 * renders completion-rate and time-spent charts with pastel palettes,
 * and manages instance lifecycles to prevent memory leaks.
 */

import { getTimeLogsForChecklist, getLocalDateString } from "./db.js";

/**
 * Active Chart.js instance reference
 * @type {import('chart.js').Chart | null}
 */
let activeChartInstance = null;

/**
 * Fetch and aggregate timeLogs for a given checklist across a date range.
 * 
 * @param {string} uid - User ID
 * @param {string} checklistId - Target checklist ID
 * @param {number} [days=7] - Number of days to look back (e.g. 7 or 30)
 * @returns {Promise<{ dayLabels: string[], dateKeys: string[], completionData: number[], durationMinutesData: number[], totalCompletions: number, activeDays: number, totalMinutes: number, avgRate: number }>}
 */
export async function getTimeLogsForRange(uid, checklistId, days = 7) {
  const safeDays = Math.max(1, Number(days) || 7);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (safeDays - 1));
  const startDateStr = getLocalDateString(startDate);

  const logs = await getTimeLogsForChecklist(uid, checklistId, startDateStr);

  const dayLabels = [];
  const dateKeys = [];
  const countsByDate = {};
  const durationsByDate = {};

  for (let i = 0; i < safeDays; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const key = getLocalDateString(d);
    dateKeys.push(key);
    countsByDate[key] = 0;
    durationsByDate[key] = 0;

    const label = safeDays <= 7
      ? d.toLocaleDateString("en-US", { weekday: "short" })
      : d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
    dayLabels.push(label);
  }

  logs.forEach((log) => {
    if (countsByDate[log.date] !== undefined) {
      countsByDate[log.date] += 1;
      const durationSeconds = Number(log.durationSeconds) || 0;
      durationsByDate[log.date] += Math.round(durationSeconds / 60);
    }
  });

  const completionData = dateKeys.map((k) => countsByDate[k]);
  const durationMinutesData = dateKeys.map((k) => durationsByDate[k]);

  const totalCompletions = completionData.reduce((a, b) => a + b, 0);
  const activeDays = completionData.filter((c) => c > 0).length;
  const totalMinutes = durationMinutesData.reduce((a, b) => a + b, 0);
  const avgRate = Math.round((activeDays / safeDays) * 100);

  return {
    dayLabels,
    dateKeys,
    completionData,
    durationMinutesData,
    totalCompletions,
    activeDays,
    totalMinutes,
    avgRate
  };
}

/**
 * Destroy the current Chart.js instance to prevent memory leaks (Rules.md §4 & TechSpec.md §2).
 */
export function destroyActiveChart() {
  if (activeChartInstance) {
    try {
      activeChartInstance.destroy();
    } catch (err) {
      console.warn("[ChartManager] Note during chart teardown:", err.message);
    }
    activeChartInstance = null;
  }
}

/**
 * Render or refresh the Analytics Chart in the given canvas element.
 * 
 * @param {HTMLCanvasElement} canvas - The target canvas element
 * @param {string} uid - User ID
 * @param {string} checklistId - Checklist ID
 * @param {Object} options
 * @param {number} [options.days=7] - 7 or 30
 * @param {boolean} [options.timerEnabled=true] - Whether to render time spent series
 * @param {string} [options.accentColor="#818CF8"] - Pastel accent hex color
 * @param {(stats: { avgRate: number, activeDays: number, totalDays: number, totalMinutes: number }) => void} [options.onStatsUpdated] - Callback for text stats
 * @returns {Promise<import('chart.js').Chart|null>}
 */
export async function renderAnalyticsChart(canvas, uid, checklistId, options = {}) {
  if (!canvas || typeof window.Chart === "undefined") {
    console.warn("[ChartManager] Canvas element or Chart.js library unavailable.");
    return null;
  }

  const days = options.days === 30 ? 30 : 7;
  const timerEnabled = options.timerEnabled !== false;
  const accentColor = options.accentColor || "#818CF8";

  // Destroy previous instance
  destroyActiveChart();

  try {
    const data = await getTimeLogsForRange(uid, checklistId, days);

    if (typeof options.onStatsUpdated === "function") {
      options.onStatsUpdated({
        avgRate: data.avgRate,
        activeDays: data.activeDays,
        totalDays: days,
        totalMinutes: data.totalMinutes
      });
    }

    const datasets = [
      {
        type: "bar",
        label: "Tasks Completed",
        data: data.completionData,
        backgroundColor: accentColor + "80", // 50% opacity
        borderColor: accentColor,
        borderWidth: 1.5,
        borderRadius: 6,
        barPercentage: 0.6,
        categoryPercentage: 0.8,
        yAxisID: "y"
      }
    ];

    if (timerEnabled) {
      datasets.push({
        type: "line",
        label: "Time Spent (min)",
        data: data.durationMinutesData,
        borderColor: "#34D399",
        backgroundColor: "rgba(52, 211, 153, 0.15)",
        fill: true,
        tension: 0.35,
        borderWidth: 2,
        pointBackgroundColor: "#34D399",
        pointBorderColor: "#FFFFFF",
        pointBorderWidth: 1.5,
        pointRadius: 3.5,
        pointHoverRadius: 5.5,
        yAxisID: "y1"
      });
    }

    activeChartInstance = new window.Chart(canvas, {
      data: {
        labels: data.dayLabels,
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 350,
          easing: "easeOutQuart"
        },
        interaction: {
          mode: "index",
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              font: {
                size: 11,
                family: "Inter"
              },
              color: "#64748B",
              usePointStyle: true
            }
          },
          tooltip: {
            backgroundColor: "#1E293B",
            titleFont: { size: 11, family: "Inter", weight: "600" },
            bodyFont: { size: 11, family: "Inter" },
            padding: 10,
            cornerRadius: 10,
            displayColors: true,
            callbacks: {
              label: function (context) {
                let label = context.dataset.label || "";
                if (label) label += ": ";
                if (context.dataset.yAxisID === "y1") {
                  label += `${context.parsed.y} min`;
                } else {
                  label += `${context.parsed.y} task${context.parsed.y === 1 ? "" : "s"}`;
                }
                return label;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 10, family: "Inter" },
              color: "#94A3B8"
            }
          },
          y: {
            type: "linear",
            display: true,
            position: "left",
            beginAtZero: true,
            grid: {
              color: "rgba(226, 232, 240, 0.6)"
            },
            ticks: {
              precision: 0,
              font: { size: 10, family: "Inter" },
              color: "#94A3B8"
            }
          },
          ...(timerEnabled ? {
            y1: {
              type: "linear",
              display: true,
              position: "right",
              beginAtZero: true,
              grid: { drawOnChartArea: false },
              ticks: {
                font: { size: 10, family: "Inter" },
                color: "#34D399",
                callback: (val) => `${val}m`
              }
            }
          } : {})
        }
      }
    });

    return activeChartInstance;
  } catch (error) {
    console.error("[ChartManager] Failed to render analytics chart:", error);
    return null;
  }
}

export default {
  getTimeLogsForRange,
  destroyActiveChart,
  renderAnalyticsChart
};
