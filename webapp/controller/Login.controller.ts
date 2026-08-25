import { BaseController } from "./BaseController";
import { AuthenticationService } from "../auth/AuthenticationService";
import Environment, { EnvironmentType } from "../util/Environment";
import MessageToast from "sap/m/MessageToast";

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

        if (Environment.current() === EnvironmentType.GITHUB || Environment.current() === EnvironmentType.LOCAL) {
            this.showToastMessage("loginRedirecting");
            return;
        }

        this.showToastMessage("loginAwaitBtp");
    }

    /**
     * Surfaces backend unavailability on the Login page.
     */
    private showBackendUnavailable(): void {
        this.showErrorMessage("backendUnavailableLogin");
    }

    private showToastMessage(messageKey: string): void {
        MessageToast.show(this.getText(messageKey));
    }

}