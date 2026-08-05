import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import type Filter from "sap/ui/model/Filter";

/**
 * CAP controllers reply with a `{ data, status }` envelope (BaseControllerResponse).
 * Unwraps the payload so callers receive the actual function/action result.
 *
 * @param {unknown} value the raw value returned by the OData model
 * @returns {unknown} the unwrapped payload (or the original value when not an envelope)
 */
function unwrapControllerResult(value: unknown): unknown {
    // eslint-disable-next-line no-console
    console.log("[unwrapControllerResult] value:", value);
    if (value && typeof value === "object" && "data" in value && "status" in value) {
        return (value as { data?: unknown }).data;
    }
    return value;
}

/**
 * Draft-aware query options for draft-enabled entities.
 *
 * The filter lists active entities together with drafts that have no active
 * sibling, without duplicating entities that exist in both versions.
 */
export const DRAFT_FILTER = "(IsActiveEntity eq true or SiblingEntity/IsActiveEntity eq null)";
export const DRAFT_EXPAND = "DraftAdministrativeData($select=DraftUUID,InProcessByUser)";

/**
 * Thin, typed wrapper around the shared OData V4 model.
 *
 * Every read/write the application performs against the CAP backend goes
 * through this class so the controllers never deal with raw bindings.
 */
export class ODataService {

    private readonly model: ODataModel;

    public constructor(model: ODataModel) {
        this.model = model;
    }

    public getModel(): ODataModel {
        return this.model;
    }

    public getServiceUrl(): string {
        return this.model.getServiceUrl();
    }

    public async requestEntitySet<T>(
        entitySet: string,
        parameters?: {
            select?: string[];
            filters?: Filter[];
            expand?: string;
            filterExpression?: string;
            count?: boolean;
        }
    ): Promise<T[]> {
        const bindingParameters: Record<string, string> = {};

        if (parameters?.select?.length) {
            bindingParameters.$select = parameters.select.join(",");
        }

        if (parameters?.expand) {
            bindingParameters.$expand = parameters.expand;
        }

        if (parameters?.count) {
            bindingParameters.$count = "true";
        }

        if (parameters?.filterExpression) {
            bindingParameters.$filter = parameters.filterExpression;
        }

        const binding = this.model.bindList(
            `/${entitySet}`,
            undefined,
            undefined,
            parameters?.filters,
            bindingParameters
        );

        const contexts = await binding.requestContexts();

        return contexts.map((context) => context.getObject() as T);
    }

    public async requestFunction<T>(path: string, parameters: Record<string, unknown>): Promise<T> {
        const binding = this.model.bindContext(`${path}(...)`);

        for (const [name, value] of Object.entries(parameters)) {
            binding.setParameter(name, value);
        }

        await binding.invoke();

        return unwrapControllerResult(binding.getBoundContext()?.getObject()) as T;
    }

    public async requestAction(path: string, parameters: Record<string, unknown>): Promise<void> {
        const binding = this.model.bindContext(`${path}(...)`);

        for (const [name, value] of Object.entries(parameters)) {
            binding.setParameter(name, value);
        }

        await binding.invoke();
    }

    public getMediaUrl(mediaPath: string): string {
        return `${this.getServiceUrl()}${mediaPath}`;
    }
}
