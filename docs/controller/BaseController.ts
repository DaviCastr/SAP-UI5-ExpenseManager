/// <reference types="@sapui5/types" />
import Controller from "sap/ui/core/mvc/Controller";
import UIComponent from "sap/ui/core/UIComponent";
import Router from "sap/ui/core/routing/Router";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";

export abstract class BaseController extends Controller {

    protected getRouter(): Router {
        return UIComponent.getRouterFor(this);
    }

    protected navTo(route: string, parameters?: object): void {
        this.getRouter().navTo(route, parameters);
    }

    protected getResourceBundle(): ResourceBundle {
        return ( (this.getOwnerComponent() as any)
            .getModel("i18n") as ResourceModel)
            .getResourceBundle() as ResourceBundle;
    }

}