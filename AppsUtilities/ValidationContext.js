/**
 * Contains tools for processing sheet data validation and dynamically updating rules when a new record is created.
 */
class ValidationContext {
  /**
   * Helper to retrieve object configuration supporting both short and full object names.
   * @param {string} objectName - Name of the object type.
   * @returns {Object|null} Configuration record object, or null if not found.
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
   * Runs during the onEdit event to delegate validation processing.
   * @param {SpreadsheetApp.Spreadsheet} spreadsheet - The active spreadsheet.
   * @param {string} sheetName - Name of the edited sheet.
   * @param {GoogleAppsScript.Events.SheetsOnEdit} e - The edit event object.
   * @returns {void}
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
   * Raises descriptive error if the sheet is not configured for validation.
   * @param {SpreadsheetApp.Spreadsheet} spreadsheet - The active spreadsheet.
   * @param {SpreadsheetApp.Sheet} sheet - The active sheet.
   * @param {SpreadsheetApp.Range} range - The selected range to validate.
   * @returns {void}
   * @throws {Error} If sheet validation is not configured or disabled.
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
   * @param {Object} params - The parameter options object.
   * @param {SpreadsheetApp.Spreadsheet} params.spreadsheet - The active spreadsheet.
   * @param {string} params.sheetName - Name of the sheet containing the edit.
   * @param {SpreadsheetApp.Range} params.range - The range containing edited cell(s).
   * @param {Object} params.objConfig - The object configuration metadata record.
   * @param {boolean} [params.forceValidation=false] - If true, bypasses row emptiness checks.
   * @returns {void}
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
   * Parses headers, lookup configs, dropdown configs, and primary fields.
   * @param {Object} params - The parameter options object.
   * @param {Object} params.objConfig - The object configuration metadata record.
   * @param {SpreadsheetApp.Sheet} params.sheet - The sheet currently being validated.
   * @returns {{ headerNumber: number, lastCol: number, lookups: Object[], dropdowns: Object[], primaryFields: string[], headers: string[], headerIndices: Object<string, number> }} Parsed sheet validation metadata.
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
   * Checks for empty rows and applies appropriate lookup and dropdown validations.
   * @param {Object} params - The parameter options object.
   * @param {SpreadsheetApp.Sheet} params.sheet - The active sheet.
   * @param {number} params.row - The 1-based row index to validate.
   * @param {Object} params.meta - Pre-computed validation metadata object.
   * @param {string} params.currentSpreadsheetId - The ID of the active spreadsheet.
   * @param {SpreadsheetApp.Spreadsheet} params.spreadsheet - The active spreadsheet object.
   * @param {boolean} params.forceValidation - If true, ignores row emptiness checks.
   * @returns {void}
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
   * @param {Object} params - The parameter options object.
   * @param {SpreadsheetApp.Sheet} params.sheet - The active sheet.
   * @param {number} params.row - The 1-based row index.
   * @param {Object} params.meta - Pre-computed validation metadata object.
   * @param {string} params.currentSpreadsheetId - The ID of the active spreadsheet.
   * @param {SpreadsheetApp.Spreadsheet} params.spreadsheet - The active spreadsheet object.
   * @param {Set<number>} params.processedCols - Set of column indices that have been processed.
   * @returns {void}
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
   * @param {Object} params - The parameter options object.
   * @param {SpreadsheetApp.Sheet} params.sheet - The active sheet.
   * @param {number} params.row - The 1-based row index.
   * @param {Object} params.meta - Pre-computed validation metadata object.
   * @param {Set<number>} params.processedCols - Set of column indices that have been processed.
   * @returns {void}
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
   * @param {SpreadsheetApp.Sheet} sheet - The target sheet.
   * @param {number} row - The 1-based row index to check.
   * @param {number} lastCol - The last column index in the sheet.
   * @returns {boolean} True if all cell values are empty, false otherwise.
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
   * Uses config lookup properties or targets the configured primary key field.
   * @param {Object} lookup - The lookup configuration record.
   * @returns {string|null} Resolved target column name, or null if unresolved.
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
   * Automatically initializes and populates helper sheet if missing.
   * @param {string} targetObjName - Name of the target lookup object.
   * @param {string} currentSpreadsheetId - The ID of the current spreadsheet.
   * @returns {SpreadsheetApp.Range} The range containing valid lookup keys on the helper sheet.
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
   * @param {string} targetObjName - Name of the target lookup object.
   * @param {string} currentSpreadsheetId - The ID of the current spreadsheet.
   * @param {SpreadsheetApp.Spreadsheet} spreadsheet - The active spreadsheet object.
   * @returns {SpreadsheetApp.Range|null} The validation range containing valid keys, or null if resolution fails.
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
   * @param {Object} params - The parameter options object.
   * @param {SpreadsheetApp.Sheet} params.sheet - The active sheet.
   * @param {number} params.row - The 1-based row index.
   * @param {Object} params.lookup - The lookup configuration metadata record.
   * @param {Object<string, number>} params.headerIndices - Mapped column names to 1-based indices.
   * @param {string} params.currentSpreadsheetId - The current spreadsheet ID.
   * @param {SpreadsheetApp.Spreadsheet} params.spreadsheet - The active spreadsheet object.
   * @returns {void}
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
   * @param {Object} params - The parameter options object.
   * @param {SpreadsheetApp.Sheet} params.sheet - The active sheet.
   * @param {number} params.row - The 1-based row index.
   * @param {Object} params.dropdown - The dropdown configuration metadata record.
   * @param {Object<string, number>} params.headerIndices - Mapped column names to 1-based indices.
   * @returns {void}
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
   * @param {Object} params - The parameter options object.
   * @param {SpreadsheetApp.Sheet} params.sheet - The active sheet.
   * @param {number} params.row - The 1-based row index.
   * @param {string} params.colName - Column header name to check against global dropdown configurations.
   * @param {number} params.colIndex - The 1-based column index of the cell.
   * @returns {void}
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
   * Returns a validation rule to apply to range based on the provided column name.
   * @param {string} objectName - Name of the object type.
   * @param {string} dropdownColumnName - Column header name.
   * @returns {SpreadsheetApp.DataValidation} Compiled data validation rule.
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
   * If a helper sheet for the provided object exists in the target workbook, it is populated with the imported range.
   * Uses the importrange formula.
   * @param {string} objectName - Target object type name.
   * @param {string} targetSpreadsheet - Target spreadsheet ID.
   * @returns {void}
   * @throws {Error} If objectName or targetSpreadsheet is missing, or helper sheet does not exist.
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
   * Creates the lookup formula to use in the first cell of the lookup sheet.
   * Uses importrange pointing to the source object's datasheet.
   * @param {string} objectName - Name of the object type to link.
   * @returns {string} The importrange formula string.
   */
  static getHelperRangeFormula(objectName){
    const spreadsheetId = this.getObjectSpreadsheetId_(objectName);
    const sheetName = this.getObjectSheetName_(objectName);
    const validationRangeA1notation = this.getDataSheetObjectValidationRangeAddress(objectName);
    return `=importrange("https://docs.google.com/spreadsheets/d/${spreadsheetId}","${sheetName}!${validationRangeA1notation}")`;
  }

