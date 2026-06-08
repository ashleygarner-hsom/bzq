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
  
  /**
   * Retrieves a property value from an Object's Datasheet via a lookup value.
   * @param {string} objectName - Short or full name of the object
   * @param {string|number} lookupValue - The value to look up in the left-most column
   * @param {string} propertyName - The name of the property/header to retrieve
   * @returns {any|null} The value of the property, or null if not found
   */
  static getObjectPropertyValue(objectName, lookupValue, propertyName) {
    if (!objectName || lookupValue === undefined || lookupValue === null || !propertyName) {
      return null;
    }
    
    // Retrieve object configuration
    let objConfig = ConfigurationManager.getObjectConfiguration(objectName, 'objectName');
    if (!objConfig) {
      objConfig = ConfigurationManager.getObjectConfiguration(objectName, 'object');
    }
    if (!objConfig) {
      LoggingManager.LogError_(`Configuration not found for object '${objectName}'`);
      return null;
    }
    
    const spreadsheetId = objConfig["Spreadsheet Id"];
    const sheetName = objConfig["Datasheet"];
    const headerNumber = Number(objConfig["Header Number"]) || 1;
    
    if (!spreadsheetId || !sheetName) {
      LoggingManager.LogError_(`Invalid spreadsheet ID or sheet name in configuration for object '${objectName}'`);
      return null;
    }
    
    try {
      let spreadsheet;
      const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
      if (spreadsheetId === activeSpreadsheet.getId()) {
        spreadsheet = activeSpreadsheet;
      } else {
        spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      }
      
      const sheet = spreadsheet.getSheetByName(sheetName);
      if (!sheet) {
        LoggingManager.LogError_(`Sheet '${sheetName}' not found in workbook '${spreadsheetId}'`);
        return null;
      }
      
      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      if (lastRow < headerNumber || lastCol < 1) {
        return null;
      }
      
      const data = sheet.getRange(headerNumber, 1, lastRow - headerNumber + 1, lastCol).getValues();
      const headers = data[0].map(h => String(h).trim());
      const targetColIndex = headers.indexOf(propertyName);
      if (targetColIndex === -1) {
        LoggingManager.LogError_(`Property '${propertyName}' not found in headers for sheet '${sheetName}'`);
        return null;
      }
      
      // Match the lookup value in the left-most column (index 0)
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim() === String(lookupValue).trim()) {
          return data[i][targetColIndex];
        }
      }
    } catch (err) {
      LoggingManager.LogError_(`Error in getObjectPropertyValue: ` + err.message);
    }
    return null;
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

/**
 * Retrieves a property value from an Object's Datasheet via a lookup value.
 * Exposes this utility to spreadsheet users as a custom function.
 * Note: When used as a custom formula in a cell, this function can only read from the active spreadsheet due to Apps Script permission restrictions.
 *
 * @param {string} objectName The short or full name of the object.
 * @param {string} lookupValue The value to search for in the first column of the datasheet.
 * @param {string} propertyName The header name of the column to retrieve the value from.
 * @return {any} The value of the property from the matching record.
 * @customfunction
 */
function GET_OBJECT_PROPERTY(objectName, lookupValue, propertyName) {
  return GlobalUtilities.getObjectPropertyValue(objectName, lookupValue, propertyName);
}

/**
 * Retrieves a property value from an Object's Datasheet via a lookup value.
 * @param {string} objectName - Short or full name of the object
 * @param {string|number} lookupValue - The value to look up in the left-most column
 * @param {string} propertyName - The name of the property/header to retrieve
 * @returns {any|null} The value of the property, or null if not found
 */
function globalUtilities_GetObjectPropertyValue(objectName, lookupValue, propertyName) {
  return GlobalUtilities.getObjectPropertyValue(objectName, lookupValue, propertyName);
}
