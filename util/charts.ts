/**
 * Small SVG chart builders for the overview. Colors come from CSS custom
 * properties (`--series-*`, `--bar`, ...) declared in css/charts.css, so the
 * light and dark themes each use their own validated steps. Every mark has a
 * <title> (hover tooltip) and the values are always repeated as text next to
 * the chart, so identity never depends on color alone.
 */

export interface ChartSlice {
    label: string;
    value: number;
}

export interface ChartBar {
    label: string;
    hint: string;
    value: number;
    current: boolean;
}

export interface ChartReference {
    value: number;
    label: string;
}

export const MAX_SLICES = 5;

const DONUT_SIZE = 200;
const DONUT_RADIUS = 78;
const DONUT_THICKNESS = 24;
const SLICE_GAP = 2;

const COLUMN_WIDTH = 560;
const COLUMN_HEIGHT = 220;
const COLUMN_PADDING = { top: 18, right: 12, bottom: 30, left: 64 };
const TARGET_GRID_LINES = 4;
const MAX_BAR_WIDTH = 34;
const BAR_RADIUS = 4;

function escape(text: string): string {
    return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char] as string);
}

function niceScale(value: number): { max: number; step: number } {
    if (value <= 0) {
        return { max: 1, step: 1 };
    }

    const rough = value / TARGET_GRID_LINES;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = ([1, 2, 5, 10].find((candidate) => rough / magnitude <= candidate) ?? 10) * magnitude;

    return { max: Math.ceil(value / step) * step, step };
}

/**
 * CSS class of the color slot of the given slice position: the first slots
 * keep a fixed order and everything past them is "other".
 *
 * @param {number} index the slice position (largest first)
 * @returns {string} the series class
 */
export function seriesClass(index: number): string {
    return index < MAX_SLICES ? `emSeries${index + 1}` : "emSeriesOther";
}

/**
 * Keeps the largest slices and folds the rest into "Others".
 *
 * @param {ChartSlice[]} slices the slices, largest first
 * @param {string} otherLabel the label of the folded slice
 * @returns {ChartSlice[]} at most MAX_SLICES + 1 slices
 */
export function foldSlices(slices: ChartSlice[], otherLabel: string): ChartSlice[] {
    const visible = slices.filter((slice) => slice.value > 0);

    if (visible.length <= MAX_SLICES + 1) {
        return visible;
    }

    const rest = visible.slice(MAX_SLICES).reduce((total, slice) => total + slice.value, 0);

    return [...visible.slice(0, MAX_SLICES), { label: otherLabel, value: rest }];
}

export function donutChart(slices: ChartSlice[], format: (value: number) => string, totalLabel: string): string {
    const total = slices.reduce((sum, slice) => sum + slice.value, 0);
    const center = DONUT_SIZE / 2;
    const circumference = 2 * Math.PI * DONUT_RADIUS;
    let offset = 0;

    const arcs = total > 0
        ? slices.map((slice, index) => {
            const length = slice.value / total * circumference;
            const visible = Math.max(length - (slices.length > 1 ? SLICE_GAP : 0), 0.5);
            const percent = Math.round(slice.value / total * 100);
            const arc = `<circle class="emArc ${seriesClass(index)}" cx="${center}" cy="${center}" r="${DONUT_RADIUS}"`
                + ` stroke-width="${DONUT_THICKNESS}" stroke-dasharray="${visible} ${circumference}" stroke-dashoffset="${-offset}">`
                + `<title>${escape(slice.label)}: ${escape(format(slice.value))} (${percent}%)</title></circle>`;
            offset += length;
            return arc;
        }).join("")
        : `<circle class="emArcEmpty" cx="${center}" cy="${center}" r="${DONUT_RADIUS}" stroke-width="${DONUT_THICKNESS}"></circle>`;

    return `<svg class="emChart emDonut" viewBox="0 0 ${DONUT_SIZE} ${DONUT_SIZE}" role="img" aria-label="${escape(totalLabel)}">`
        + `<g transform="rotate(-90 ${center} ${center})">${arcs}</g>`
        + `<text class="emDonutValue" x="${center}" y="${center - 2}" text-anchor="middle">${escape(format(total))}</text>`
        + `<text class="emDonutLabel" x="${center}" y="${center + 18}" text-anchor="middle">${escape(totalLabel)}</text>`
        + "</svg>";
}

export function columnChart(bars: ChartBar[], format: (value: number) => string, axisFormat: (value: number) => string, reference?: ChartReference): string {
    const { max, step } = niceScale(Math.max(...bars.map((bar) => bar.value), reference?.value ?? 0, 0));
    const plotWidth = COLUMN_WIDTH - COLUMN_PADDING.left - COLUMN_PADDING.right;
    const plotHeight = COLUMN_HEIGHT - COLUMN_PADDING.top - COLUMN_PADDING.bottom;
    const baseline = COLUMN_PADDING.top + plotHeight;
    const y = (value: number): number => COLUMN_PADDING.top + (1 - value / max) * plotHeight;
    const slot = plotWidth / Math.max(bars.length, 1);
    const barWidth = Math.min(MAX_BAR_WIDTH, slot * 0.55);

    const grid = Array.from({ length: Math.round(max / step) + 1 }, (_, index) => {
        const value = step * index;
        const lineY = y(value);
        return `<line class="emGrid" x1="${COLUMN_PADDING.left}" x2="${COLUMN_WIDTH - COLUMN_PADDING.right}" y1="${lineY}" y2="${lineY}"></line>`
            + `<text class="emAxis" x="${COLUMN_PADDING.left - 8}" y="${lineY + 4}" text-anchor="end">${escape(axisFormat(value))}</text>`;
    }).join("");

    const columns = bars.map((bar, index) => {
        const x = COLUMN_PADDING.left + slot * index + (slot - barWidth) / 2;
        const top = y(bar.value);
        const height = baseline - top;
        const radius = Math.min(BAR_RADIUS, height / 2, barWidth / 2);
        const shape = height > 0
            ? `<path class="emBar${bar.current ? " emBarCurrent" : ""}" d="M${x},${baseline} V${top + radius} Q${x},${top} ${x + radius},${top}`
                + ` H${x + barWidth - radius} Q${x + barWidth},${top} ${x + barWidth},${top + radius} V${baseline} Z"></path>`
            : "";
        return `<g class="emBarGroup"><rect class="emHit" x="${COLUMN_PADDING.left + slot * index}" y="${COLUMN_PADDING.top}" width="${slot}" height="${plotHeight}"></rect>`
            + `${shape}<title>${escape(bar.hint)}: ${escape(format(bar.value))}</title></g>`
            + `<text class="emAxis${bar.current ? " emAxisCurrent" : ""}" x="${x + barWidth / 2}" y="${baseline + 18}" text-anchor="middle">${escape(bar.label)}</text>`;
    }).join("");

    const target = reference && reference.value > 0
        ? `<line class="emReference" x1="${COLUMN_PADDING.left}" x2="${COLUMN_WIDTH - COLUMN_PADDING.right}" y1="${y(reference.value)}" y2="${y(reference.value)}"></line>`
            + `<text class="emReferenceLabel" x="${COLUMN_WIDTH - COLUMN_PADDING.right}" y="${y(reference.value) - 6}" text-anchor="end">${escape(reference.label)}</text>`
        : "";

    return `<svg class="emChart emColumns" viewBox="0 0 ${COLUMN_WIDTH} ${COLUMN_HEIGHT}" role="img">${grid}${columns}${target}</svg>`;
}