  /**
   * Creates a hidden sheet using the hidden sheet naming convention.
   * @param {string} objectName - Name of the object type.
   * @param {string} spreadsheetIdToCreateHelperSheetIn - Target workbook spreadsheet ID.
   * @returns {boolean} True if sheet is successfully created or already exists.
   * @throws {Error} If parameters are missing or sheet creation failed.
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
   * Checks if the object of a lookup needs a helper sheet in the provided workbook.
   * Returns true if the object lives in a different spreadsheet workbook.
   * @param {string} objectName - Name of the target object type.
   * @param {string} spreadsheetIdToCheck - Spreadsheet ID to check.
   * @returns {boolean} True if helper sheet is needed (i.e. cross-workbook), false otherwise.
   */
  static doesWorkbookNeedHelperSheet(objectName, spreadsheetIdToCheck){
    objectName ?? (() => { throw new Error("Object name not provided"); })();
    spreadsheetIdToCheck ?? (() => { throw new Error("Spreadsheet Id not provided"); })();
    
    const objectSpreadsheetId = this.getObjectSpreadsheetId_(objectName);
    return objectSpreadsheetId ? objectSpreadsheetId !== spreadsheetIdToCheck : false;
  }

  /**
   * Checks if the provided spreadsheet id has a helper range sheet for the provided object.
   * @param {string} objectName - Name of the target object type.
   * @param {string} spreadsheetIdToCheck - Spreadsheet ID to search.
   * @returns {boolean} True if the helper sheet exists, false otherwise.
   */
  static doesHelperSheetExist(objectName, spreadsheetIdToCheck){
    objectName ?? (() => { throw new Error("Object name not provided"); })();
    spreadsheetIdToCheck ?? (() => { throw new Error("Spreadsheet Id not provided"); })();
    const helperSheet = SpreadsheetApp.openById(spreadsheetIdToCheck)
                                      .getSheetByName(this.getHelperRangeSheetName(objectName));
    return helperSheet ? true : false;
  }

