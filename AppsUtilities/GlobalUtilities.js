/**
 * Static class that contains general sheet management utilities
 */
class GlobalUtilities {
  /**
   * Looks in the first (or provided) row of the specified sheet in the specified workbook for the provided string header name.
   * @param {Object} sheetInfo - Sheet identifying info { spreadsheetId, sheetName }
   * @param {string} fieldNameToLocate - Name of the id field, typically the single form of the sheet name
   * @param {number} headerNum - The row of the data sheet where primary headers are located, defaults to 1
   * @returns {number} The column number of the located field
   */
  static getColumnIndexOnSheet(sheetInfo, fieldNameToLocate, headerNum = 1) {
    const { spreadsheetId, sheetName } = sheetInfo;
    const ss = SpreadsheetApp.openById(spreadsheetId);
    if (!ss) throw new Error(`Spreadsheet with ID '${spreadsheetId}' could not be opened.`);
    
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error(`Sheet '${sheetName}' not found in spreadsheet '${spreadsheetId}'`);
    
    const finder = sheet.getRange(`${headerNum}:${headerNum}`).createTextFinder(fieldNameToLocate).findNext();
    if (!finder) {
      throw new Error(`Field '${fieldNameToLocate}' not found in row ${headerNum} of sheet '${sheetName}'`);
    }
    return finder.getColumn();
  }

  /**
   * Gets the letter of the column index in the provided spreadsheet
   * @param {string} spreadSheetId - Spreadsheet we are looking in
   * @param {string} sheetName - The name of the sheet to look in
   * @param {number} columnNumber - Number of the column in the sheet to lookup
   * @returns {string} The letter of the column in a string
   */
  static getColumnLetter(spreadSheetId, sheetName, columnNumber) {
    const ss = SpreadsheetApp.openById(spreadSheetId);
    if (!ss) throw new Error(`Spreadsheet with ID '${spreadSheetId}' could not be opened.`);
    
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error(`Sheet '${sheetName}' not found in spreadsheet '${spreadSheetId}'`);
    
    return sheet.getRange(1, columnNumber)
                .getA1Notation()
                .replace(/\d/g, "");
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
   * Helper to build a lookup map from sheet data.
   * @private
   */
  static buildLookupMap_(data, targetColIndex) {
    const lookupMap = {};
    for (let i = 1; i < data.length; i++) {
      const key = String(data[i][0]).trim();
      if (key) {
        lookupMap[key] = data[i][targetColIndex];
      }
    }
    return lookupMap;
  }

  /**
   * Helper to resolve lookup values in a 2D array or list.
   * @private
   */
  static resolveLookupArray_(lookupValue, lookupMap) {
    return lookupValue.map(row => {
      if (Array.isArray(row)) {
        return row.map(cell => {
          const val = lookupMap[String(cell).trim()];
          return val !== undefined ? val : null;
        });
      }
      const val = lookupMap[String(row).trim()];
      return val !== undefined ? val : null;
    });
  }
  
  /**
   * Retrieves a property value from an Object's Datasheet via a lookup value.
   * Supports both single values and 2D arrays (useful inside ARRAYFORMULA).
   * @param {string} objectName - Short or full name of the object
   * @param {string|number|any[][]} lookupValue - The single value or 2D array of values to look up
   * @param {string} propertyName - The name of the property/header to retrieve
   * @returns {any|any[][]|null} The resolved property value(s), or null if not found
   */
  static getObjectPropertyValue(objectName, lookupValue, propertyName) {
    if (!objectName || lookupValue === undefined || lookupValue === null || !propertyName) {
      return null;
    }
    const isArray = Array.isArray(lookupValue);
    const getFallback = () => isArray ? lookupValue.map(row => (Array.isArray(row) ? row.map(() => null) : null)) : null;
    
    const sheetInfo = this.getDatasheetData_(objectName);
    if (!sheetInfo) return getFallback();
    
    const { sheetName, headers, data } = sheetInfo;
    const targetColIndex = headers.indexOf(propertyName);
    if (targetColIndex === -1) {
      LoggingManager.LogError_(`Property '${propertyName}' not found in headers for sheet '${sheetName}'`);
      return getFallback();
    }
    
    const lookupMap = this.buildLookupMap_(data, targetColIndex);
    if (isArray) {
      return this.resolveLookupArray_(lookupValue, lookupMap);
    }
    const val = lookupMap[String(lookupValue).trim()];
    return val !== undefined ? val : null;
  }

  /**
   * Resolves the sheet configuration for a given object.
   * @private
   */
  static resolveSheetConfig_(objectName) {
    let objConfig = null;
    try {
      objConfig = ConfigurationManager.getObjectConfiguration(objectName, 'objectName');
      if (!objConfig) {
        objConfig = ConfigurationManager.getObjectConfiguration(objectName, 'object');
      }
    } catch (e) {}
    
    if (objConfig) {
      return {
        spreadsheetId: objConfig["Spreadsheet Id"],
        sheetName: objConfig["Datasheet"],
        headerNumber: Number(objConfig["Header Number"]) || 1
      };
    }
    
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const candidateNames = [`__${objectName}s`, `${objectName}s`, objectName];
    for (const name of candidateNames) {
      if (activeSpreadsheet.getSheetByName(name)) {
        return { spreadsheetId: activeSpreadsheet.getId(), sheetName: name, headerNumber: 1 };
      }
    }
    return null;
  }

  /**
   * Helper to retrieve values and headers from a target spreadsheet sheet.
   * @private
   */
  static readSheetDataRange_(spreadsheetId, sheetName, headerNumber) {
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const spreadsheet = (spreadsheetId === activeSpreadsheet.getId())
      ? activeSpreadsheet
      : SpreadsheetApp.openById(spreadsheetId);
      
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      LoggingManager.LogError_(`Sheet '${sheetName}' not found in workbook '${spreadsheetId}'`);
      return null;
    }
    
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < headerNumber || lastCol < 1) return null;
    
