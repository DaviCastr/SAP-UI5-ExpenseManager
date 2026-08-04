import type ODataModel from "sap/ui/model/odata/v4/ODataModel";

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

    public async requestEntitySet<T>(entitySet: string, parameters?: { select?: string[] }): Promise<T[]> {
        const bindingParameters: Record<string, string> = {};

        if (parameters?.select?.length) {
            bindingParameters.$select = parameters.select.join(",");
        }

        const binding = this.model.bindList(`/${entitySet}`, undefined, undefined, undefined, bindingParameters);
        const contexts = await binding.requestContexts();

        return contexts.map((context) => context.getObject() as T);
    }

    public async requestFunction<T>(path: string, parameters: Record<string, unknown>): Promise<T> {
        const binding = this.model.bindContext(`${path}(...)`);

        for (const [name, value] of Object.entries(parameters)) {
            binding.setParameter(name, value);
        }

        await binding.invoke();

        return binding.getBoundContext()?.getObject() as T;
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
