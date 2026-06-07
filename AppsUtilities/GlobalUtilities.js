/**
 * Static class that contains general sheet management utilities
 */
class GlobalUtilities{
  /**
   * Looks in the first (or provided) row of the specified sheet in the specified workbook for the provided string header name, to determine which column it occupies, for the purpose of identifying the correct column values to use for validation in other records
   * @param {string} spreadsheetId - Id of the spreadsheet to look in
   * @param {string} sheetName - Plural object name that is used as the sheet name for that object
   * @param {string} fieldNameToLocate - Name of the id field, typically the single form of the sheet name
   * @param {int} headerNum - The row of the data sheet where primary headers are located, defaults to 1 unless provided
   * @returns {int} The column number of the located field
   */
  static getColumnIndexOnSheet(spreadsheetId, sheetName, fieldNameToLocate, headerNum = 1) {
    return SpreadsheetApp.openById(spreadsheetId)
                         .getSheetByName(sheetName)
                         .getRange(`${headerNum}:${headerNum}`)
                         .createTextFinder(fieldNameToLocate)
                         .findNext()
                         .getColumn();
  }
  /**
   * Gets the letter of the column index in the provided spreadsheet
   * @param {string} spreadsheetId - Spreadsheet we are looking in
   * @param {string} sheetName - The name of the sheet to look in
   * @param {int} columnNumber - Number of the column in the sheet to lookup
   * @returns {string} The letter of the column in a string
   */
  static getColumnLetter(spreadSheetId, sheetName, columnNumber) {
    // Creates a range at row 1 and the target column, then gets its A1 notation and removes the row
    return SpreadsheetApp.openById(spreadSheetId)
                            .getSheetByName(sheetName)
                            .getRange(1, columnNumber)
                            .getA1Notation()
                            .replace(/\d/g, "")
  }
  /**
   * Dynamically maps a row array to a key-value object using the headers list.
   * @param {string[]} headers - Sheet header columns
   * @param {any[]} row - Data row values
   * @returns {Object} Mapped object
   */
  static getRowDataAsObject(headers, row) {
    const obj = {};
    headers.forEach((header, index) => {
      const headerStr = String(header).trim();
      if (headerStr !== '') {
        obj[headerStr] = row[index];
      }
    });
    return obj;
  }
}

/**
 * Looks in the first (or provided) row of the specified sheet in the specified workbook for the provided string header name, to determine which column it occupies, for the purpose of identifying the correct column values to use for validation in other records
 * @param {string} spreadsheetId - The spreadsheet workbook to search in
 * @param {string} sheetName - Plural object name that is used as the sheet name for that object
 * @param {string} fieldNameToLocate - Name of the id field, typically the single form of the sheet name
 * @param {int} headerNum - The row of the data sheet where primary headers are located, defaults to 1 unless provided
 */
function globalUtilities_GetColumnIndexOnSheet(spreadsheetId, sheetName, fieldNameToLocate, headerNum = 1){
  return GlobalUtilities.getColumnIndexOnSheet(spreadsheetId, sheetName, fieldNameToLocate, headerNum = 1)
}
/**
 * Gets the letter of the column index in the provided spreadsheet
 * @param {string} spreadsheetId - Spreadsheet we are looking in
 * @param {string} sheetName - The name of the sheet to look in
 * @param {int} columnNumber - Number of the column in the sheet to lookup
 * @returns {string} The letter of the column in a string
 */
function globalUtilities_GetColumnLetter(spreadSheetId, sheetName, columnNumber){
  return GlobalUtilities.getColumnLetter(spreadSheetId, sheetName, columnNumber);
}
