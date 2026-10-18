import JSONModel from "sap/ui/model/json/JSONModel";
import Device from "sap/ui/Device";
import { isStandalone } from "../util/pwa";

export function createDeviceModel () {
    const model = new JSONModel(Device);
    model.setProperty("/system/stretchDialogs", Device.system.phone && !isStandalone());
    model.setDefaultBindingMode("OneWay");
    return model;
}
