sap.ui.define([], function () {
  "use strict";

  /**
   * CAP controllers reply with a `{ data, status }` envelope (BaseControllerResponse).
   * Unwraps the payload so callers receive the actual function/action result.
   *
   * @param {unknown} value the raw value returned by the OData model
   * @returns {unknown} the unwrapped payload (or the original value when not an envelope)
   */
  function unwrapControllerResult(value) {
    // eslint-disable-next-line no-console
    console.log("[unwrapControllerResult] value:", value);
    if (value && typeof value === "object" && "data" in value && "status" in value) {
      return value.data;
    }
    return value;
  }

  /**
   * Draft-aware query options for draft-enabled entities.
   *
   * The filter lists active entities together with drafts that have no active
   * sibling, without duplicating entities that exist in both versions.
   */
  const DRAFT_FILTER = "(IsActiveEntity eq true or SiblingEntity/IsActiveEntity eq null)";
  const DRAFT_EXPAND = "DraftAdministrativeData($select=DraftUUID,InProcessByUser)";

  /**
   * Thin, typed wrapper around the shared OData V4 model.
   *
   * Every read/write the application performs against the CAP backend goes
   * through this class so the controllers never deal with raw bindings.
   */
  class ODataService {
    constructor(model) {
      this.model = model;
    }
    getModel() {
      return this.model;
    }
    getServiceUrl() {
      return this.model.getServiceUrl();
    }
    async requestEntitySet(entitySet, parameters) {
      const bindingParameters = {};
      if (parameters?.select?.length) {
        bindingParameters.$select = parameters.select.join(",");
      }
      if (parameters?.expand) {
        bindingParameters.$expand = parameters.expand;
      }
      if (parameters?.count) {
        bindingParameters.$count = "true";
      }
      if (parameters?.filterExpression) {
        bindingParameters.$filter = parameters.filterExpression;
      }
      const binding = this.model.bindList(`/${entitySet}`, undefined, undefined, parameters?.filters, bindingParameters);
      const contexts = await binding.requestContexts();
      return contexts.map(context => context.getObject());
    }
    async requestFunction(path, parameters) {
      const binding = this.model.bindContext(`${path}(...)`);
      for (const [name, value] of Object.entries(parameters)) {
        binding.setParameter(name, value);
      }
      await binding.invoke();
      return unwrapControllerResult(binding.getBoundContext()?.getObject());
    }
    async requestAction(path, parameters) {
      const binding = this.model.bindContext(`${path}(...)`);
      for (const [name, value] of Object.entries(parameters)) {
        binding.setParameter(name, value);
      }
      await binding.invoke();
    }
    getMediaUrl(mediaPath) {
      return `${this.getServiceUrl()}${mediaPath}`;
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.DRAFT_FILTER = DRAFT_FILTER;
  __exports.DRAFT_EXPAND = DRAFT_EXPAND;
  __exports.ODataService = ODataService;
  return __exports;
});
//# sourceMappingURL=ODataService-dbg.js.map
