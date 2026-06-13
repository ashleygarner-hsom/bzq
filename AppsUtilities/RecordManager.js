/**
 * The Record Manager coordinates the creation, modification, and persistence of data records.
 * It handles resolving ID sequences, formatting rows, and triggering validation checks.
 */
class RecordManager {
  /**
   * Retrieves the object configuration, spreadsheet, and sheet by sheet name.
   * @param {string} sheetName - The name of the datasheet
   * @returns {Object} Config, spreadsheet, and sheet instances
   * @private
   */
  /**
   * Retrieves the object configuration, spreadsheet, and sheet by sheet name or object name.
   * @param {string} sheetNameOrObjectName - The name of the datasheet or the object
   * @returns {Object} Config, spreadsheet, and sheet instances
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
   * @param {SpreadsheetApp.Spreadsheet} spreadsheet - The parent spreadsheet
   * @param {SpreadsheetApp.Sheet} sheet - The target sheet
   * @param {number} row - The row index of the new record
   * @param {Object} objConfig - The object configuration record
   * @private
   */
  static finalizeNewRecordRow_(spreadsheet, sheet, row, objConfig) {
    const sheetName = sheet.getName();
    // Apply row formatting
    FormatManager.formatRow(sheet, row, objConfig);
    
    // Apply validation rules immediately, ignoring empty primary fields check
    const lastCol = sheet.getLastColumn() || 1;
    const validationRange = sheet.getRange(row, 1, 1, lastCol);
    ValidationContext.processRecordEdit(spreadsheet, sheetName, validationRange, objConfig, true);
  }

