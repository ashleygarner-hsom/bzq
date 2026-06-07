/**
 * Contains tools for processing sheet data validation and dynamically updating rules when a new record is created
 */
class ValidationContext {
  /**
   * Helper to retrieve object configuration supporting both short and full object names.
   * @param {string} objectName - Short or full object name
   * @returns {Object|null} The configuration record object, or null if not found
   * @private
   */
  static getObjectConfig_(objectName) {
    let config = ConfigurationManager.getObjectConfiguration(objectName, 'objectName');
    if (!config) {
      config = ConfigurationManager.getObjectConfiguration(objectName, 'object');
    }
    return config;
  }

  /**
   * Runs during the onEdit event
   * @param {any} spreadsheet - The spreadsheet app context of the workbook
   * @param {string} sheetName - The name of the sheet where the edit event occurred
   * @param {any} e - The event context provided by the onEdit function
   */
  static processValidationContext_(spreadsheet, sheetName, e) {
    const objConfig = ConfigurationManager.getObjectConfiguration(sheetName, 'datasheetName');
    if (!objConfig) return;
    const enabled = String(objConfig["Enabled For Validation"]).toUpperCase() === 'TRUE';
    if (!enabled) return;
    this.processRecordEdit(spreadsheet, sheetName, e.range, objConfig);
  }

  /**
   * Processes validation and dynamic rules configuration for edited row(s) in a sheet.
   * Clears validations for any row where required fields are not fully filled.
   * @param {SpreadsheetApp.Spreadsheet} spreadsheet - The active spreadsheet
   * @param {string} sheetName - The edited sheet name
   * @param {SpreadsheetApp.Range} range - The edited range
   * @param {Object} objConfig - The object configuration record
   * @param {boolean} forceValidation - If true, bypasses the check for required fields and applies validation rules
   */
  static processRecordEdit(spreadsheet, sheetName, range, objConfig, forceValidation = false) {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) return;
    
    const fullObjectName = objConfig["Object"]; // Full name, e.g. "xOC-1009 - Test Object"
    const headerNumber = Number(objConfig["Header Number"]) || 1;
    
    // Retrieve validation configurations
    const lookups = ConfigurationManager.getLookupConfiguration(fullObjectName) || [];
    const dropdowns = ConfigurationManager.getDropdownConfigurations(fullObjectName) || [];
    
    // Retrieve primary/required fields list
    const primaryFields = objConfig["Primary Fields"] ? objConfig["Primary Fields"].split(",").map(f => f.trim()).filter(Boolean) : [];
    
    // Get headers to locate columns
    const lastCol = sheet.getLastColumn();
    if (lastCol === 0) return;
    const headers = sheet.getRange(headerNumber, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
    
    // Map header names to 1-based indices
    const headerIndices = {};
    headers.forEach((h, idx) => {
      if (h) {
        headerIndices[h] = idx + 1;
      }
    });
    
    const startRow = range.getRow();
    const numRows = range.getNumRows();
    const currentSpreadsheetId = spreadsheet.getId();
    
    for (let r = 0; r < numRows; r++) {
      const row = startRow + r;
      if (row <= headerNumber) continue;
      
      // Check if all primary/required fields are filled
      const allFilled = forceValidation || this.checkPrimaryFieldsFilled_(sheet, row, primaryFields, headerIndices);
      
      // If required fields are not filled, clear any validation on this row and stop processing
      if (!allFilled) {
        LoggingManager.LogDebugMessage_(`Required fields not fully filled for row ${row}. Clearing data validations.`);
        sheet.getRange(row, 1, 1, lastCol).clearDataValidations();
        continue;
      }
      
      // Set to track columns where we apply validation
      const processedCols = new Set();
      
      // Configure Lookups
      lookups.forEach(lookup => {
        let targetColName = lookup["Column Name"];
        if (!targetColName) {
          const targetConfig = ConfigurationManager.getObjectConfiguration(lookup["Target Object"], 'object');
          if (targetConfig) {
            targetColName = targetConfig["Object Name"];
          }
        }
        if (targetColName && headerIndices[targetColName]) {
          processedCols.add(headerIndices[targetColName]);
        }
        
        this.applyLookupValidation_(sheet, row, lookup, headerIndices, currentSpreadsheetId, spreadsheet);
      });
      
      // Configure Dropdowns
      dropdowns.forEach(dropdown => {
        const colName = dropdown["Dropdown Name"];
        if (colName && headerIndices[colName]) {
          processedCols.add(headerIndices[colName]);
        }
        
        this.applyDropdownValidation_(sheet, row, dropdown, headerIndices);
      });
      
      // Configure Global Dropdowns for any other columns matching global dropdown configurations
      headers.forEach((colName, idx) => {
        const colIndex = idx + 1;
        if (processedCols.has(colIndex)) return;
        
        this.applyGlobalDropdownValidation_(sheet, row, colName, colIndex);
      });
    }
  }

