/**
 * Contains tools for processing spheet data validation and dynamically updating rules when a new record is created
 */
class ValidationContext {
  /**
   * Runs during the onEdit event
   * param {any} spreadsheet - The spreadsheet app context of the workbook
   * param {string} sheetName - The name of the sheet where the edit event occurred
   * param {any} e - The event context provided by the onEdit function
   */
  static processValidationContext_(spreadsheet, sheetName, e) {
    console.log("Running validation processing");
    console.log(getConfigValue("DataSheetsEnabledForValidation").split(","));
    if(getConfigValue("DataSheetsEnabledForValidation").split(",").includes(sheetName)){
      console.log("Validation enabled for sheet");
    }
    return;
  }
  /**
   * Returns a validation rule to apply to range based on the provided column name
   * @param {string} objectNme - The object to which the dropdown column corresponds
   * @param {string} dropdownColumnName - Desried dropdown column for validation
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
    targetSpreadsheet ?? (() => { throw new Error("Spreadheet Id not provided"); })();
    const helperSheet = SpreadsheetApp.openById(targetSpreadsheet).getSheetByName(this.getHelperRangeSheetName(objectName));
    helperSheet ?? (() => { throw new Error(`Helper sheet ${this.getHelperRangeSheetName(objectName)} does not exist in ${targetSpreadsheet}`)});
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
    !spreadsheet.getSheetByName(helperSheetName) ?? (() => { throw new Error(`Helper Sheet ${helperSheetName} already exists in workbook ${spreadsheetIdToCreateHelperSheetIn}`); })();
    spreadsheet.insertSheet(helperSheetName).hideSheet();
    if (spreadsheet.getSheetByName(helperSheetName)){
      return true;
    }
    throw new Error(`Helper Sheet for ${objectName}, ${helperSheetName} was not created in workbook ${spreadsheetIdToCreateHelperSheetIn}`);
  }
  /**
   * Checks if the object of a lookup needs a helper sheet in the provided workbook
   * @param {string} objectName - Object to evaluate for the need of a helper sheet
   * @param {string} spreadsheetIdToCheck - Targer spreadsheet for validation
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
    //Values of the range object, slicing off the first item since it is headers
    //Values are then flattened to a single dimensional array and any blanks and falsey values are removed
    const range = this.getDataSheetObjectValidationRange(objectName);
    const values = range.getValues();
    const sliced = values.slice(1); //removes header
    const flat = sliced.flat(); //flattens into a two diensional object
    const finalValues = flat.filter(Boolean); //removes blanks
    return finalValues;
  }
  /**
   * Retrieves a 1 column range containing all cells with the requested object's lookup values
   * @param {string} objectName - The name of the business object, which is also the singular of the sheet
   * returns {SpreadsheetService.Range} The 1 column range including the header
   */
  static getDataSheetObjectValidationRange(objectName) {
    objectName ?? (() => { throw new Error("Object name not provided"); })();
    const spreadsheetId = this.getObjectSpreadsheetId_(objectName);
    const sheetName = this.getObjectSheetName_(objectName);
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
    const spreadsheetId = this.getObjectSpreadsheetId_(objectName);
    const sheetName = this.getObjectSheetName_(objectName);
    const headerNum = this.getObjectSheetHeaderIndex_(objectName);
    const primaryColumnIndex = GlobalUtilities.getColumnIndexOnSheet(spreadsheetId, sheetName, objectName, headerNum);
    const primaryColumnLetter = GlobalUtilities.getColumnLetter(spreadsheetId, sheetName, primaryColumnIndex);
    return `${primaryColumnLetter}${headerNum}:${primaryColumnLetter}`;
  }

