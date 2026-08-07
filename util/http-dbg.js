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
  class AccessDeniedError extends Error {
    constructor() {
      super("Acesso negado (CSRF ou permissão).");
      this.name = "AccessDeniedError";
    }
  }
  let csrfToken = null;
  async function fetchCsrfToken() {
    if (csrfToken) {
      return csrfToken;
    }
    const headers = buildHeaders({});
    headers.set("x-csrf-token", "Fetch");
    const response = await fetch(`${getOdataServiceUrl()}Persons`, {
      method: "GET",
      headers
    });
    csrfToken = response.headers.get("x-csrf-token") || null;
    return csrfToken || "";
  }
  const UNSAFE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
  async function request(path, init = {}) {
    const method = (init.method || "GET").toUpperCase();
    const isUnsafe = UNSAFE_METHODS.includes(method);
    let response;
    try {
      const headers = buildHeaders(init);
      if (isUnsafe) {
        const csrf = await fetchCsrfToken();
        if (csrf) {
          headers.set("x-csrf-token", csrf);
        }
      }
      response = await fetch(`${getOdataServiceUrl()}${path}`, {
        ...init,
        headers
      });
    } catch (error) {
      throw new BackendUnavailableError();
    }
    if (response.status === 401) {
      AuthenticationService.notifySessionExpired();
      throw new SessionExpiredError();
    }
    if (response.status === 403) {
      throw new AccessDeniedError();
    }
    return response;
  }
  function isSessionExpiredError(error) {
    return error instanceof SessionExpiredError;
  }
  function isAccessDeniedError(error) {
    return error instanceof AccessDeniedError;
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
  __exports.AccessDeniedError = AccessDeniedError;
  __exports.UNSAFE_METHODS = UNSAFE_METHODS;
  __exports.request = request;
  __exports.isSessionExpiredError = isSessionExpiredError;
  __exports.isAccessDeniedError = isAccessDeniedError;
  __exports.isBackendUnavailableError = isBackendUnavailableError;
  return __exports;
});
//# sourceMappingURL=http-dbg.js.map
