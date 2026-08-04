sap.ui.define([], function () {
  "use strict";

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
      return binding.getBoundContext()?.getObject();
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
  __exports.ODataService = ODataService;
  return __exports;
});
//# sourceMappingURL=ODataService-dbg.js.map