  /**
   * Generates the Helper Range Sheet name for use in validation.
   * @param {string} objectName - Name of the object type.
   * @returns {string} Name of the hidden helper sheet.
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
   * Retrieves the current lookup values for an object as a flat array.
   * Skips header row and empty cells.
   * @param {string} objectName - Name of the object type.
   * @returns {string[]} Flat array of current active lookup key values.
   */
  static getDataSheetObjectValidationValues(objectName){
    objectName ?? (() => { throw new Error("Object name not provided"); })();
    const range = this.getDataSheetObjectValidationRange(objectName);
    return range.getValues().slice(1).flat().filter(Boolean);
  }

  /**
   * Retrieves a 1-column range containing all cells with the requested object's lookup values.
   * @param {string} objectName - Name of the object type.
   * @param {string|null} [sheetName=null] - Optional datasheet name fallback.
   * @param {string|null} [spreadsheetId=null] - Optional spreadsheet ID fallback.
   * @returns {SpreadsheetApp.Range} The range containing validation options.
   * @throws {Error} If configuration or spreadsheet/sheet is missing.
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
   * Retrieves the A1 notation address of the range containing the header and values for lookups of the provided object.
   * @param {string} objectName - Name of the object type.
   * @param {string|null} [sheetName=null] - Optional datasheet name fallback.
   * @param {string|null} [spreadsheetId=null] - Optional spreadsheet ID fallback.
   * @returns {string} Range address in A1 notation (e.g. "A2:A", "A1:A").
   * @throws {Error} If configuration is not found.
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
   * Retrieves the singular object name of the provided datasheet.
   * @param {string} sheetName - Name of the datasheet/sheet name.
   * @returns {string|null} Singular object name (e.g. "Prospect"), or null if not found.
   * @private
   */
  static getObjectNameFromSheet_(sheetName){
    const config = ConfigurationManager.getObjectConfiguration(sheetName, 'datasheetName');
    return config ? config["Object Name"] : null;
  }

  /**
   * Retrieves the ID of the spreadsheet containing the object's datasheet.
   * @param {string} objectName - Name of the object type.
   * @returns {string|null} Spreadsheet ID string, or null if config not found.
   * @private
   */
  static getObjectSpreadsheetId_(objectName){
    const config = this.getObjectConfig_(objectName);
    return config ? config["Spreadsheet Id"] : null;
  }

  /**
   * Retrieves the datasheet name of the provided object, which is also the plural of the object.
   * @param {string} objectName - Name of the object type.
   * @returns {string|null} Datasheet sheet name, or null if config not found.
   * @private
   */
  static getObjectSheetName_(objectName){
    const config = this.getObjectConfig_(objectName);
    return config ? config["Datasheet"] : null;
  }

