/// <reference types="@sapui5/types" />
import Controller from "sap/ui/core/mvc/Controller";
import UIComponent from "sap/ui/core/UIComponent";
import Router from "sap/ui/core/routing/Router";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import type ODataModel from "sap/ui/model/odata/v4/ODataModel";
import type JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import { SessionStorage } from "../auth/storage/SessionStorage";
import { isSessionExpiredError, isBackendUnavailableError } from "../util/http";

type ServiceModelHost = UIComponent & {
    ensureServiceModel?: () => Promise<ODataModel | null>;
};

/**
 * Common behaviour for every application controller: model access, navigation
 * and a single, centralized way of turning failures into user feedback.
 */
export abstract class BaseController extends Controller {

    private _backendErrorShown = false;

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
     * Returns the shared `ui` JSON model of the component.
     *
     * @returns {JSONModel} the component ui model
     */
    protected getUiModel(): JSONModel {
        return this.getOwnerComponent()?.getModel("ui") as JSONModel;
    }

    /**
     * Resolves with the shared OData model once a valid session is available,
     * or `null` when the user is not authenticated.
     *
     * @returns {Promise<ODataModel | null>} the shared service model, or null when not authenticated
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
     *
     * @returns {ODataModel} the shared service model
     */
    protected getServiceModel(): ODataModel {
        const model = this.getOwnerComponent()?.getModel() as ODataModel | undefined;

        if (!model) {
            throw new Error("O serviço financeiro não está disponível.");
        }

        return model;
    }

    /**
     * Shows a MessageBox for an i18n message key.
     *
     * @param {string} messageKey the i18n key shown in the MessageBox
     * @param {string[]} [parameters] optional parameters for the i18n text
     */
    protected showErrorMessage(messageKey: string, parameters?: string[]): void {
        MessageBox.error(this.getText(messageKey, parameters));
    }

    /**
     * Shows a warning MessageBox for an i18n message key.
     *
     * @param {string} messageKey the i18n key shown in the MessageBox
     * @param {string[]} [parameters] optional parameters for the i18n text
     */
    protected showWarningMessage(messageKey: string, parameters?: string[]): void {
        MessageBox.warning(this.getText(messageKey, parameters));
    }

    /**
     * Central failure handler. Session-expired errors are handled silently
     * (the global component handler navigates to the Login page); backend
     * unavailability shows the generic connectivity message; every other
     * failure is surfaced with the given i18n message.
     *
     * @param {unknown} error the caught error
     * @param {string} messageKey the i18n key describing the failed action
     * @returns {boolean} true when the error was handled (so callers can `return`)
     */
    protected handleError(error: unknown, messageKey: string): boolean {
        if (isSessionExpiredError(error)) {
            return true;
        }
        if (isBackendUnavailableError(error)) {
            this.showErrorMessage("backendUnavailable");
            return true;
        }
        this.showErrorMessage(messageKey);
        return true;
    }

    /**
     * Shows the "backend unavailable" flow: it clears the stored session and
     * navigates to the Login page after the user dismisses the message. Guarded
     * so the flow only shows once until the dialog is closed.
     *
     * @param {string} messageKey the i18n key shown in the MessageBox
     */
    protected showBackendError(messageKey = "backendUnavailable"): void {
        if (this._backendErrorShown) {
            return;
        }

        this._backendErrorShown = true;
        SessionStorage.clear();

        MessageBox.error(this.getText(messageKey), {
            onClose: () => {
                this._backendErrorShown = false;
                this.navTo("Login");
            }
        });
    }
}