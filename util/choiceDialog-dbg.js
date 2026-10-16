sap.ui.define(["sap/m/Dialog", "sap/m/Button", "sap/m/Text", "sap/m/VBox", "sap/m/library", "sap/ui/core/library"], function (Dialog, Button, Text, VBox, sap_m_library, sap_ui_core_library) {
  "use strict";

  const ButtonType = sap_m_library["ButtonType"];
  const DialogType = sap_m_library["DialogType"];
  const ValueState = sap_ui_core_library["ValueState"];
  /**
   * Asks the user to pick one of several actions. Unlike a MessageBox with many
   * actions, every choice stays visible as a full-width button on small screens
   * instead of being folded into an overflow menu.
   *
   * @param {ChoiceDialogOptions} options title, message, choices and optional cancel text
   * @returns {Promise<string | null>} the key of the chosen action, or null when cancelled
   */
  function chooseAction(options) {
    return new Promise(resolve => {
      let chosen = null;
      const dialog = new Dialog({
        type: DialogType.Message,
        title: options.title,
        state: options.state ?? ValueState.Warning,
        contentWidth: "26rem",
        content: new VBox({
          items: [new Text({
            text: options.message
          }).addStyleClass("sapUiSmallMarginBottom"), ...options.choices.map(choice => new Button({
            text: choice.text,
            type: choice.type ?? ButtonType.Default,
            width: "100%",
            press: () => {
              chosen = choice.key;
              dialog.close();
            }
          }).addStyleClass("sapUiTinyMarginTop"))]
        }),
        endButton: options.cancelText ? new Button({
          text: options.cancelText,
          press: () => dialog.close()
        }) : undefined,
        afterClose: () => {
          dialog.destroy();
          resolve(chosen);
        }
      });
      dialog.addStyleClass("choiceDialog");
      dialog.open();
    });
  }
  var __exports = {
    __esModule: true
  };
  __exports.chooseAction = chooseAction;
  return __exports;
});
//# sourceMappingURL=choiceDialog-dbg.js.map
