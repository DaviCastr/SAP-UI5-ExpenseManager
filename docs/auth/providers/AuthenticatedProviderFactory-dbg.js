sap.ui.define(["../../util/Environment", "./BtpAuthenticationProvider", "./GithubPagesAuthenticationProvider", "./MockAuthenticationProvider"], function (__Environment, ___BtpAuthenticationProvider, ___GithubPagesAuthenticationProvider, ___MockAuthenticationProvider) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const Environment = _interopRequireDefault(__Environment);
  const EnvironmentType = __Environment["EnvironmentType"];
  const BtpAuthenticationProvider = ___BtpAuthenticationProvider["BtpAuthenticationProvider"];
  const GithubPagesAuthenticationProvider = ___GithubPagesAuthenticationProvider["GithubPagesAuthenticationProvider"];
  const MockAuthenticationProvider = ___MockAuthenticationProvider["MockAuthenticationProvider"];
  class AuthenticatedProviderFactory {
    static create() {
      switch (Environment.current()) {
        case EnvironmentType.BTP:
          return new BtpAuthenticationProvider();
        case EnvironmentType.GITHUB:
          return new GithubPagesAuthenticationProvider();
        case EnvironmentType.LOCAL:
        default:
          return new MockAuthenticationProvider();
      }
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.AuthenticatedProviderFactory = AuthenticatedProviderFactory;
  return __exports;
});
//# sourceMappingURL=AuthenticatedProviderFactory-dbg.js.map
