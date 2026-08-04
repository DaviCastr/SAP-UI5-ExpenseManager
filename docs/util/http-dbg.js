sap.ui.define(["../auth/AuthenticationService", "../auth/providers/XsuaaAuthHelper"], function (___auth_AuthenticationService, ___auth_providers_XsuaaAuthHelper) {
  "use strict";

  const AuthenticationService = ___auth_AuthenticationService["AuthenticationService"];
  const XsuaaAuthHelper = ___auth_providers_XsuaaAuthHelper["XsuaaAuthHelper"];
  function getToken() {
    const session = AuthenticationService.getSession();
    return session?.accessToken || "";
  }
  function getOdataServiceUrl() {
    return XsuaaAuthHelper.getConfig().odataService;
  }
  function buildHeaders(init) {
    const headers = new Headers(init.headers || {});
    const token = getToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return headers;
  }
  class BackendUnavailableError extends Error {
    constructor() {
      super("O serviço financeiro está indisponível.");
      this.name = "BackendUnavailableError";
    }
  }
  class SessionExpiredError extends Error {
    constructor() {
      super("Sua sessão expirou.");
      this.name = "SessionExpiredError";
    }
  }
  async function request(path, init = {}) {
    let response;
    try {
      response = await fetch(`${getOdataServiceUrl()}${path}`, {
        ...init,
        headers: buildHeaders(init)
      });
    } catch (error) {
      throw new BackendUnavailableError();
    }
    if (response.status === 401 || response.status === 403) {
      AuthenticationService.notifySessionExpired();
      throw new SessionExpiredError();
    }
    return response;
  }
  function isSessionExpiredError(error) {
    return error instanceof SessionExpiredError;
  }
  function isBackendUnavailableError(error) {
    return error instanceof BackendUnavailableError;
  }
  var __exports = {
    __esModule: true
  };
  __exports.getOdataServiceUrl = getOdataServiceUrl;
  __exports.buildHeaders = buildHeaders;
  __exports.BackendUnavailableError = BackendUnavailableError;
  __exports.SessionExpiredError = SessionExpiredError;
  __exports.request = request;
  __exports.isSessionExpiredError = isSessionExpiredError;
  __exports.isBackendUnavailableError = isBackendUnavailableError;
  return __exports;
});
//# sourceMappingURL=http-dbg.js.map