  /**
   * Helper to check if all primary fields are populated for a given row.
   * @param {SpreadsheetApp.Sheet} sheet - The target sheet
   * @param {number} row - The row index to check
   * @param {string[]} primaryFields - List of primary field column names
   * @param {Object} headerIndices - Map of column names to 1-based indices
   * @returns {boolean} True if all primary fields are filled, false otherwise
   * @private
   */
  static checkPrimaryFieldsFilled_(sheet, row, primaryFields, headerIndices) {
    for (const field of primaryFields) {
      const colIndex = headerIndices[field];
      if (!colIndex) continue;
      
      const val = sheet.getRange(row, colIndex).getValue();
      if (val === "" || val === null || val === undefined) {
        return false;
      }
    }
    return true;
  }

  /**
   * Applies validation rule for a configured lookup to a cell in a row.
   * @param {SpreadsheetApp.Sheet} sheet - The active sheet
   * @param {number} row - The row index
   * @param {Object} lookup - The lookup configuration record
   * @param {Object} headerIndices - Map of column names to 1-based indices
   * @param {string} currentSpreadsheetId - The ID of the current active spreadsheet
   * @param {SpreadsheetApp.Spreadsheet} spreadsheet - The active spreadsheet object
   * @private
   */
  static applyLookupValidation_(sheet, row, lookup, headerIndices, currentSpreadsheetId, spreadsheet) {
    const targetObjName = lookup["Target Object"]; // Full name
    let targetColName = lookup["Column Name"];
    
    // Default target column name to target object's short name if empty
    if (!targetColName) {
      const targetConfig = ConfigurationManager.getObjectConfiguration(targetObjName, 'object');
      if (targetConfig) {
        targetColName = targetConfig["Object Name"];
      }
    }
    
    if (!targetColName) return;
    const colIndex = headerIndices[targetColName];
    if (!colIndex) return;
    
    const targetCell = sheet.getRange(row, colIndex);
    const targetConfig = ConfigurationManager.getObjectConfiguration(targetObjName, 'object');
    if (!targetConfig) return;
    
    const targetSpreadsheetId = targetConfig["Spreadsheet Id"];
    let validationRange = null;
    
    if (targetSpreadsheetId && targetSpreadsheetId !== currentSpreadsheetId) {
      // Cross-workbook lookup: needs a helper sheet
      if (!this.doesHelperSheetExist(targetObjName, currentSpreadsheetId)) {
        this.createHelperSheet(targetObjName, currentSpreadsheetId);
      }
      this.populateHelperSheet(targetObjName, currentSpreadsheetId);
      
      const helperSheetName = this.getHelperRangeSheetName(targetObjName);
      const helperSheet = spreadsheet.getSheetByName(helperSheetName);
      if (helperSheet) {
        validationRange = helperSheet.getRange("A2:A");
      }
    } else {
      // Native workbook lookup: reference the target datasheet directly
      try {
        const targetSheetName = this.getObjectSheetName_(targetObjName);
        const targetSheet = spreadsheet.getSheetByName(targetSheetName);
        if (targetSheet) {
          const primaryColumnIndex = GlobalUtilities.getColumnIndexOnSheet(currentSpreadsheetId, targetSheetName, targetConfig["Object Name"], Number(targetConfig["Header Number"]) || 1);
          const headerRow = Number(targetConfig["Header Number"]) || 1;
          const lastRow = targetSheet.getLastRow();
          if (lastRow > headerRow) {
            validationRange = targetSheet.getRange(headerRow + 1, primaryColumnIndex, lastRow - headerRow, 1);
          }
        }
      } catch (err) {
        LoggingManager.LogError_(`Failed to build target validation range for lookup: ${err.message}`);
      }
    }
    
    if (validationRange) {
      const rule = SpreadsheetApp.newDataValidation()
                                 .requireValueInRange(validationRange, true)
                                 .setAllowInvalid(false)
                                 .setHelpText(`Please select a valid ${targetColName}`)
                                 .build();
      targetCell.setDataValidation(rule);
      LoggingManager.LogDebugMessage_(`Applied lookup validation to cell ${targetCell.getA1Notation()} in column ${targetColName}`);
    }
  }

