/// <reference types="@sapui5/types" />
import Controller from "sap/ui/core/mvc/Controller";
import UIComponent from "sap/ui/core/UIComponent";
import Router from "sap/ui/core/routing/Router";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";

type ServiceModelHost = UIComponent & {
    ensureServiceModel?: () => Promise<ODataModel | null>;
};

export abstract class BaseController extends Controller {

    protected getRouter(): Router {
        return UIComponent.getRouterFor(this);
    }

    protected navTo(route: string, parameters?: object): void {
        this.getRouter().navTo(route, parameters);
    }

    protected getResourceBundle(): ResourceBundle {
        return (this.getOwnerComponent()?.getModel("i18n") as ResourceModel)
            .getResourceBundle() as ResourceBundle;
    }

    protected getText(key: string, parameters?: string[]): string {
        return this.getResourceBundle().getText(key, parameters) ?? key;
    }

    /**
     * Resolves with the shared OData model once a valid session is available,
     * or `null` when the user is not authenticated.
     */
    protected async ensureServiceModel(): Promise<ODataModel | null> {
        const component = this.getOwnerComponent() as ServiceModelHost | undefined;

        if (typeof component?.ensureServiceModel === "function") {
            return component.ensureServiceModel();
        }

        return component?.getModel() as ODataModel | null | undefined ?? null;
    }

    /**
     * Synchronous accessor used by actions that already run with the model in
     * place. Throws when the model is not available yet.
     */
    protected getServiceModel(): ODataModel {
        const model = this.getOwnerComponent()?.getModel() as ODataModel | undefined;

        if (!model) {
            throw new Error("O serviço financeiro não está disponível.");
        }

        return model;
    }
}
