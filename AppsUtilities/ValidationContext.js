/**
 * Contains tools for processing sheet data validation and dynamically updating rules when a new record is created
 */
class ValidationContext {
  /**
   * Helper to retrieve object configuration supporting both short and full object names.
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
   * @deprecated Deprecated on 2026-06-24. Will be obsolete and safe to remove on or after 2026-12-24.
   * Use ValidationContext.processRecordEdit directly.
   */
  static processValidationContext_(spreadsheet, sheetName, e) {
    const objConfig = ConfigurationManager.getObjectConfiguration(sheetName, 'datasheetName');
    if (!objConfig) return;
    const enabled = String(objConfig["Enabled For Validation"]).toUpperCase() === 'TRUE';
    if (!enabled) return;
    this.processRecordEdit({ spreadsheet, sheetName, range: e.range, objConfig });
  }

  /**
   * Reruns validation for a selected range in a sheet.
   * @param {SpreadsheetApp.Spreadsheet} spreadsheet - The active spreadsheet
   * @param {SpreadsheetApp.Sheet} sheet - The active sheet
   * @param {SpreadsheetApp.Range} range - The selected range to validate
   */
  static validateSelectedRange(spreadsheet, sheet, range) {
    const sheetName = sheet.getName();
    const objConfig = ConfigurationManager.getObjectConfiguration(sheetName, 'datasheetName');
    if (!objConfig) throw new Error(`This sheet is not configured for validation.`);
    
    const enabled = String(objConfig["Enabled For Validation"]).toUpperCase() === 'TRUE';
    if (!enabled) throw new Error(`Validation is not enabled for this sheet in the configuration.`);
    
    this.processRecordEdit({ spreadsheet, sheetName, range, objConfig, forceValidation: true });
  }

  /**
   * Processes validation and dynamic rules configuration for edited row(s) in a sheet.
   * Clears validations for any row where required fields are not fully filled.
   * @param {Object} params - Positional object { spreadsheet, sheetName, range, objConfig, forceValidation }
   */
  static processRecordEdit(params) {
    const { spreadsheet, sheetName, range, objConfig, forceValidation = false } = params;
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) return;
    
    const meta = this.getValidationMetadata_({ objConfig, sheet });
    if (meta.lastCol === 0) return;
    
    const startRow = range.getRow();
    const numRows = range.getNumRows();
    const currentSpreadsheetId = spreadsheet.getId();
    
