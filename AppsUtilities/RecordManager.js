/**
 * The Record Manager provides utilities for managing the creation of records.
 * Record Manager handles calling the relevant sub methods for managing id sequences and triggering evaluation of validation
 */
class RecordManager{
  /**
   * Call this method when a new record is being entered.  It coordinates calling other services needed during record creation
   * @input {string} sheetName - Name of the data sheet where new record is being created
   * @input {boolean} isForForm - Set to true if being called from the Forms Engine, this will skip triggering adding the record to the sheet and running the validation context since that will be triggered via form submission
   * @returns {string|null} Returns the next sequence id if isForForm is true, otherwise nothing is directly returned
   */
  static newRecord(sheetName, isForForm = false){
    const objConfig = ConfigurationManager.getObjectConfiguration(sheetName, 'datasheetName');
    if (!objConfig) {
      throw new Error(`Configuration not found for sheet ${sheetName}`);
    }
    const spreadsheetId = objConfig["Spreadsheet Id"];
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error(`Sheet ${sheetName} not found in workbook.`);
    }
    const newRecordNumber = SequenceManager.processSequenceForObject(sheetName);
    if (isForForm) {
      return newRecordNumber;
    }
    const lastDataRow = sheet.getLastRow() + 1;
    const recordIdRange = this.getIdCellRange_(sheet, lastDataRow, objConfig);
    if (recordIdRange) {
      recordIdRange.setValue(newRecordNumber);
    }
    
    // Apply formatting to the new record row
    FormatManager.formatRow(sheet, lastDataRow, objConfig);
    
    // Apply validation rules to the new row immediately, ignoring the empty primary fields check
    const lastCol = sheet.getLastColumn() || 1;
    const validationRange = sheet.getRange(lastDataRow, 1, 1, lastCol);
    ValidationContext.processRecordEdit(spreadsheet, sheetName, validationRange, objConfig, true);
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
 * For the provided sheetName (plural of object) generates the next sequence value and adds it to the requested sheet for entry from the sheet view
 * @input {string} sheetName - Name of the data sheet that a user is creating a new record in.
 */
function newRecord(sheetName){
  RecordManager.newRecord(sheetName);
}
/**
 * Validates and increments sequence for the provided sheetName's Id.
 * Once a sequence value is requested it cannot be decremented and will be lost, resulting in the value being skipped
 * @input {string} sheetName - The sheetName is also the plural of the underlying data objects
 * @returns {string} The next Id to use for the requested object
 */
function requestRecordIdForForm(sheetName){
  return RecordManager.newRecord(sheetName, true);
}
/**
 * Processes record edits on watched sheets, routing them to the validation context.
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e - The onEdit event object
 */
function recordManager_processRecordEdit(e) {
  RecordManager.processRecordEdit(e);
}
