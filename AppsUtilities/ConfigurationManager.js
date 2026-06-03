/**
 * Contains tools for retrieving, managing, and caching configuration keys and their values
 */
class ConfigurationManager {
  /**Reference to the configuration properties spreadsheet*/
  static get spreadsheet_() {
    const workbookId = AppUtilitiesGlobalProperties.configurationPropertiesWorkbookId_;
    const spreadsheet = SpreadsheetApp.openById(workbookId);
    return spreadsheet;
  };
  /**Referece to the google sheets app scripts script cache */
  static get cache_() {
    return CacheService.getScriptCache();
  };
  /**The prefix used by Configuration Manager to designate configuration cached keys and values */
  static get keyPrefix_() {
    return 'config_';
  }
  /**
   * Adds keyPrefix_ to the key being retrieved from the cache
   * @param {string} key The configuration key as it appears in the Configuration Properties sheet
   * @return {string} The concatenated key for use retrieving from the Script Cache
   */
  static getCacheKey_(key) {
    return this.keyPrefix_ + key;
  }
  /**
   * Returns the key and values data from the configuration properties sheet
   * @param {boolean} logExecution = true - Set to false to disable logging the current execution
   * @return {Object[][]|null}. The two dimensional array containing the retrieved configuration properties
   */
  static getConfigurationPropertiesData_(logExecution = true) {
    const configPropertySheetName = AppUtilitiesGlobalProperties.configurationPropertiesSheetName_;
    const sheet = this.spreadsheet_.getSheetByName(configPropertySheetName);
    if (!sheet) {
      if (logExecution) {
        console.error(`Sheet '${AppUtilitiesGlobalProperties.configurationPropertiesSheetName_}' not found.`);
      }
      return null;
    }
    return sheet.getDataRange().getValues();
  }
  /**
   * Efficiently retrieves a configuration value with caching.
   * @param {string} key The configuration key to search for.
   * @param {boolean} logExecution = true - Set to false to disable logging the current execution
   * @return {string|null} The value from the cache or sheet, or null if not found.
   */
  static getConfigValue(key, logExecution = true) {
    if (logExecution) {
      LoggingManager.LogDebugMessage_(`Searching for property key: ${key}`);
    }
    const cachedValue = this.cache_.get(this.getCacheKey_(key));
    if (cachedValue !== null) {
      return cachedValue;
    }
    const data = this.getConfigurationPropertiesData_();
    /**Start at row 1 to skip headers, scan each row's first value and return the second if the key matches */
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === key) {
        const value = String(data[i][1]); // Cache only stores strings
        if (logExecution) {
          LoggingManager.LogDebugMessage_(`Found config value: ${value}`);
        }
        // Store in cache for 25 minutes (1500 seconds)
        this.cache_.put(this.getCacheKey_(key), value, 1500);
        return value;
      }
    }
    return null;
  }
  /**
   * Retrieves all configuration keys and values, logs the current cached value, removes it, and adds the current value and logs the new value
   * Use to update the configuration cache to hold the current values in the sheet
   * @param {boolean} logExecution = true - Set to false to disable logging the current execution
   */
  static updateCachedConfigValues(logExecution = true) {
    const data = this.getConfigurationPropertiesData_(logExecution)
    data.forEach((configRow, index) => {
      if (configRow[0] !== null && index !== 0) {
        if (logExecution) {
          LoggingManager
            .LogDebugMessage_(`Initial value for key ${this.getCacheKey_(configRow[0])}: ${this.cache_.get(this.getCacheKey_(configRow[0]))}`);
        }
        this.cache_.remove(this.getCacheKey_(configRow[0]));
        this.cache_.put(this.getCacheKey_(configRow[0]), configRow[1]);
        if (logExecution) {
          LoggingManager.LogDebugMessage_(`New value for key ${this.getCacheKey_(configRow[0])}: ${this.cache_.get(this.getCacheKey_(configRow[0]))}`);
        }
      }
    });
  }
}
/**
 * Retrieves all configuration keys and values, logs the current cached value, removes it, and adds the current value and logs the new value
 * Use to update the configuration cache to hold the current values in the sheet
 * @param {boolean} logExecution = true - Set to false to disable logging the current execution, primarily used by the SequenceManager
 */
function configurationManager_UpdateCachedConfigValues(logExecution = true) {
  return ConfigurationManager.updateCachedConfigValues(logExecution);
}
/**
 * Efficiently retrieves a configuration value with caching.
 * @param {string} key The configuration key to search for.
 * @param {boolean} logExecution = true - Set to false to disable logging the current execution
 * @return {string|null} The value from the cache or sheet, or null if not found.
 */
function configurationManager_GetConfigValue(key, logExecution = true) {
  return ConfigurationManager.getConfigValue(key, logExecution);
}