    for (let r = 0; r < numRows; r++) {
      const row = startRow + r;
      if (row > meta.headerNumber) {
        this.processRowValidation_({
          sheet, row, meta, currentSpreadsheetId, spreadsheet, forceValidation
        });
      }
    }
  }

  /**
   * Extracts sheet metadata for processing validations.
   * @private
   */
  static getValidationMetadata_(params) {
    const { objConfig, sheet } = params;
    const fullObjectName = objConfig["Object"];
    const headerNumber = Number(objConfig["Header Number"]) || 1;
    const lastCol = sheet.getLastColumn();
    
    const lookups = ConfigurationManager.getLookupConfiguration(fullObjectName) || [];
    const dropdowns = ConfigurationManager.getDropdownConfigurations(fullObjectName) || [];
    const primaryFields = objConfig["Primary Fields"] ? objConfig["Primary Fields"].split(",").map(f => f.trim()).filter(Boolean) : [];
    
    const headers = lastCol === 0 ? [] : sheet.getRange(headerNumber, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
    const headerIndices = {};
    headers.forEach((h, idx) => {
      if (h) headerIndices[h] = idx + 1;
    });
    
    return { headerNumber, lastCol, lookups, dropdowns, primaryFields, headers, headerIndices };
  }

  /**
   * Routes row-level validation checks.
   * @private
   */
  static processRowValidation_(params) {
    const { sheet, row, meta, currentSpreadsheetId, spreadsheet, forceValidation } = params;
    const allRowEmpty = !forceValidation && this.checkAllRowValuesEmpty_(sheet, row, meta.lastCol);
    if (allRowEmpty) {
      sheet.getRange(row, 1, 1, meta.lastCol).clearDataValidations();
      return;
    }
    
    const processedCols = new Set();
    this.runLookupValidations_({ sheet, row, meta, currentSpreadsheetId, spreadsheet, processedCols });
    this.runDropdownValidations_({ sheet, row, meta, processedCols });
    
    meta.headers.forEach((colName, idx) => {
      const colIndex = idx + 1;
      if (!processedCols.has(colIndex)) {
        this.applyGlobalDropdownValidation_({ sheet, row, colName, colIndex });
      }
    });
  }

  /**
   * Helper to run lookup validations on a row.
   * @private
   */
  static runLookupValidations_(params) {
    const { sheet, row, meta, currentSpreadsheetId, spreadsheet, processedCols } = params;
    meta.lookups.forEach(lookup => {
      const targetColName = this.getTargetColumnName_(lookup);
      if (targetColName && meta.headerIndices[targetColName]) {
        processedCols.add(meta.headerIndices[targetColName]);
      }
      this.applyLookupValidation_({
        sheet, row, lookup, headerIndices: meta.headerIndices, currentSpreadsheetId, spreadsheet
      });
    });
  }

  /**
   * Helper to run static dropdown validations on a row.
   * @private
   */
  static runDropdownValidations_(params) {
    const { sheet, row, meta, processedCols } = params;
    meta.dropdowns.forEach(dropdown => {
      const colName = dropdown["Dropdown Name"];
      if (colName && meta.headerIndices[colName]) {
        processedCols.add(meta.headerIndices[colName]);
      }
      this.applyDropdownValidation_({
        sheet, row, dropdown, headerIndices: meta.headerIndices
      });
    });
  }

  /**
   * Helper to check if all cell values in a given row are empty.
   * @private
   */
  static checkAllRowValuesEmpty_(sheet, row, lastCol) {
    if (lastCol <= 0) return true;
    const values = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
    for (const val of values) {
      if (val !== "" && val !== null && val !== undefined) {
        return false;
      }
    }
    return true;
  }

  /**
   * Resolves the column name for a lookup configuration.
   * @private
   */
  static getTargetColumnName_(lookup) {
    const targetColName = lookup["Column Name"];
    if (targetColName) return targetColName;
    
    const targetObjName = lookup["Target Object"];
    const targetConfig = ConfigurationManager.getObjectConfiguration(targetObjName, 'object');
    return targetConfig ? targetConfig["Object Name"] : null;
  }

  /**
   * Helper to retrieve a cross-workbook lookup via helper sheet.
   * @private
   */
  static getHelperValidationRange_(targetObjName, currentSpreadsheetId) {
    if (!this.doesHelperSheetExist(targetObjName, currentSpreadsheetId)) {
      this.createHelperSheet(targetObjName, currentSpreadsheetId);
    }
    this.populateHelperSheet(targetObjName, currentSpreadsheetId);
    
    const helperSheetName = this.getHelperRangeSheetName(targetObjName);
    const targetSpreadsheet = SpreadsheetApp.openById(currentSpreadsheetId);
    const helperSheet = targetSpreadsheet.getSheetByName(helperSheetName);
    if (!helperSheet) {
      throw new Error(`Helper sheet ${helperSheetName} not found for object ${targetObjName}`);
    }
    return this.getDataSheetObjectValidationRange(targetObjName, helperSheetName, currentSpreadsheetId);
  }

  /**
   * Retrieves the validation range for a given target object, creating and populating helper sheets if needed.
   * @private
   */
  static retrieveValidationRange_(targetObjName, currentSpreadsheetId, spreadsheet) {
    if (this.doesWorkbookNeedHelperSheet(targetObjName, currentSpreadsheetId)) {
      return this.getHelperValidationRange_(targetObjName, currentSpreadsheetId);
    }
    try {
      const targetSheetName = this.getObjectSheetName_(targetObjName);
      if (targetSheetName) {
        return this.getDataSheetObjectValidationRange(targetObjName, targetSheetName, currentSpreadsheetId);
      }
    } catch (err) {
      LoggingManager.LogError_(`Failed to build target validation range for lookup: ${err.message}`);
    }
    return null;
  }

  /**
   * Applies validation rule for a configured lookup to a cell in a row.
   * @private
   */
  static applyLookupValidation_(params) {
    const { sheet, row, lookup, headerIndices, currentSpreadsheetId, spreadsheet } = params;
    const targetObjName = lookup["Target Object"];
    const targetColName = this.getTargetColumnName_(lookup);
    if (!targetColName) return;
    
    const colIndex = headerIndices[targetColName];
    if (!colIndex) return;
    
    const targetCell = sheet.getRange(row, colIndex);
    const validationRange = this.retrieveValidationRange_(targetObjName, currentSpreadsheetId, spreadsheet);
    
    if (validationRange) {
      const rule = SpreadsheetApp.newDataValidation()
                                 .requireValueInRange(validationRange, true)
                                 .setAllowInvalid(false)
                                 .setHelpText(`Please select a valid ${targetColName}`)
                                 .build();
      targetCell.setDataValidation(rule);
    }
  }

  /**
   * Applies validation rule for a configured static dropdown to a cell in a row.
   * @private
   */
  static applyDropdownValidation_(params) {
    const { sheet, row, dropdown, headerIndices } = params;
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
    }
  }

  /**
   * Applies validation rule for a global dropdown if matches column name.
   * @private
   */
  static applyGlobalDropdownValidation_(params) {
    const { sheet, row, colName, colIndex } = params;
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
      }
    }
  }

  /**
   * Returns a validation rule to apply to range based on the provided column name
   * @deprecated Deprecated on 2026-06-24. Will be obsolete and safe to remove on or after 2026-12-24.
   */
  static createDropdownValidationRule(objectName, dropdownColumnName){
    return SpreadsheetApp.newDataValidation()
                         .requireValueInList(this.getObjectDropdownColumnValues(objectName, dropdownColumnName), true)
                         .setAllowInvalid(false)
                         .setHelpText(`Please select a value`)
                         .build();
  }

  /**
   * If a helper sheet for the provided object exists in the target it is populated with the imported range
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
   */
  static getHelperRangeFormula(objectName){
    const spreadsheetId = this.getObjectSpreadsheetId_(objectName);
    const sheetName = this.getObjectSheetName_(objectName);
    const validationRangeA1notation = this.getDataSheetObjectValidationRangeAddress(objectName);
    return `=importrange("https://docs.google.com/spreadsheets/d/${spreadsheetId}","${sheetName}!${validationRangeA1notation}")`;
  }

  /**
   * Creates a hidden sheet using the hidden sheet naming convention
   */
  static createHelperSheet(objectName, spreadsheetIdToCreateHelperSheetIn){
    objectName ?? (() => { throw new Error("Object name not provided"); })();
    spreadsheetIdToCreateHelperSheetIn ?? (() => { throw new Error("Spreadsheet Id not provided to create helper sheet"); })();
    const spreadsheet = SpreadsheetApp.openById(spreadsheetIdToCreateHelperSheetIn);
    const helperSheetName = this.getHelperRangeSheetName(objectName);
    if (spreadsheet.getSheetByName(helperSheetName)) return true;
    
    spreadsheet.insertSheet(helperSheetName).hideSheet();
    if (spreadsheet.getSheetByName(helperSheetName)) return true;
    
    throw new Error(`Helper Sheet ${helperSheetName} was not created in workbook ${spreadsheetIdToCreateHelperSheetIn}`);
  }

  /**
   * Checks if the object of a lookup needs a helper sheet in the provided workbook
   */
  static doesWorkbookNeedHelperSheet(objectName, spreadsheetIdToCheck){
    objectName ?? (() => { throw new Error("Object name not provided"); })();
    spreadsheetIdToCheck ?? (() => { throw new Error("Spreadsheet Id not provided"); })();
    
    const objectSpreadsheetId = this.getObjectSpreadsheetId_(objectName);
    return objectSpreadsheetId ? objectSpreadsheetId !== spreadsheetIdToCheck : false;
  }

  /**
   * Checks if the provided spreadsheet id has a helper range sheet for the provided object
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
   */
  static getHelperRangeSheetName(objectName){
    let shortName = objectName;
    try {
      const config = this.getObjectConfig_(objectName);
      if (config && config["Object Name"]) {
        shortName = config["Object Name"];
      }
    } catch (e) {}
    return `__${shortName}_Helper_Range`;
  }

  /**
   * Retrieves the current lookup values for an object as an array
   */
  static getDataSheetObjectValidationValues(objectName){
    objectName ?? (() => { throw new Error("Object name not provided"); })();
    const range = this.getDataSheetObjectValidationRange(objectName);
    return range.getValues().slice(1).flat().filter(Boolean);
  }

  /**
   * Retrieves a 1 column range containing all cells with the requested object's lookup values
   */
  static getDataSheetObjectValidationRange(objectName, sheetName = null, spreadsheetId = null) {
    objectName ?? (() => { throw new Error("Object name not provided"); })();
    const config = this.getObjectConfig_(objectName);
    if (!config) throw new Error(`Object configuration not found for ${objectName}`);
    
    spreadsheetId = spreadsheetId ?? config["Spreadsheet Id"];
    sheetName = sheetName ?? config["Datasheet"];
    const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);
    if (!sheet) throw new Error(`Sheet '${sheetName}' not found in spreadsheet '${spreadsheetId}'`);
    
    const rangeAddress = this.getDataSheetObjectValidationRangeAddress(objectName, sheetName, spreadsheetId);
    return sheet.getRange(rangeAddress);
  }

  /**
   * Retrieves the A1 notation address of the range containing the header and values for lookups of the provided object
   */
  static getDataSheetObjectValidationRangeAddress(objectName, sheetName = null, spreadsheetId = null){
    objectName ?? (() => { throw new Error("Object name not provided"); })();
    const config = this.getObjectConfig_(objectName);
    if (!config) throw new Error(`Object configuration not found for ${objectName}`);
    
    spreadsheetId = spreadsheetId ?? config["Spreadsheet Id"];
    sheetName = sheetName ?? config["Datasheet"];
    if (sheetName && sheetName.startsWith('__') && sheetName.endsWith('_Helper_Range')) {
      return "A2:A";
    }
    
    const headerNum = Number(config["Header Number"]) || 1;
    const shortName = config["Object Name"];
    const primaryColumnIndex = GlobalUtilities.getColumnIndexOnSheet({ spreadsheetId, sheetName }, shortName, headerNum);
    const primaryColumnLetter = GlobalUtilities.getColumnLetter(spreadsheetId, sheetName, primaryColumnIndex);
    return `${primaryColumnLetter}${headerNum}:${primaryColumnLetter}`;
  }

  /**
   * Retrieves the singular object name of the provided data sheet
   * @private
   */
  static getObjectNameFromSheet_(sheetName){
    const config = ConfigurationManager.getObjectConfiguration(sheetName, 'datasheetName');
    return config ? config["Object Name"] : null;
  }

  /**
   * Retrieves the id of the spreadsheet containing the object's data sheet
   * @private
   */
  static getObjectSpreadsheetId_(objectName){
    const config = this.getObjectConfig_(objectName);
    return config ? config["Spreadsheet Id"] : null;
  }

  /**
   * Retrieves the data sheet name of the provided object, which is also the plural of the object
   * @private
   */
  static getObjectSheetName_(objectName){
    const config = this.getObjectConfig_(objectName);
    return config ? config["Datasheet"] : null;
  }

  /**
   * Retrieves the assigned header row for an objects data sheet
   * @private
   */
  static getObjectSheetHeaderIndex_(objectName){
    const config = this.getObjectConfig_(objectName);
    return config ? Number(config["Header Number"]) : 1;
  }

  /**
   * Retrieves the primary data fields that should be filled in on a record as an array
   * @private
   */
  static getObjectPrimaryFields_(objectName){
    const config = this.getObjectConfig_(objectName);
    return config && config["Primary Fields"] ? config["Primary Fields"].split(",").map(f => f.trim()).filter(Boolean) : [];
  }

  /**
   * Retrieves the configured static dropdowns of an object
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
        if (targetConfig) targetColName = targetConfig["Object Name"];
      }
      return targetColName;
    }).filter(Boolean);
  }

  /**
   * Retrieves the configured static dropdown values of an object
   */
  static getObjectDropdownColumnValues(objectName, columnName){
    let config = ConfigurationManager.getDropdownConfiguration(columnName, objectName);
    if (!config) {
      const objConfig = this.getObjectConfig_(objectName);
      if (objConfig) {
        config = ConfigurationManager.getDropdownConfiguration(columnName, objConfig["Object"]);
      }
    }
    return config && config["Values"] ? config["Values"].split(",").map(v => v.trim()).filter(Boolean) : [];
  }

  /**
   * Global dropdowns don't refer to a specific object name in their configuration so they are retrieved differently
   */
  static getGlobalDropdownValues(globalDropdownName){
    const config = ConfigurationManager.getGlobalDropdownConfiguration(globalDropdownName);
    return config && config["Values"] ? config["Values"].split(",").map(v => v.trim()).filter(Boolean) : [];
  }
}

/**
 * General testing method, not meant to be called during production
 * @deprecated Deprecated on 2026-06-24. Will be obsolete and safe to remove on or after 2026-12-24.
 */
function adHocTest(){
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
 * @deprecated Deprecated on 2026-06-24. Will be obsolete and safe to remove on or after 2026-12-24.
 * Use RecordManager.processRecordEdit directly.
 */
function validationContext_processRecordEdit(e) {
  RecordManager.processRecordEdit(e);
}
