import Dialog from "sap/m/Dialog";
import Button from "sap/m/Button";
import Text from "sap/m/Text";
import VBox from "sap/m/VBox";
import { ButtonType, DialogType } from "sap/m/library";
import { ValueState } from "sap/ui/core/library";

export interface DialogChoice {
    key: string;
    text: string;
    type?: ButtonType;
}

export interface ChoiceDialogOptions {
    title: string;
    message: string;
    state?: ValueState;
    choices: DialogChoice[];
    cancelText?: string;
}

/**
 * Asks the user to pick one of several actions. Unlike a MessageBox with many
 * actions, every choice stays visible as a full-width button on small screens
 * instead of being folded into an overflow menu.
 *
 * @param {ChoiceDialogOptions} options title, message, choices and optional cancel text
 * @returns {Promise<string | null>} the key of the chosen action, or null when cancelled
 */
export function chooseAction(options: ChoiceDialogOptions): Promise<string | null> {
    return new Promise((resolve) => {
        let chosen: string | null = null;

        const dialog: Dialog = new Dialog({
            type: DialogType.Message,
            title: options.title,
            state: options.state ?? ValueState.Warning,
            contentWidth: "26rem",
            content: new VBox({
                items: [
                    new Text({ text: options.message }).addStyleClass("sapUiSmallMarginBottom"),
                    ...options.choices.map((choice) => new Button({
                        text: choice.text,
                        type: choice.type ?? ButtonType.Default,
                        width: "100%",
                        press: () => {
                            chosen = choice.key;
                            dialog.close();
                        }
                    }).addStyleClass("sapUiTinyMarginTop"))
                ]
            }),
            endButton: options.cancelText
                ? new Button({ text: options.cancelText, press: () => dialog.close() })
                : undefined,
            afterClose: () => {
                dialog.destroy();
                resolve(chosen);
            }
        });

        dialog.addStyleClass("choiceDialog");
        dialog.open();
    });
}