  /**
   * Applies validation rule for a configured static dropdown to a cell in a row.
   * @param {SpreadsheetApp.Sheet} sheet - The active sheet
   * @param {number} row - The row index
   * @param {Object} dropdown - The dropdown configuration record
   * @param {Object} headerIndices - Map of column names to 1-based indices
   * @private
   */
  static applyDropdownValidation_(sheet, row, dropdown, headerIndices) {
    const colName = dropdown["Dropdown Name"];
    const colIndex = headerIndices[colName];
    if (!colIndex) return;
    
    const targetCell = sheet.getRange(row, colIndex);
    const valuesList = dropdown["Values"] ? dropdown["Values"].split(",").map(v => v.trim()).filter(Boolean) : [];
    if (valuesList.length > 0) {
      const rule = SpreadsheetApp.newDataValidation()
                                 .requireValueInList(valuesList, true)
                                 .setAllowInvalid(false)
                                 .setHelpText(`Please select a value`)
                                 .build();
      targetCell.setDataValidation(rule);
      LoggingManager.LogDebugMessage_(`Applied static dropdown validation to cell ${targetCell.getA1Notation()} in column ${colName}`);
    }
  }

  /**
   * Applies validation rule for a global dropdown if matches column name.
   * @param {SpreadsheetApp.Sheet} sheet - The active sheet
   * @param {number} row - The row index
   * @param {string} colName - Column name
   * @param {number} colIndex - Column index
   * @private
   */
  static applyGlobalDropdownValidation_(sheet, row, colName, colIndex) {
    const globalDropdown = ConfigurationManager.getGlobalDropdownConfiguration(colName);
    if (globalDropdown) {
      const targetCell = sheet.getRange(row, colIndex);
      const valuesList = globalDropdown["Values"] ? globalDropdown["Values"].split(",").map(v => v.trim()).filter(Boolean) : [];
      if (valuesList.length > 0) {
        const rule = SpreadsheetApp.newDataValidation()
                                   .requireValueInList(valuesList, true)
                                   .setAllowInvalid(false)
                                   .setHelpText(`Please select a value`)
                                   .build();
        targetCell.setDataValidation(rule);
        LoggingManager.LogDebugMessage_(`Applied global dropdown validation to cell ${targetCell.getA1Notation()} in column ${colName}`);
      }
    }
  }

  /**
   * Returns a validation rule to apply to range based on the provided column name
   * @param {string} objectName - The object to which the dropdown column corresponds
   * @param {string} dropdownColumnName - Desired dropdown column for validation
   * @returns {SpreadsheetApp.DataValidation} Data validation rule to apply to a range
   */
  static createDropdownValidationRule(objectName, dropdownColumnName){
    const rule = SpreadsheetApp.newDataValidation()
                               .requireValueInList(this.getObjectDropdownColumnValues(objectName, dropdownColumnName), true)
                               .setAllowInvalid(false)
                               .setHelpText(`Please select a value`)
                               .build()
    return rule;
  }

  /**
   * If a helper sheet for the provided object exists in the target it is populated with the imported range
   * @param {string} objectName - Helper range will be based on this object
   * @param {string} targetSpreadsheet - Workbook to populate helper sheet in
   */
  static populateHelperSheet(objectName, targetSpreadsheet){
    objectName ?? (() => { throw new Error("Object name not provided"); })();
    targetSpreadsheet ?? (() => { throw new Error("Spreadsheet Id not provided"); })();
    const helperSheet = SpreadsheetApp.openById(targetSpreadsheet).getSheetByName(this.getHelperRangeSheetName(objectName));
    helperSheet ?? (() => { throw new Error(`Helper sheet ${this.getHelperRangeSheetName(objectName)} does not exist in ${targetSpreadsheet}`)})();
    const firstCell = helperSheet.getRange("A1");
    firstCell.setFormula(this.getHelperRangeFormula(objectName));
  }

