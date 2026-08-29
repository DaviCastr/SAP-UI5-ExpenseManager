import JSONModel from "sap/ui/model/json/JSONModel";
import Device from "sap/ui/Device";

function isStandalone (): boolean {
    if (typeof window === "undefined" || !window.matchMedia) {
        return (window.navigator as { standalone?: boolean }).standalone === true;
    }
    return window.matchMedia("(display-mode: standalone)").matches
        || (window.navigator as { standalone?: boolean }).standalone === true;
}

export function createDeviceModel () {
    const model = new JSONModel(Device);
    model.setProperty("/system/stretchDialogs", Device.system.phone && !isStandalone());
    model.setDefaultBindingMode("OneWay");
    return model;
}
