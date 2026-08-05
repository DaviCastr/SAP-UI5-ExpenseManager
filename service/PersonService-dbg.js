sap.ui.define([], function () {
  "use strict";

  const PERSON_SELECT = ["ID", "Name", "Income", "ExpenseTarget", "Currency", "Email", "Phone", "ImageType"];

  /**
   * Read model for the `Persons` entity of the ExpenseManager service.
   */
  class PersonService {
    constructor(odata) {
      this.odata = odata;
    }
    async fetchAll() {
      return this.odata.requestEntitySet("Persons", {
        select: PERSON_SELECT
      });
    }
    getImageUrl(person) {
      if (!person.ImageType) {
        return "";
      }
      return this.odata.getMediaUrl(`Persons(ID='${person.ID}',IsActiveEntity=true)/Image`);
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.PersonService = PersonService;
  return __exports;
});
//# sourceMappingURL=PersonService-dbg.js.map
