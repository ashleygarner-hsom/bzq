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
   * Formats and returns the next valid value in the sequence based on the provided sequence row data
   * @param {any[]} sequenceRow - The row of sequence configuration data
   * @return {string | null} The formatted sequence value
   */
  static retrieveNextSequenceValue_(sequenceRow) {
    if (sequenceRow !== null && sequenceRow !== undefined) {
      return `${sequenceRow[1]}${sequenceRow[4]}`;
    }
    return null;
  }
  /**
   * Increments the sequence in the sheet by one and returns the incremented formatted sequence value
   * @param {any[]} sequenceRow - The row of sequence configuration data
   * @returns {string | null} The incremented sequence number, or null if the process was unsuccessful
   */
  static incrementSequence_(sequenceRow) {
    if (!sequenceRow) {
      return null;
    }
    const sequenceRowIndex = sequenceRow.rowIndex;
    const nextSequenceValue = sequenceRow[4] + 1;
    this.sequenceSheet_.getRange(sequenceRowIndex + 1, 5).setValue(nextSequenceValue);
    return `${sequenceRow[1]}${nextSequenceValue}`;
  }
  /**
   * For the provided object name, retrieves the next sequence value to use and increments the record for the next value.
   * This is optimized to read the sequence configuration sheet only once.
   * @param {string} dataSheetName - The plural of the business object which is also used as the sheet name
   * @returns {string | null} The next value in the sequence to use, or null if the processing failed
   */
  static processSequenceForObject(dataSheetName) {
    if (dataSheetName === null) {
      return null;
    }
    const sequenceRow = this.retrieveSequenceDataRow_(dataSheetName);
    if (!sequenceRow) {
      const errorMsg = `Sequence configuration row not found for datasheet name '${dataSheetName}'.`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    
    const sequenceValueToUse = this.retrieveNextSequenceValue_(sequenceRow);
    const nextSequenceValue = this.incrementSequence_(sequenceRow);
    
    if (sequenceValueToUse === nextSequenceValue || sequenceValueToUse === null || nextSequenceValue === null) {
      const errorMsg = `Sequence increment failed for '${dataSheetName}'. Current formatted value: '${sequenceValueToUse}', next formatted value: '${nextSequenceValue}'. Verify that the sequence starting/current value is configured as a valid number in '__SequenceConfiguration'.`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    
    return sequenceValueToUse;
  }
}