  /**
   * Retrieves the assigned header row index for an object's datasheet.
   * @param {string} objectName - Name of the object type.
   * @returns {number} 1-based header row index, defaults to 1.
   * @private
   */
  static getObjectSheetHeaderIndex_(objectName){
    const config = this.getObjectConfig_(objectName);
    return config ? Number(config["Header Number"]) : 1;
  }

  /**
   * Retrieves the primary data fields that should be filled in on a record as an array.
   * @param {string} objectName - Name of the object type.
   * @returns {string[]} Array of primary field names.
   * @private
   */
  static getObjectPrimaryFields_(objectName){
    const config = this.getObjectConfig_(objectName);
    return config && config["Primary Fields"] ? config["Primary Fields"].split(",").map(f => f.trim()).filter(Boolean) : [];
  }

  /**
   * Retrieves the configured static dropdowns of an object.
   * @param {string} objectName - Name of the object type.
   * @returns {string[]} Array of dropdown column/field names.
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
   * Retrieves the configured lookup dropdowns of an object.
   * @param {string} objectName - Name of the object type.
   * @returns {string[]} Array of target column names for lookup validations.
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
   * Retrieves the configured static dropdown values of an object.
   * Parses the comma-separated values configuration.
   * @param {string} objectName - Name of the object type.
   * @param {string} columnName - Name of the static dropdown column.
   * @returns {string[]} Array of dropdown values.
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
   * Global dropdowns don't refer to a specific object name in their configuration so they are retrieved differently.
   * @param {string} globalDropdownName - Name of the global dropdown configuration.
   * @returns {string[]} Array of global dropdown values.
   */
  static getGlobalDropdownValues(globalDropdownName){
    const config = ConfigurationManager.getGlobalDropdownConfiguration(globalDropdownName);
    return config && config["Values"] ? config["Values"].split(",").map(v => v.trim()).filter(Boolean) : [];
  }
}

/**
 * General testing method, not meant to be called during production.
 * @deprecated Deprecated on 2026-06-24. Will be obsolete and safe to remove on or after 2026-12-24.
 */
function adHocTest(){
  LoggingManager.LogDebugMessage_(validationContext_getLookupRangeValuesForForm("Customer"));
}

/**
 * Retrieves the current lookup values for an object as an array.
 * @param {string} referencedObjectName - Name of the lookup object to find values of.
 * @returns {string[]} Array of strings that are the current lookup values for the provided object.
 */
function validationContext_getLookupRangeValuesForForm(referencedObjectName){
  return ValidationContext.getDataSheetObjectValidationValues(referencedObjectName);
}

/**
 * Global dropdowns don't refer to a specific object name in their configuration so they are retrieved differently.
 * @param {string} globalDropdownName - Name of the global dropdown to retrieve.
 * @returns {string[]} Array of strings representing the choosable values.
 */
function validationContext_GetGlobalDropdown(globalDropdownName){
  return ValidationContext.getGlobalDropdownValues(globalDropdownName);
}

/**
 * Retrieves the configured static dropdown values of an object.
 * @param {string} objectName - Object we want the columns of.
 * @param {string} dropdownFieldName - Name of the static dropdown column to retrieve values of.
 * @returns {string[]} Array of dropdown values.
 */
function validationContext_getObjectStaticDropdown(objectName, dropdownFieldName){
  return ValidationContext.getObjectDropdownColumnValues(objectName, dropdownFieldName);
}

/**
 * Global function to process validation on edit events.
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e - The edit event object.
 * @deprecated Deprecated on 2026-06-24. Will be obsolete and safe to remove on or after 2026-12-24.
 * Use RecordManager.processRecordEdit directly.
 */
function validationContext_processRecordEdit(e) {
  RecordManager.processRecordEdit(e);
}
