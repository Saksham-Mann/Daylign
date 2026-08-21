/**
 * @file chartManager.js
 * @description Chart.js visualization and analytics manager for Daylign.
 * Consumes pre-aggregated analytics from the serverless backend (/api/analytics),
 * renders dual-axis completion-rate and time-spent charts with pastel palettes,
 * and manages instance lifecycles to prevent memory leaks.
 */

import { getTimeLogsForRange } from "./db.js";

/**
 * Active Chart.js instance reference
 * @type {import('chart.js').Chart | null}
 */
let activeChartInstance = null;

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

  // Destroy previous instance (also handles concurrent call race)
  destroyActiveChart();

  // Also check if Chart.js has an existing chart on this canvas and destroy it
  const existingChart = window.Chart?.getChart?.(canvas);
  if (existingChart) {
    try { existingChart.destroy(); } catch (_) { /* ignore */ }
  }

  try {
    const data = await getTimeLogsForRange(uid, checklistId, days);

    if (typeof options.onStatsUpdated === "function" && data?.summary) {
      options.onStatsUpdated({
        avgRate: data.summary.avgRate || 0,
        activeDays: data.summary.activeDays || 0,
        totalDays: days,
        totalMinutes: data.summary.totalMinutes || 0
      });
    }

    const datasets = [
      {
        type: "bar",
        label: "Tasks Completed",
        data: data.completedCounts || [],
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
        data: data.durationsMinutes || [],
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
        labels: data.labels || [],
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
