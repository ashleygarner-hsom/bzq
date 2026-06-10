/**
 * Retrieves and manages sequence configuration data.
 */
class SequenceManager {
  /**Reference to the configuration properties spreadsheet*/
  static get spreadsheet_(){
    const spreadsheet = SpreadsheetApp.openById(AppUtilitiesGlobalProperties.configurationPropertiesWorkbookId_);
    return spreadsheet;
  };
  
  /**Reference to the sheet containing sequence data*/
  static get sequenceSheet_() {
    const sheet = this.spreadsheet_.getSheetByName(AppUtilitiesGlobalProperties.sequenceConfigurationSheetName_);
    return sheet;
  }
  
  /**
   * For the provided datasheet name, retrieves the next sequence value to use and increments the record for the next value.
   * Uses dynamic header mapping to locate columns.
   * @param {string} dataSheetName - The plural of the business object which is also used as the sheet name
   * @returns {string | null} The next value in the sequence to use, or null if the processing failed
   */
  static processSequenceForObject(dataSheetName) {
    if (!dataSheetName) return null;
    
    const sheet = this.sequenceSheet_;
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      throw new Error("Sequence configuration sheet is empty.");
    }
    
    const headers = data[0].map(h => String(h).trim());
    const dsColIndex = headers.indexOf("Datasheet Name");
    const prefixColIndex = headers.indexOf("Sequence Prefix");
    const currentValColIndex = headers.indexOf("Current Value");
    
    if (dsColIndex === -1 || prefixColIndex === -1 || currentValColIndex === -1) {
      throw new Error("Missing required columns in Sequence Configuration sheet.");
    }
    
    // Find matching row
    let rowIndex = -1;
    let sequenceRow = null;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][dsColIndex]).trim() === dataSheetName) {
        rowIndex = i;
        sequenceRow = data[i];
        break;
      }
    }
    
    if (!sequenceRow) {
      const errorMsg = `Sequence configuration row not found for datasheet name '${dataSheetName}'.`;
      LoggingManager.LogError_(errorMsg);
      throw new Error(errorMsg);
    }
    
    const prefix = sequenceRow[prefixColIndex];
    const currentValue = Number(sequenceRow[currentValColIndex]);
    if (isNaN(currentValue)) {
      throw new Error(`Invalid non-numeric Current Value for datasheet '${dataSheetName}'.`);
    }
    
    const sequenceValueToUse = `${prefix}${currentValue}`;
    const nextSequenceValue = currentValue + 1;
    
    // Increment value in sheet (rowIndex + 1 for 1-based, currentValColIndex + 1 for 1-based)
    sheet.getRange(rowIndex + 1, currentValColIndex + 1).setValue(nextSequenceValue);
    
    return sequenceValueToUse;
  }
}