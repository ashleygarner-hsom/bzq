/**
 * Retrieves and manages sequence configuration data, columns of sequence configuration are as follows:
 * Datasheet Name	- The plural of the business object name
 * Sequence Prefix	- Sequence of letters to append to sequence number
 * Starting Number	- Reference to number at which sequence started
 * Format	- Format to assign to cells displaying the sequence number
 * Current Value - The next valid number in the sequence, is incremented by one each time a new record is created and assigned an id
 */
class SequenceManager {
  /**Reference to the configuration properties spreadsheet*/
  static get spreadsheet_(){
    const spreadsheet = SpreadsheetApp.openById(AppUtilitiesGlobalProperties.configurationPropertiesWorkbookId_);
    return spreadsheet;
  };
  /**
   * Static reference to the sheet containing sequence data
   */
  static get sequenceSheet_() {
    const sheet = this.spreadsheet_.getSheetByName(AppUtilitiesGlobalProperties.sequenceConfigurationSheetName_);
    return sheet;
  }
  /**
   * Static reference to all data in the sequence configuration sheet
   */
  static get sequenceData_(){
    const sequenceSheet = this.sequenceSheet_;
    const sequenceData = sequenceSheet.getDataRange().getValues();
    return sequenceData;
  }
  /**
   * Finds and returns the row of sequence data as an array of cells for the provided datasheet name
   * @param {string} dataSheetName - The name of the business object that is used as the plural of the object
   * @return {any} The row of sequence configuration data as an array of cells
   */
  static retrieveSequenceDataRow_(dataSheetName){
    const sequenceData = this.sequenceData_;
    for (let i = 1; i < sequenceData.length; i++){
      const currentEntry = sequenceData[i];
      if (currentEntry[0] === dataSheetName){
        currentEntry.rowIndex = i;
        return currentEntry;
      }
    } 
  }
  /**
   * Retrieves the next valid value in the sequence for the provided dataSheetName
   * @param {string} dataSheetName - The plural of the business object which also acts as the sheet name
   * @return {string} The next valid value to use in the sequence
   */
  static retrieveNextSequenceValue_(dataSheetName){
    const sequenceRow = this.retrieveSequenceDataRow_(dataSheetName);
    if (sequenceRow !== null){
      return `${sequenceRow[1]}${sequenceRow[4]}`;
    }
  }
  /**
   * Increments the sequence for the provided data sheet name by one for next use
   * @param {string} dataSheetName - The plural of the business object which also acts as the sheet name
   * @returns {string | null} The incremented sequence number, or null is process was unsuccessful
   */
  static incrementSequence_(dataSheetName){
    const sequenceRow = this.retrieveSequenceDataRow_(dataSheetName);
    const sequenceRowIndex = sequenceRow.rowIndex;
    const nextSequenceValue = sequenceRow[4] + 1
    this.sequenceSheet_.getRange(sequenceRowIndex + 1, 5).setValue(nextSequenceValue);
    return `${sequenceRow[1]}${nextSequenceValue}`;
  }
  /**
   * For the provided object name, retrieves the next sequence value to use and increments the record for the next value
   * @param {string} dataSheetName - The plural of the business object which is also used as the sheet name
   * @returns {string | null} The next value in the sequence to use, or null if the processing failed
   */
  static processSequenceForObject(dataSheetName){
    if (dataSheetName === null){
      return null;
    }
    const sequenceValueToUse = this.retrieveNextSequenceValue_(dataSheetName);
    const nextSequenceValue = this.incrementSequence_(dataSheetName);
    if (sequenceValueToUse !== nextSequenceValue) {
      return sequenceValueToUse;
    }
    return null;
  }
}