  /**
   * Call this method when a new record is being entered from the spreadsheet grid.
   * Coordinates sequence retrieval, styling, and validation triggers.
   * @param {string} sheetName - Name of the datasheet where the new record is created
   * @param {boolean} isForForm - Set to true if called from Forms Engine to bypass sheet insertion
   * @returns {string|null} The next sequence ID if isForForm is true, otherwise null
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
   * Resolves the AUTOID sequence value, appends the record, formats the new row,
   * and runs the validation manager.
   * @param {string} objectType - Name of the object type (correlates to the datasheet name or object name)
   * @param {Object} recordData - The object representing the fields and values of the record to add
   * @returns {string} Success confirmation message
   */
  static addRecord(objectType, recordData) {
    const { objConfig, spreadsheet, sheet } = this.getSheetAndConfig_(objectType);
    const datasheetName = objConfig["Datasheet"];

    // Call SequenceManager to generate the next sequence value if the ID field is empty
    const idFieldName = objConfig["Id Field Name"];
    if (idFieldName && (!recordData[idFieldName] || recordData[idFieldName] === "")) {
      recordData[idFieldName] = SequenceManager.processSequenceForObject(datasheetName);
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const newRow = headers.map(header => recordData[header] || "");
    
    // Append the row to the sheet
    sheet.appendRow(newRow);
    const lastRow = sheet.getLastRow();

    this.finalizeNewRecordRow_(spreadsheet, sheet, lastRow, objConfig);
    return "Success!";
  }

  /**
   * Processes record edits on watched sheets, routing them to the validation context.
   * @param {GoogleAppsScript.Events.SheetsOnEdit} e - The onEdit event object
   */
  static processRecordEdit(e) {
    if (!e || !e.range) return;
    const range = e.range;
    const sheet = range.getSheet();
    const sheetName = sheet.getName();
    const spreadsheet = e.source;
    
    // Retrieve object configuration by datasheet name
    const objConfig = ConfigurationManager.getObjectConfiguration(sheetName, 'datasheetName');
    if (!objConfig) return;
    
    // Process row formatting and auto-populate missing IDs
    this.processEditRows_(sheet, range, objConfig);
    
    // Check if validation is enabled
    const enabled = String(objConfig["Enabled For Validation"]).toUpperCase() === 'TRUE';
    if (!enabled) return;
    
    // Route to ValidationContext
    ValidationContext.processRecordEdit(spreadsheet, sheetName, range, objConfig);
  }

  /**
   * Processes row-level edits (formatting and ID auto-population) for the edited range.
   * @param {SpreadsheetApp.Sheet} sheet - The target sheet
   * @param {SpreadsheetApp.Range} range - The edited range
   * @param {Object} objConfig - The datasheet object configuration
   * @private
   */
  static processEditRows_(sheet, range, objConfig) {
    const startRow = range.getRow();
    const numRows = range.getNumRows();
    const headerNumber = Number(objConfig["Header Number"]) || 1;
    
    for (let r = 0; r < numRows; r++) {
      const row = startRow + r;
      if (row <= headerNumber) continue;
      
      // Apply row formatting
      FormatManager.formatRow(sheet, row, objConfig);
      
      // Auto-populate ID if needed
      this.autoPopulateIdIfNeeded_(sheet, row, objConfig);
    }
  }

  /**
   * Auto-populates the Sequence ID for a given row if it is missing and the row contains other data.
   * @param {SpreadsheetApp.Sheet} sheet - The target sheet
   * @param {number} row - The row index to process
   * @param {Object} objConfig - The datasheet object configuration
   * @private
   */
  static autoPopulateIdIfNeeded_(sheet, row, objConfig) {
    const idCell = this.getIdCellRange_(sheet, row, objConfig);
    if (!idCell) return;
    
    const idVal = this.getIdCellValue_(idCell);
    if (idVal === "" || idVal === null || idVal === undefined) {
      const lastCol = sheet.getLastColumn() || 1;
      const isRowEmpty = this.checkAllRowValuesEmpty_(sheet, row, lastCol);
      if (!isRowEmpty) {
        try {
          const newRecordNumber = SequenceManager.processSequenceForObject(sheet.getName());
          if (newRecordNumber) {
            idCell.setValue(newRecordNumber);
          }
        } catch (seqErr) {
          LoggingManager.LogError_(`Failed to auto-generate sequence ID for row ${row} on sheet ${sheet.getName()}: ` + seqErr.message);
        }
      }
    }
  }

  /**
   * Retrieves the range (single cell) of the ID field for a specific row in a sheet.
   * @param {SpreadsheetApp.Sheet} sheet - The target sheet
   * @param {number} row - The row index
   * @param {Object} objConfig - The object configuration record
   * @returns {SpreadsheetApp.Range|null} The single cell range for the ID, or null if ID column cannot be resolved
   * @private
   */
  static getIdCellRange_(sheet, row, objConfig) {
    const spreadsheetId = objConfig["Spreadsheet Id"];
    const idFieldName = objConfig["Id Field Name"];
    const headerNumber = Number(objConfig["Header Number"]) || 1;
    
    if (!idFieldName) return null;
    
    try {
      const idColumnIndex = GlobalUtilities.getColumnIndexOnSheet(
        spreadsheetId,
        sheet.getName(),
        idFieldName,
        headerNumber
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
   * Retrieves the ID value from a given ID cell range.
   * @param {SpreadsheetApp.Range} idCellRange - The single cell range for the ID field
   * @returns {any} The ID value, or undefined if range is null
   * @private
   */
  static getIdCellValue_(idCellRange) {
    if (!idCellRange) return undefined;
    return idCellRange.getValue();
  }

  /**
   * Helper to check if all cell values in a given row are empty.
   * @param {SpreadsheetApp.Sheet} sheet - The target sheet
   * @param {number} row - The row index to check
   * @param {number} lastCol - The last column index of the sheet
   * @returns {boolean} True if all cells in the row are empty, false otherwise
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
 * @param {string} sheetName - Name of the data sheet that a user is creating a new record in.
 */
function newRecord(sheetName) {
  RecordManager.newRecord(sheetName);
}

/**
 * Validates and increments sequence for the provided sheetName's Id.
 * @param {string} sheetName - The sheetName is also the plural of the underlying data objects
 * @returns {string} The next Id to use for the requested object
 */
function requestRecordIdForForm(sheetName) {
  return RecordManager.newRecord(sheetName, true);
}

/**
 * Processes record edits on watched sheets, routing them to the validation context.
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e - The onEdit event object
 */
function recordManager_processRecordEdit(e) {
  RecordManager.processRecordEdit(e);
}

/**
 * Global wrapper to add a new record to the sheet for the given object type.
 * @param {string} objectType - The name of the object type (sheet name)
 * @param {Object} recordData - Key-value pair object representing record fields
 * @returns {string} Success message
 */
function recordManager_addRecord(objectType, recordData) {
  return RecordManager.addRecord(objectType, recordData);
}
