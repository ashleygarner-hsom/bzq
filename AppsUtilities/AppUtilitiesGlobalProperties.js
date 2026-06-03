class AppUtilitiesGlobalProperties {
  /**
   * Static reference to the Configuration Properties workbook to be used when library is called
   */
  static get configurationPropertiesWorkbookId_(){
    return "1SyMoGrqy7_JdQ2VbUwsv6ALvMmX9765mKZRJK8pYkew";
  }
  /**
   * Static reference to the Configuration Properties sheet
   */
  static get configurationPropertiesSheetName_(){
    return "__ConfigurationProperties";
  }
  /**
   * Static reference to the Sequence Configuration sheet
   */
  static get sequenceConfigurationSheetName_(){
    return "__SequenceConfiguration";
  }
    /**
     * Looks in the first (or provided) row of the specified sheet in the specified workbook for the provided string header name, to determine which column it occupies, for the purpose of identifying the correct column values to use for validation in other records
     * @param {SpreadsheetService.Spreadsheet} spreadsheet - The spreadsheet workbook to search in
     * @param {string} sheetName - Plural object name that is used as the sheet name for that object
     * @param {string} fieldNameToLocate - Name of the id field, typically the single form of the sheet name
     * @param {int} headerNum - The row of the data sheet where primary headers are located, defaults to 1 unless provided
     * @return {int} The 1-indexed column number of the provided field name in the provided sheet
     */
    static getColumnIndexOnSheet(spreadsheetId, sheetName, fieldNameToLocate, headerNum = 1) {
      console.log(spreadsheetId);
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const sheet = spreadsheet.getSheetByName(sheetName);
      const range = sheet.getRange(`${headerNum}:${headerNum}`);
      return range.createTextFinder(fieldNameToLocate).findNext().getColumn();
    }
}
/**
 * Tests the AppUtilitiesGlobalProperties class
 * In most productioin cases this method should only return the name of the module, e.g. "Apps Utilities"
 * However, for purposes of development and validation, it is a good place to put test code for the class
 */
function testAppUtilitiesGlobalProperties(){
  
}
