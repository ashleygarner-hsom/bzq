/**
 * The Record Manager coordinates the creation, modification, and persistence of data records.
 * It handles resolving ID sequences, formatting rows, and triggering validation checks.
 */
class RecordManager {
  /**
   * Retrieves the object configuration, spreadsheet, and sheet by sheet name or object name.
   * @param {string} sheetNameOrObjectName - Plural datasheet name or singular object name to query.
   * @returns {{ objConfig: Object, spreadsheet: SpreadsheetApp.Spreadsheet, sheet: SpreadsheetApp.Sheet }} Location and configuration details.
   * @throws {Error} If configuration sheet or sheet cannot be resolved.
   * @private
   */
  static getSheetAndConfig_(sheetNameOrObjectName) {
    let objConfig = ConfigurationManager.getObjectConfiguration(sheetNameOrObjectName, 'datasheetName');
    if (!objConfig) {
      objConfig = ConfigurationManager.getObjectConfiguration(sheetNameOrObjectName, 'objectName');
    }
    if (!objConfig) {
      throw new Error(`Configuration not found for sheet or object ${sheetNameOrObjectName}`);
    }
    const datasheetName = objConfig["Datasheet"];
    const spreadsheetId = objConfig["Spreadsheet Id"];
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getSheetByName(datasheetName);
    if (!sheet) {
      throw new Error(`Sheet ${datasheetName} not found in workbook.`);
    }
    return { objConfig, spreadsheet, sheet };
  }

  /**
   * Finalizes a newly created record row by applying formatting and validation rules.
   * @param {SpreadsheetApp.Spreadsheet} spreadsheet - The active spreadsheet object.
   * @param {SpreadsheetApp.Sheet} sheet - The target sheet where record was created.
   * @param {number} row - The 1-based index of the new row.
   * @param {Object} objConfig - The object configuration metadata record.
   * @returns {void}
   * @private
   */
  static finalizeNewRecordRow_(spreadsheet, sheet, row, objConfig) {
    const sheetName = sheet.getName();
    FormatManager.formatRow(sheet, row, objConfig);
    
    const lastCol = sheet.getLastColumn() || 1;
    const validationRange = sheet.getRange(row, 1, 1, lastCol);
    ValidationContext.processRecordEdit({
      spreadsheet,
      sheetName,
      range: validationRange,
      objConfig,
      forceValidation: true
    });
  }

  /**
   * Call this method when a new record is being entered from the spreadsheet grid.
   * Coordinates sequence retrieval, styling, and validation triggers.
   * @param {string} sheetName - Plural name of the datasheet.
   * @param {boolean} [isForForm=false] - If true, returns sequence ID and bypasses row insertion.
   * @returns {string|null} Generated sequence ID if isForForm is true, otherwise null.
   */
  static newRecord(sheetName, isForForm = false) {
    const { objConfig, spreadsheet, sheet } = this.getSheetAndConfig_(sheetName);
    const datasheetName = objConfig["Datasheet"];
    const newRecordNumber = SequenceManager.processSequenceForObject(datasheetName);
    if (isForForm) {
      return newRecordNumber;
    }
    
    const lastDataRow = sheet.getLastRow() + 1;
    const recordIdRange = this.getIdCellRange_(sheet, lastDataRow, objConfig);
    if (recordIdRange) {
      recordIdRange.setValue(newRecordNumber);
    }
    
    this.finalizeNewRecordRow_(spreadsheet, sheet, lastDataRow, objConfig);
    return null;
  }