  /**
   * Creates the lookup formula to use in the first cell of the lookup sheet
   * @param {string} objectName - Name of the object to create the import statement for.
   * @returns {string} The formula to put in the first cell
   */
  static getHelperRangeFormula(objectName){
    const spreadsheetId = this.getObjectSpreadsheetId_(objectName);
    const sheetName = this.getObjectSheetName_(objectName);
    const validationRangeA1notation = this.getDataSheetObjectValidationRangeAddress(objectName);
    const formulaPrefix = `=importrange("https://docs.google.com/spreadsheets/d/`;
    const formulaMiddle = `","`;
    const formulaBang = `!`;
    const formulaSuffix = `")`;
    const helperFormula = `${formulaPrefix}${spreadsheetId}${formulaMiddle}${sheetName}${formulaBang}${validationRangeA1notation}${formulaSuffix}`;
    return helperFormula;
  }

  /**
   * Creates a hidden sheet using the hidden sheet naming convention
   * @param {string} objectName - The name of the object that needs a helper range
   * @param {string} spreadsheetIdToCreateHelperSheetIn
   * @returns {boolean} true if the sheet is created, an exception otherwise
   */
  static createHelperSheet(objectName, spreadsheetIdToCreateHelperSheetIn){
    objectName ?? (() => { throw new Error("Object name not provided"); })();
    spreadsheetIdToCreateHelperSheetIn ?? (() => { throw new Error("Spreadsheet Id not provided to create helper sheet"); })();
    const spreadsheet = SpreadsheetApp.openById(spreadsheetIdToCreateHelperSheetIn);
    const helperSheetName = this.getHelperRangeSheetName(objectName);
    if (spreadsheet.getSheetByName(helperSheetName)) {
      return true;
    }
    spreadsheet.insertSheet(helperSheetName).hideSheet();
    if (spreadsheet.getSheetByName(helperSheetName)){
      return true;
    }
    throw new Error(`Helper Sheet for ${objectName}, ${helperSheetName} was not created in workbook ${spreadsheetIdToCreateHelperSheetIn}`);
  }

  /**
   * Checks if the object of a lookup needs a helper sheet in the provided workbook
   * @param {string} objectName - Object to evaluate for the need of a helper sheet
   * @param {string} spreadsheetIdToCheck - Target spreadsheet for validation
   * @returns {boolean} True if the spreadsheet is not the native spreadsheet for the objectname and a helper sheet is needed
   */
  static doesWorkbookNeedHelperSheet(objectName, spreadsheetIdToCheck){
    objectName ?? (() => { throw new Error("Object name not provided"); })();
    spreadsheetIdToCheck ?? (() => { throw new Error("Spreadsheet Id not provided"); })();
    const objectSpreadsheetId = this.getObjectSpreadsheetId_(objectName);
    return objectSpreadsheetId == spreadsheetIdToCheck ? false : true;
  }

  /**
   * Checks if the provided spreadsheet id has a helper range sheet for the provided object
   * @param {string} objectName - Object to check for the helper sheet of
   * @param {string} spreadsheetIdToCheck - Id of the Spreadsheet workbook to check for the helper sheet
   * @returns {boolean} True if the sheet exists, false otherwise
   */
  static doesHelperSheetExist(objectName, spreadsheetIdToCheck){
    objectName ?? (() => { throw new Error("Object name not provided"); })();
    spreadsheetIdToCheck ?? (() => { throw new Error("Spreadsheet Id not provided"); })();
    const helperSheet = SpreadsheetApp.openById(spreadsheetIdToCheck)
                                      .getSheetByName(this.getHelperRangeSheetName(objectName));
    return helperSheet ? true : false;
  }

  /**
   * Generates the Helper Range Sheet name for use in validation
   * @param {string} objectName - Object to generate the helper range sheet name for
   * @returns {string} The concatenated name as a string
   */
  static getHelperRangeSheetName(objectName){
    return `__${objectName}_Helper_Range`;
  }

  /**
   * Retrieves the current lookup values for an object as an array
   * @param {string} objectName - Name of the lookup object to find values of
   * @returns {string[]} Array of strings that are the current lookup values for the provided object
   */
  static getDataSheetObjectValidationValues(objectName){
    objectName ?? (() => { throw new Error("Object name not provided"); })();
    const range = this.getDataSheetObjectValidationRange(objectName);
    const values = range.getValues();
    const sliced = values.slice(1); // removes header
    const flat = sliced.flat(); // flattens into a one-dimensional array
    const finalValues = flat.filter(Boolean); // removes blanks
    return finalValues;
  }

