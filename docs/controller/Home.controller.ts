import { BaseController } from "./BaseController";
import MessageToast from "sap/m/MessageToast";

export default class Home extends BaseController {

    public onOpenInsights(): void {
        const message = this.getResourceBundle().getText("insightsMessage") ?? "Insights ready";
        MessageToast.show(message);
    }

}   