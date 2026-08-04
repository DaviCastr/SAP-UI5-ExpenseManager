import XMLView from "sap/ui/core/mvc/XMLView";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";

export function getResourceBundle(view: XMLView): ResourceBundle | null {
    const model = view.getModel("i18n") as ResourceModel | undefined;
    if (!model) {
        return null;
    }
    const bundle = model.getResourceBundle();
    return bundle instanceof Promise ? null : bundle;
}

export function getText(view: XMLView, key: string, parameters?: string[]): string {
    return getResourceBundle(view)?.getText(key, parameters) ?? key;
}
