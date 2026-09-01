/**
 * Holds global configuration property keys, sheet names, and workbook IDs for the FormsEngine library.
 */
class FormsEngineGlobalProperties {
  /**
   * Static reference to the Forms Engine workbook ID.
   * @type {string}
   * @private
   */
  static get formsEngineWorkbookId_(){
    const env = typeof BZQ_ENV !== "undefined" ? BZQ_ENV : null;
    const suffix = (env && env !== "PROD") ? " " + env : "";
    const searchName = "Forms Engine" + suffix;
    return AppsUtilities.BqzStateService.resolveAndCacheWorkbookId("BZQ_FORMS_SS_ID", searchName);
  }
  /**
   * Static reference to the Forms List sheet name.
   * @type {string}
   * @private
   */
  static get formsListSheetName_(){
    return "Forms";
  }
}