    const data = sheet.getRange(headerNumber, 1, lastRow - headerNumber + 1, lastCol).getValues();
    if (data.length === 0) return null;
    
    return {
      sheetName,
      headers: data[0].map(h => String(h).trim()),
      data
    };
  }

  /**
   * Retrieves headers and row data for an object's datasheet.
   * @param {string} objectName - Short or full name of the object
   * @returns {Object|null} Object containing { sheetName, headers, data } or null if not found/error
   * @private
   */
  static getDatasheetData_(objectName) {
    const config = this.resolveSheetConfig_(objectName);
    if (!config || !config.spreadsheetId || !config.sheetName) {
      LoggingManager.LogError_(`Invalid configuration for object '${objectName}'`);
      return null;
    }
    try {
      return this.readSheetDataRange_(config.spreadsheetId, config.sheetName, config.headerNumber);
    } catch (err) {
      LoggingManager.LogError_(`Error in getDatasheetData_: ` + err.message);
    }
    return null;
  }
}

/**
 * Looks in the first (or provided) row of the specified sheet in the specified workbook for the provided string header name.
 * @deprecated Deprecated on 2026-06-24. Will be obsolete and safe to remove on or after 2026-12-24.
 * Use GlobalUtilities.getColumnIndexOnSheet instead.
 */
function globalUtilities_GetColumnIndexOnSheet(spreadsheetId, sheetName, fieldNameToLocate, headerNum = 1) {
  return GlobalUtilities.getColumnIndexOnSheet({ spreadsheetId, sheetName }, fieldNameToLocate, headerNum);
}

/**
 * Gets the letter of the column index in the provided spreadsheet
 * @deprecated Deprecated on 2026-06-24. Will be obsolete and safe to remove on or after 2026-12-24.
 * Use GlobalUtilities.getColumnLetter instead.
 */
function globalUtilities_GetColumnLetter(spreadSheetId, sheetName, columnNumber) {
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
 * @deprecated Deprecated on 2026-06-24. Will be obsolete and safe to remove on or after 2026-12-24.
 * Use GlobalUtilities.getObjectPropertyValue instead.
 */
function globalUtilities_GetObjectPropertyValue(objectName, lookupValue, propertyName) {
  return GlobalUtilities.getObjectPropertyValue(objectName, lookupValue, propertyName);
}
