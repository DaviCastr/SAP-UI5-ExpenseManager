import type { Period } from "./InvoiceService";
import { formatMonth } from "../util/format";

export const PERIOD_OVERVIEW_LABEL = "Visão geral • ";

/**
 * Pure period helpers used by the Home dashboard. Keeping them here removes
 * date arithmetic and label formatting from the controller so it only
 * orchestrates the view state.
 */
export class PeriodService {

    public current(): Period {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() + 1 };
    }

    public currentOrDefault(period?: Period): Period {
        return period || this.current();
    }

    public shift(period: Period, delta: number): Period {
        const total = period.year * 12 + (period.month - 1) + delta;
        return {
            year: Math.floor(total / 12),
            month: (total % 12) + 1
        };
    }

    public label(year: number, month: number): string {
        return `${PERIOD_OVERVIEW_LABEL}${formatMonth(year, month)}`;
    }
}