  /**
   * Retrieves a 1 column range containing all cells with the requested object's lookup values
   * @param {string} objectName - The name of the business object, which is also the singular of the sheet
   * @returns {SpreadsheetApp.Range} The 1 column range including the header
   */
  static getDataSheetObjectValidationRange(objectName) {
    objectName ?? (() => { throw new Error("Object name not provided"); })();
    const config = this.getObjectConfig_(objectName);
    if (!config) throw new Error(`Object configuration not found for ${objectName}`);
    
    const spreadsheetId = config["Spreadsheet Id"];
    const sheetName = config["Datasheet"];
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getSheetByName(sheetName);
    const rangeAddress = this.getDataSheetObjectValidationRangeAddress(objectName);
    const range = sheet.getRange(rangeAddress);
    LoggingManager.LogDebugMessage_(`Length of range found ${range.getNumRows()}`);
    return range;
  }

  /**
   * Retrieves the A1 notation address of the range containing the header and values for lookups of the provided object
   * @param {string} objectName - The name of the lookup object - note not the sheet name
   * @returns {string} The A1 notation cell address to use for lookup of the object values, including the header
   */
  static getDataSheetObjectValidationRangeAddress(objectName){
    objectName ?? (() => { throw new Error("Object name not provided"); })();
    const config = this.getObjectConfig_(objectName);
    if (!config) throw new Error(`Object configuration not found for ${objectName}`);
    
    const spreadsheetId = config["Spreadsheet Id"];
    const sheetName = config["Datasheet"];
    const headerNum = Number(config["Header Number"]) || 1;
    const shortName = config["Object Name"];
    
    const primaryColumnIndex = GlobalUtilities.getColumnIndexOnSheet(spreadsheetId, sheetName, shortName, headerNum);
    const primaryColumnLetter = GlobalUtilities.getColumnLetter(spreadsheetId, sheetName, primaryColumnIndex);
    return `${primaryColumnLetter}${headerNum}:${primaryColumnLetter}`;
  }

  /**
   * Retrieves the singular object name of the provided data sheet
   * @param {string} sheetName - The (plural) sheetName we need the object of
   * @returns {string} The name of the object
   * @private
   */
  static getObjectNameFromSheet_(sheetName){
    const config = ConfigurationManager.getObjectConfiguration(sheetName, 'datasheetName');
    return config ? config["Object Name"] : null;
  }

  /**
   * Retrieves the id of the spreadsheet containing the object's data sheet
   * @param {string} objectName - The (singular) object we need the sheet Name of
   * @returns {string} The name of the sheet and plural of the object
   * @private
   */
  static getObjectSpreadsheetId_(objectName){
    const config = this.getObjectConfig_(objectName);
    return config ? config["Spreadsheet Id"] : null;
  }

  /**
   * Retrieves the data sheet name of the provided object, which is also the plural of the object
   * @param {string} objectName - The (singular) object we need the sheet Name of
   * @returns {string} The name of the sheet and plural of the object
   * @private
   */
  static getObjectSheetName_(objectName){
    const config = this.getObjectConfig_(objectName);
    return config ? config["Datasheet"] : null;
  }

  /**
   * Retrieves the assigned header row for an objects data sheet
   * @param {string} objectName - Object for which we are getting the header row
   * @returns {number} The 1-indexed index of the header row on the sheet 
   * @private
   */
  static getObjectSheetHeaderIndex_(objectName){
    const config = this.getObjectConfig_(objectName);
    return config ? Number(config["Header Number"]) : 1;
  }

  /**
   * Retrieves the primary data fields that should be filled in on a record as an array
   * @param {string} objectName - Object for which we are getting the primary fields
   * @returns {string[]} Array of the Primary Field columns
   * @private
   */
  static getObjectPrimaryFields_(objectName){
    const config = this.getObjectConfig_(objectName);
    return config && config["Primary Fields"] ? config["Primary Fields"].split(",").map(f => f.trim()).filter(Boolean) : [];
  }

  /**
   * Retrieves the configured static dropdowns of an object
   * @param {string} objectName - Object we want the columns of
   * @returns {string[]} Array of all columns configured as static dropdowns for the object
   * @private
   */
  static getObjectDropdownColumns_(objectName){
    const config = this.getObjectConfig_(objectName);
    if (!config) return [];
    const fullObjectName = config["Object"];
    const dropdowns = ConfigurationManager.getDropdownConfigurations(fullObjectName) || [];
    return dropdowns.map(d => d["Dropdown Name"]);
  }

