import { BaseController } from "./BaseController";
import { AuthenticationService } from "../auth/AuthenticationService";
import Environment, { EnvironmentType } from "../util/Environment";
import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";

export default class Login extends BaseController {

    public onInit(): void {
        void AuthenticationService.isAuthenticated()
            .then((authenticated) => {
                if (authenticated) {
                    this.navTo("Home");
                }
            })
            .catch(() => {
                this.showBackendUnavailable();
            });
    }

    public async onLogin(): Promise<void> {
        try {
            await AuthenticationService.login();
        } catch (error) {
            this.showBackendUnavailable();
            return;
        }

        if (Environment.current() === EnvironmentType.GITHUB) {
            MessageToast.show(this.getText("loginRedirecting"));
            return;
        }

        MessageToast.show(this.getText("loginAwaitBtp"));
    }

    private showBackendUnavailable(): void {
        if (Environment.current() === EnvironmentType.GITHUB) {
            MessageBox.error(this.getText("backendUnavailableLogin"));
        }
    }

}