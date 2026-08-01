import { BaseController } from "./BaseController";
import { AuthenticationService } from "../auth/AuthenticationService";

export default class Login extends BaseController {

    public onInit(): void {
        console.log(this);
        console.log(this instanceof BaseController);
    }

    public async onLogin(): Promise<void> {

        await AuthenticationService.login();

        this.navTo("Home");

    }

    public onSecondaryAction(): void {
        this.navTo("Home");
    }

}