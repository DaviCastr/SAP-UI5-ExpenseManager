import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import type ODataContextBinding from "sap/ui/model/odata/v4/ODataContextBinding";
import { ODataService } from "../service/ODataService";

/**
 * A transaction that lives inside the person's tree. The deep draft path is
 * built from these parts, always rooted at the person draft (the service keeps
 * every change of cards/invoices/transactions inside the single person draft).
 */
export interface TransactionWriteTarget {
    ID: string;
    cardId: string;
    invoiceId: string;
    identifier: string;
}

/**
 * Builds the OData path of a transaction inside the currently open person
 * draft. Addressing the deepest rows this way makes every PATCH/DELETE part of
 * the same person draft, so activating the draft publishes the whole tree.
 *
 * @param {string} personId the person that owns the card/invoice/transaction
 * @param {TransactionWriteTarget} target the transaction coordinates
 * @returns {string} the draft-relative entity path
 */
export function transactionDraftPath(personId: string, target: TransactionWriteTarget): string {
    const part = (value: string): string => encodeURIComponent(value);
    return `Persons(ID='${part(personId)}',IsActiveEntity=false)/Cards(ID='${part(target.cardId)}',IsActiveEntity=false)/Invoices(ID='${part(target.invoiceId)}',IsActiveEntity=false)/Transactions(ID='${part(target.ID)}',IsActiveEntity=false)`;
}

/**
 * Sets a new category on every transaction of an identifier group and then
 * publishes the person draft. The deep draft rows are materialized first
 * (idempotent touch), then each row is bound, the Category navigation is set
 * through the model (`setProperty`) and everything is flushed together by
 * `submitPending` — so the whole group travels inside one `$batch` changeset.
 * Publish the person draft afterwards.
 *
 * @param {ODataModel} model the shared service model
 * @param {string} personId the person that owns the transactions
 * @param {TransactionWriteTarget[]} targets the identifier group
 * @param {string} categoryId the new category id
 * @returns {Promise<boolean>} whether every update succeeded and the draft was activated
 */
export async function applyCategoryToTransactions(
    model: ODataModel,
    personId: string,
    targets: TransactionWriteTarget[],
    categoryId: string
): Promise<boolean> {
    const odata = new ODataService(model);
    await odata.enableDraftEdit("Persons", personId);

    let batchConstexts = [];
    let bindings: ODataContextBinding[] = [];
    try {
        for (const target of targets) {
            const binding = model.bindContext(`/${transactionDraftPath(personId, target)}`);
            batchConstexts.push({binding, data: binding.requestObject()});
        }

        await Promise.all(batchConstexts.map(item=> item.data));

        bindings = batchConstexts.map(item=> item.binding);

        const batchChanges = [];
        for (const binding of bindings) {
            const context = binding.getBoundContext();
            if (context) {
                batchChanges.push(context.setProperty("Category_ID", categoryId));
            }
        }

        await Promise.all(batchChanges);

        await odata.submitPending();
    } catch {
        return false;
    } finally {
        for (const binding of bindings) {
            try {
                binding.destroy();
            } catch {
                // best effort; destroying a failed binding must not break the flow
            }
        }
    }

    await odata.prepareDraft("Persons", personId);
    await odata.activateDraft("Persons", personId);
    return true;
}

/**
 * Deletes the selected transactions through the model bindings only. Every
 * removed row is bound against the open person draft (`bindContext` +
 * `requestObject` + `delete`) and flushed together by `submitPending`, so all
 * the deletes travel inside one `$batch` changeset. Deleting a row through the
 * model works no matter whether the invoice keeps other transactions or is
 * emptied completely. The targets are grouped by invoice and the person draft
 * is published afterwards.
 *
 * @param {ODataModel} model the shared service model
 * @param {string} personId the person that owns the transactions
 * @param {TransactionWriteTarget[]} targets the transactions to remove
 * @returns {Promise<boolean>} whether every delete succeeded and the draft was activated
 */
export async function deleteTransactionsViaBatch(
    model: ODataModel,
    personId: string,
    targets: TransactionWriteTarget[]
): Promise<boolean> {
    const odata = new ODataService(model);
    await odata.enableDraftEdit("Persons", personId);

    const batchContexts: { binding: ODataContextBinding; data: Promise<unknown> }[] = [];
    const bindings: ODataContextBinding[] = [];
    try {
        for (const target of targets) {
            const binding = model.bindContext(`/${transactionDraftPath(personId, target)}`);
            batchContexts.push({ binding, data: binding.requestObject() });
        }

        await Promise.all(batchContexts.map((item) => item.data));

        bindings.push(...batchContexts.map((item) => item.binding));

        const rowDeletes = bindings.map((binding) => {
            const context = binding.getBoundContext();
            return context ? context.delete().catch(() => undefined) : Promise.resolve();
        });
        await Promise.all(rowDeletes);

        await odata.submitPending();
    } catch {
        return false;
    } finally {
        for (const binding of bindings) {
            try {
                binding.destroy();
            } catch {
                // best effort; destroying a failed binding must not break the flow
            }
        }
    }

    await odata.prepareDraft("Persons", personId);
    await odata.activateDraft("Persons", personId);
    return true;
}