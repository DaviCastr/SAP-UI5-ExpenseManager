import { BaseController } from "./BaseController";
import { AuthenticationService } from "../auth/AuthenticationService";
import Environment, { EnvironmentType } from "../util/Environment";
import MessageToast from "sap/m/MessageToast";

export default class Login extends BaseController {

    public onInit(): void {
        void AuthenticationService.isAuthenticated().then((authenticated) => {
            if (authenticated) {
                this.navTo("Home");
            }
        });
    }

    public async onLogin(): Promise<void> {
        await AuthenticationService.login();

        if (Environment.current() === EnvironmentType.GITHUB) {
            this.navTo("Home");
            return;
        }

        MessageToast.show("Aguarde a autenticação do BTP");
    }

    public onSecondaryAction(): void {
        this.navTo("Home");
    }

}