  /**
   * Adds a new record to the sheet associated with the given object type.
   * Maps input properties to columns and appends the row to the sheet.
   * @param {string} objectType - Singular or plural name of the object type.
   * @param {Object<string, *>} recordData - Key-value pair object representing record fields.
   * @returns {string} Success message.
   */
  static addRecord(objectType, recordData) {
    const { objConfig, spreadsheet, sheet } = this.getSheetAndConfig_(objectType);
    const datasheetName = objConfig["Datasheet"];

    const idFieldName = objConfig["Id Field Name"];
    if (idFieldName && (!recordData[idFieldName] || recordData[idFieldName] === "")) {
      recordData[idFieldName] = SequenceManager.processSequenceForObject(datasheetName);
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const newRow = headers.map(header => recordData[header] || "");
    
    sheet.appendRow(newRow);
    this.finalizeNewRecordRow_(spreadsheet, sheet, sheet.getLastRow(), objConfig);
    return "Success!";
  }

  /**
   * Processes record edits on watched sheets, routing them to the validation context.
   * Bypassed if edit is not in a watched sheet.
   * @param {GoogleAppsScript.Events.SheetsOnEdit} e - The Google Apps Script edit event object.
   * @returns {void}
   */
  static processRecordEdit(e) {
    if (!e || !e.range) return;
    const range = e.range;
    const sheet = range.getSheet();
    const sheetName = sheet.getName();
    const spreadsheet = e.source;
    
    const objConfig = ConfigurationManager.getObjectConfiguration(sheetName, 'datasheetName');
    if (!objConfig) return;
    
    this.processEditRows_(sheet, range, objConfig);
    
    const enabled = String(objConfig["Enabled For Validation"]).toUpperCase() === 'TRUE';
    if (!enabled) return;
    
    ValidationContext.processRecordEdit({ spreadsheet, sheetName, range, objConfig });
  }

  /**
   * Processes row-level edits (formatting and ID auto-population) for the edited range.
   * @param {SpreadsheetApp.Sheet} sheet - The edited sheet.
   * @param {SpreadsheetApp.Range} range - The edited range of cells.
   * @param {Object} objConfig - The configuration metadata for the edited datasheet.
   * @returns {void}
   * @private
   */
  static processEditRows_(sheet, range, objConfig) {
    const startRow = range.getRow();
    const numRows = range.getNumRows();
    const headerNumber = Number(objConfig["Header Number"]) || 1;
    
    for (let r = 0; r < numRows; r++) {
      const row = startRow + r;
      if (row > headerNumber) {
        FormatManager.formatRow(sheet, row, objConfig);
        this.autoPopulateIdIfNeeded_(sheet, row, objConfig);
      }
    }
  }

  /**
   * Auto-populates the Sequence ID for a given row if it is missing and the row contains other data.
   * @param {SpreadsheetApp.Sheet} sheet - The target sheet.
   * @param {number} row - The 1-based index of the row to process.
   * @param {Object} objConfig - Configuration metadata of the datasheet.
   * @returns {void}
   * @private
   */
  static autoPopulateIdIfNeeded_(sheet, row, objConfig) {
    const idCell = this.getIdCellRange_(sheet, row, objConfig);
    if (!idCell) return;
    
    const idVal = idCell.getValue();
    if (idVal === "" || idVal === null || idVal === undefined) {
      const lastCol = sheet.getLastColumn() || 1;
      const isRowEmpty = this.checkAllRowValuesEmpty_(sheet, row, lastCol);
      if (!isRowEmpty) {
        try {
          const newRecordNumber = SequenceManager.processSequenceForObject(sheet.getName());
          if (newRecordNumber) idCell.setValue(newRecordNumber);
        } catch (seqErr) {
          LoggingManager.LogError_(`Failed to auto-generate sequence ID for row ${row}: ` + seqErr.message);
        }
      }
    }
  }

  /**
   * Retrieves the range (single cell) of the ID field for a specific row in a sheet.
   * @param {SpreadsheetApp.Sheet} sheet - The target sheet.
   * @param {number} row - The 1-based index of the row.
   * @param {Object} objConfig - The datasheet configuration metadata.
   * @returns {SpreadsheetApp.Range|null} Cell range for the ID field, or null if field cannot be resolved.
   * @private
   */
  static getIdCellRange_(sheet, row, objConfig) {
    const idFieldName = objConfig["Id Field Name"];
    if (!idFieldName) return null;
    
    try {
      const idColumnIndex = GlobalUtilities.getColumnIndexOnSheet(
        { spreadsheetId: objConfig["Spreadsheet Id"], sheetName: sheet.getName() },
        idFieldName,
        Number(objConfig["Header Number"]) || 1
      );
      if (idColumnIndex !== -1) {
        return sheet.getRange(row, idColumnIndex);
      }
    } catch (err) {
      LoggingManager.LogError_(`Failed to resolve ID column for field ${idFieldName}: ` + err.message);
    }
    return null;
  }

  /**
   * Helper to check if all cell values in a given row are empty.
   * @param {SpreadsheetApp.Sheet} sheet - The target sheet.
   * @param {number} row - The 1-based index of the row to check.
   * @param {number} lastCol - Last column index to scan.
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
}

/**
 * For the provided sheetName (plural of object) generates the next sequence value and adds it to the requested sheet.
 * @param {string} sheetName - Plural name of the datasheet.
 * @returns {void}
 * @deprecated Deprecated on 2026-06-24. Will be obsolete and safe to remove on or after 2026-12-24.
 * Use RecordManager.newRecord instead.
 */
function newRecord(sheetName) {
  RecordManager.newRecord(sheetName);
}

/**
 * Validates and increments sequence for the provided sheetName's Id.
 * @param {string} sheetName - The sheetName is also the plural of the underlying data objects.
 * @returns {string} The next Id to use for the requested object.
 */
function requestRecordIdForForm(sheetName) {
  return RecordManager.newRecord(sheetName, true);
}

/**
 * Processes record edits on watched sheets, routing them to the validation context.
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e - The edit event object.
 * @returns {void}
 * @deprecated Deprecated on 2026-06-24. Will be obsolete and safe to remove on or after 2026-12-24.
 * Use RecordManager.processRecordEdit directly.
 */
function recordManager_processRecordEdit(e) {
  RecordManager.processRecordEdit(e);
}

/**
 * Global wrapper to add a new record to the sheet for the given object type.
 * @param {string} objectType - The name of the object type (sheet name).
 * @param {Object<string, *>} recordData - Key-value pair object representing record fields.
 * @returns {string} Success message.
 */
function recordManager_addRecord(objectType, recordData) {
  return RecordManager.addRecord(objectType, recordData);
}
