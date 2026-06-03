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
    const spreadsheetId = ConfigurationManager.getConfigValue(`${sheetName}_SPREADSHEET_ID`);
    const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);
    const idFieldName = ConfigurationManager.getConfigValue(`${sheetName}_ID_FIELD_NAME`);
    const headerNumber = ConfigurationManager.getConfigValue(`${sheetName}_HEADER_NUM`);
    const newRecordNumber = SequenceManager.processSequenceForObject(sheetName);
    if (isForForm = true) {
      return newRecordNumber;
    }
    const idColumnIndex = AppUtilitiesGlobalProperties.getColumnIndexOnSheet(spreadsheetId, 
                                                       sheetName,
                                                       idFieldName,
                                                       headerNumber
                                                       );
    const lastDataRow = sheet.getLastRow() + 1
    const recordIdRange = sheet.getRange(lastDataRow, idColumnIndex);
    recordIdRange.setValue(newRecordNumber);
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