  /**
   * Retrieves the configured lookup dropdowns of an object
   * @param {string} objectName - Object we want the columns of
   * @returns {string[]} Array of all columns configured as lookup dropdowns for the object
   * @private
   */
  static getObjectLookupColumns_(objectName){
    const config = this.getObjectConfig_(objectName);
    if (!config) return [];
    const fullObjectName = config["Object"];
    const lookups = ConfigurationManager.getLookupConfiguration(fullObjectName) || [];
    return lookups.map(l => {
      let targetColName = l["Column Name"];
      if (!targetColName) {
        const targetConfig = ConfigurationManager.getObjectConfiguration(l["Target Object"], 'object');
        if (targetConfig) {
          targetColName = targetConfig["Object Name"];
        }
      }
      return targetColName;
    }).filter(Boolean);
  }

  /**
   * Retrieves the configured static dropdown values of an object
   * @param {string} objectName - Object we want the columns of
   * @param {string} columnName - Name of the static dropdown column to retrieve values of
   * @returns {string[]} Array of static dropdown values
   */
  static getObjectDropdownColumnValues(objectName, columnName){
    let config = ConfigurationManager.getDropdownConfiguration(columnName, objectName);
    if (!config) {
      const objConfig = this.getObjectConfig_(objectName);
      if (objConfig) {
        config = ConfigurationManager.getDropdownConfiguration(columnName, objConfig["Object"]);
      }
    }
    if (config && config["Values"]) {
      return config["Values"].split(",").map(v => v.trim()).filter(Boolean);
    }
    return [];
  }

  /**
   * Global dropdowns don't refer to a specific object name in their configuration so they are retrieved differently
   * @param {string} globalDropdownName
   * @returns {string[]} Array of strings representing the choosable values
   */
  static getGlobalDropdownValues(globalDropdownName){
    const config = ConfigurationManager.getGlobalDropdownConfiguration(globalDropdownName);
    if (config && config["Values"]) {
      return config["Values"].split(",").map(v => v.trim()).filter(Boolean);
    }
    return [];
  }
}

/**
 * General testing method, not meant to be called during production
 */
function adHocTest(){
  //const targetSpreadsheetId = '1SyMoGrqy7_JdQ2VbUwsv6ALvMmX9765mKZRJK8pYkew';
  //const objectName = 'Test Object';
  //const dropdownColumnName = 'Test Object Yes/No';
  //LoggingManager.LogDebugMessage_(ValidationContext.createHelperSheet(objectName,targetSpreadsheetId));
  //LoggingManager.LogDebugMessage_(ValidationContext.populateHelperSheet(objectName,targetSpreadsheetId));
  //LoggingManager.LogDebugMessage_(ValidationContext.createDropdownValidationRule(objectName, dropdownColumnName));
  LoggingManager.LogDebugMessage_(validationContext_getLookupRangeValuesForForm("Customer"));
}

/**
 * Retrieves the current lookup values for an object as an array
 * @param {string} referencedObjectName - Name of the lookup object to find values of
 * @returns {string[]} Array of strings that are the current lookup values for the provided object
 */
function validationContext_getLookupRangeValuesForForm(referencedObjectName){
  return ValidationContext.getDataSheetObjectValidationValues(referencedObjectName);
}

/**
 * Global dropdowns don't refer to a specific object name in their configuration so they are retrieved differently
 * @param {string} globalDropdownName
 * @returns {string[]} Array of strings representing the choosable values
 */
function validationContext_GetGlobalDropdown(globalDropdownName){
  return ValidationContext.getGlobalDropdownValues(globalDropdownName);
}

/**
 * Retrieves the configured static dropdown values of an object
 * @param {string} objectName - Object we want the columns of
 * @param {string} dropdownFieldName - Name of the static dropdown column to retrieve values of
 * @returns {string[]} Array of dropdown values
 */
function validationContext_getObjectStaticDropdown(objectName, dropdownFieldName){
  return ValidationContext.getObjectDropdownColumnValues(objectName, dropdownFieldName);
}

/**
 * Global function to process validation on edit events.
 * Can be called directly from sheet's onEdit event.
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e - The edit event object
 */
function validationContext_processRecordEdit(e) {
  RecordManager.processRecordEdit(e);
}
