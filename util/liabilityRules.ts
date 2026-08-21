/**
 * Frontend mirror of the debt rules of `@/domain/liability-rules` on the
 * backend. Both sides must be kept in sync: the backend enforces the rules,
 * this module only feeds the option lists used by the UI.
 *
 * A liability has exactly two statuses (OPEN/PAID) and its transactions are
 * either IN (reduces the outstanding balance) or OUT (increases it). The
 * outstanding balance, payment percentage and status are computed by the
 * backend from the persisted transactions.
 */

export interface EntityOption {
    key: string;
    text: string;
}

export const TRANSACTION_TYPE_OPTIONS: EntityOption[] = [
    { key: "IN", text: "Entrada" },
    { key: "OUT", text: "Saída" }
];

export const LIABILITY_STATUS_OPTIONS: EntityOption[] = [
    { key: "OPEN", text: "Em aberto" },
    { key: "PAID", text: "Paga" }
];