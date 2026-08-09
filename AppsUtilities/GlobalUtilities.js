/**
 * Static class that contains general sheet management utilities.
 * Provides helper operations for column coordinate lookups, row serialization, and record property mapping.
 */
class GlobalUtilities {
  /**
   * Looks in the first (or provided) row of the specified sheet in the specified workbook for the provided string header name.
   * Finds the 1-based column index of a header.
   * @param {{ spreadsheetId: string, sheetName: string }} sheetInfo - Sheet identifying info containing spreadsheetId and sheetName.
   * @param {string} fieldNameToLocate - Name of the header field to locate.
   * @param {number} [headerNum=1] - The row index of the datasheet where primary headers are located (defaults to 1).
   * @returns {number} The 1-based column index of the located field.
   * @throws {Error} If the spreadsheet/sheet cannot be opened or if the field is not found.
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
   * Gets the letter of the column index in the provided spreadsheet.
   * @param {string} spreadSheetId - The ID of the spreadsheet workbook.
   * @param {string} sheetName - The name of the sheet to look in.
   * @param {number} columnNumber - The 1-based column index number.
   * @returns {string} The letter of the column in a string (e.g., "A", "Z", "AA").
   * @throws {Error} If the spreadsheet or sheet cannot be opened.
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
   * Dynamically maps a row array of cells to a key-value object using the headers list.
   * Skips empty column headers.
   * @param {string[]} headers - Sheet header columns list.
   * @param {any[]} row - Data row values in corresponding indices.
   * @returns {Object<string, any>} Mapped object with keys corresponding to headers.
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
   * Maps values in the first column to the values in the target column.
   * @param {Array<Array<*>>} data - The 2D array of sheet values.
   * @param {number} targetColIndex - The 0-based column index representing the target property column.
   * @returns {Object<string, *>} Lookup map mapping trimmed key strings to target values.
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
   * @param {string|number|Array<Array<*>>} lookupValue - Single search value or 2D array of values.
   * @param {Object<string, *>} lookupMap - The lookup map built using buildLookupMap_.
   * @returns {Array<Array<*>>|Array<*>} The resolved lookup value(s), maintaining the original dimensions.
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
   * @param {string} objectName - Short or full name of the object type.
   * @param {string|number|Array<Array<*>>} lookupValue - The single value or 2D array of values to look up.
   * @param {string} propertyName - The header/property name of the column to retrieve the value from.
   * @returns {any|Array<Array<*>>|null} The resolved property value(s), or null if not found.
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
   * Looks up configuration properties or falls back to sheet name matching.
   * @param {string} objectName - Short or full name of the object type.
   * @returns {{ spreadsheetId: string, sheetName: string, headerNumber: number }|null} The sheet location and header configuration, or null if unresolved.
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
    const candidateNames = [`${objectName}s`, objectName];
    for (const name of candidateNames) {
      if (activeSpreadsheet.getSheetByName(name)) {
        return { spreadsheetId: activeSpreadsheet.getId(), sheetName: name, headerNumber: 1 };
      }
    }
    return null;
  }

  /**
   * Helper to retrieve values and headers from a target spreadsheet sheet.
   * @param {string} spreadsheetId - The ID of the target spreadsheet.
   * @param {string} sheetName - The name of the target sheet.
   * @param {number} headerNumber - The 1-based row index of the headers.
   * @returns {{ sheetName: string, headers: string[], data: Array<Array<*>> }|null} Sheet data metadata and grid values, or null if empty/missing.
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
   * @param {string} objectName - Short or full name of the object.
   * @returns {{ sheetName: string, headers: string[], data: Array<Array<*>> }|null} Sheet data metadata and grid values, or null if configuration or read error occurs.
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
 * @param {string} spreadsheetId - The target spreadsheet ID.
 * @param {string} sheetName - The target sheet name.
 * @param {string} fieldNameToLocate - The header name string to locate.
 * @param {number} [headerNum=1] - The 1-based header row index (defaults to 1).
 * @returns {number} The 1-based column index of the located field.
 * @deprecated Deprecated on 2026-06-24. Will be obsolete and safe to remove on or after 2026-12-24.
 * Use GlobalUtilities.getColumnIndexOnSheet instead.
 */
function globalUtilities_GetColumnIndexOnSheet(spreadsheetId, sheetName, fieldNameToLocate, headerNum = 1) {
  return GlobalUtilities.getColumnIndexOnSheet({ spreadsheetId, sheetName }, fieldNameToLocate, headerNum);
}

/**
 * Gets the letter of the column index in the provided spreadsheet.
 * @param {string} spreadSheetId - The target spreadsheet ID.
 * @param {string} sheetName - The name of the sheet to look in.
 * @param {number} columnNumber - The 1-based column index.
 * @returns {string} The column letter string.
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
 * @param {string} objectName - The short or full name of the object.
 * @param {string} lookupValue - The value to search for in the first column of the datasheet.
 * @param {string} propertyName - The header name of the column to retrieve the value from.
 * @returns {any} The value of the property from the matching record.
 * @customfunction
 */
function GET_OBJECT_PROPERTY(objectName, lookupValue, propertyName) {
  return GlobalUtilities.getObjectPropertyValue(objectName, lookupValue, propertyName);
}

/**
 * Retrieves a property value from an Object's Datasheet via a lookup value.
 * @param {string} objectName - The short or full name of the object.
 * @param {string} lookupValue - The value to search for in the first column of the datasheet.
 * @param {string} propertyName - The header name of the column to retrieve the value from.
 * @returns {any} The value of the property from the matching record.
 * @deprecated Deprecated on 2026-06-24. Will be obsolete and safe to remove on or after 2026-12-24.
 * Use GlobalUtilities.getObjectPropertyValue instead.
 */
function globalUtilities_GetObjectPropertyValue(objectName, lookupValue, propertyName) {
  return GlobalUtilities.getObjectPropertyValue(objectName, lookupValue, propertyName);
}
