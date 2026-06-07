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
    const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);
    const idFieldName = objConfig["Id Field Name"];
    const headerNumber = Number(objConfig["Header Number"]) || 1;
    const newRecordNumber = SequenceManager.processSequenceForObject(sheetName);
    if (isForForm) {
      return newRecordNumber;
    }
    const idColumnIndex = GlobalUtilities.getColumnIndexOnSheet(spreadsheetId, 
                                                       sheetName,
                                                       idFieldName,
                                                       headerNumber
                                                       );
    const lastDataRow = sheet.getLastRow() + 1
    const recordIdRange = sheet.getRange(lastDataRow, idColumnIndex);
    recordIdRange.setValue(newRecordNumber);
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
    
    // Check if validation is enabled
    const enabled = String(objConfig["Enabled For Validation"]).toUpperCase() === 'TRUE';
    if (!enabled) return;
    
    // Route to ValidationContext
    ValidationContext.processRecordEdit(spreadsheet, sheetName, range, objConfig);
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
