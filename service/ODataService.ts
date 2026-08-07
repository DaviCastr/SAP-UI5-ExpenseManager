import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import type Filter from "sap/ui/model/Filter";
import { request } from "../util/http";

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

async function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

function unwrapBindingObject(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

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

    /**
     * Resolves an OData media resource to a base64 data URL using the same
     * authenticated OData model. The model carries the Authorization header, so
     * the mídia is fetched with the session token instead of a raw browser
     * request. Returns `undefined` when the media cannot be loaded.
     *
     * @param {string} mediaPath the service-relative media path (e.g. "Categories(ID='..')/Image")
     * @returns {Promise<string | undefined>} a base64 data URL, or `undefined` on failure
     */
    public async getMediaAsBase64(mediaPath?: string): Promise<string | undefined> {
        if (!mediaPath) {
            return undefined;
        }

        try {
            const binding = this.model.bindContext(this.mediaEntityPath(mediaPath));
            const bound: unknown = await binding.requestObject();
            const readLink = this.resolveMediaReadLink(mediaPath, unwrapBindingObject(bound));
            if (!readLink) {
                return undefined;
            }

            const response = await request(this.relativePath(readLink), {});
            if (!response.ok) {
                return undefined;
            }

            const blob = await response.blob();
            return blobToDataUrl(blob);
        } catch {
            return undefined;
        }
    }

    /**
     * Resolves the entity path (media property read link) from a media path.
     *
     * @param {string} mediaPath the relative media path
     * @param {Record<string, unknown>} bound the bound entity data
     * @returns {string | undefined} an absolute media URL, or `undefined`
     */
    private resolveMediaReadLink(mediaPath: string, bound: Record<string, unknown>): string | undefined {
        const readLink = bound["@odata.mediaReadLink"] || bound["@odata.mediaEditLink"];

        if (typeof readLink === "string" && readLink) {
            return readLink;
        }

        return this.getMediaUrl(mediaPath);
    }

    /**
     * Normalizes a service-relative media path into an OData entity path the
     * model can bind against.
     *
     * @param {string} mediaPath the service-relative media path
     * @returns {string} the entity path
     */
    private mediaEntityPath(mediaPath: string): string {
        return mediaPath.replace(/\/Image(\/\$value)?$/, "");
    }

    /**
     * Strips an absolute service base from a URL so it can be passed to the
     * authenticated `request` helper. Absolute external URLs are returned as is.
     *
     * @param {string} url the media link to normalize
     * @returns {string} a service-relative (or preserved absolute) URL
     */
    private relativePath(url: string): string {
        const base = this.getServiceUrl();
        return url.startsWith(base) ? url.slice(base.length) : url;
    }
}