  /**
   * Retrieves the singular object name of the provided data sheet
   * @param {string} sheetName - The (plural) sheetName we need the object of
   * @returns {string} The name of the object
   */
  static getObjectNameFromSheet_(sheetName){
    return ConfigurationManager.getConfigValue(`${sheetName}_SINGULAR`);
  }
  /**
   * Retrieves the id of the spreadsheet containing the object's data sheet
   * @param {string} objectName - The (singular) object we need the sheet Name of
   * @returns {string} The name of the sheet and plural of the object
   */
  static getObjectSpreadsheetId_(objectName){
    return ConfigurationManager.getConfigValue(`${this.getObjectSheetName_(objectName)}_SPREADSHEET_ID`);
  }
  /**
   * Retrieves the data sheet name of the provided object, which is also the plural of the object
   * @param {string} objectName - The (singular) object we need the sheet Name of
   * @returns {string} The name of the sheet and plural of the object
   */
  static getObjectSheetName_(objectName){
    return ConfigurationManager.getConfigValue(`${objectName}_SHEET`);
  }
  /**
   * Retrieves the assigned header row for an objects data sheet
   * @param {string} objectName - Object for which we are getting the header row
   * @returns {string} The 1-indexed index of the header row on the sheet 
   */
  static getObjectSheetHeaderIndex_(objectName){
    return ConfigurationManager.getConfigValue(`${this.getObjectSheetName_(objectName)}_HEADER_NUM`);
  }
   /**
   * Retrieves the primary data fields that should be filled in on a record as an array
   * @param {string} objectName - Object for which we are getting the primary fields
   * @returns {string[]} Array of the Primary Field columns
   */
  static getObjectPrimaryFields_(objectName){
    return ConfigurationManager.getConfigValue(`${this.getObjectSheetName_(objectName)}_PRIMARY_FIELDS`).split(",");
  }
   /**
   * Retrieves the configured static dropdowns of an object
   * @param {string} objectName - Object we want the columns of
   * @returns {string[]} Array of all columns configured as static dropdowns for the object
   */
  static getObjectDropdownColumns_(objectName){
    return ConfigurationManager.getConfigValue(`${this.getObjectSheetName_(objectName)}_DROPDOWN_COLUMNS`);
  }
   /**
   * Retrieves the configured lookup dropdowns of an object
   * @param {string} objectName - Object we want the columns of
   * @returns {string[]} Array of all columns configured as lookup dropdowns for the object
   */
  static getObjectLookupColumns_(objectName){
    return ConfigurationManager.getConfigValue(`${this.getObjectSheetName_(objectName)}_LOOKUP_COLUMNS`).split(",");
  }
   /**
   * Retrieves the configured static dropdown values of an object
   * @param {string} objectName - Object we want the columns of
   * @param {string} columnName - Name of the static dropdown column to retrieve values of
   * @returns {string[]} Array of all columns configured as lookup dropdowns for the object
   */
  static getObjectDropdownColumnValues(objectName, columnName){
    return ConfigurationManager.getConfigValue(`${this.getObjectSheetName_(objectName)}_${columnName}_DROPDOWN_VALUES`).split(",");
  }
  /**
   * Global dropdowns don't refer to a specific object name in their configuration so they are retrieved differently
   * @param {string} globalDropdownName
   * @returns {string[]} Array of strings representing the choosable values
   */
  static getGlobalDropdownValues(globalDropdownName){
    return ConfigurationManager.getConfigValue(`${globalDropdownName}_DROPDOWN_VALUES`).split(",");
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
 * @param {string} objectName - Name of the lookup object to find values of
 * @returns {string[]} Array of strings that are the current lookup values for the provided object
 */
function validationContext_getLookupRangeValuesForForm(referencedObjectName){
  ValidationContext.getDataSheetObjectValidationValues(referencedObjectName);
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
 * @param {string} columnName - Name of the static dropdown column to retrieve values of
 * @returns {string[]} Array of all columns configured as lookup dropdowns for the object
 */
function validationContext_getObjectStaticDropdown(objectName, dropdownFieldName){
  return ValidationContext.getObjectDropdownColumnValues(objectName, dropdownFieldName);
}

/**
 * 
 * @param {}  -
 * @returns {}
 * @example
 */
