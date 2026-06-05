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
      if (cachedValue === '___NULL___') {
        return null;
      }
      return cachedValue;
    }
    const data = this.getConfigurationPropertiesData_(logExecution);
    if (!data) {
      return null;
    }
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
    // Negative caching: Cache the missing key to avoid repeated sheet reads
    this.cache_.put(this.getCacheKey_(key), '___NULL___', 1500);
    return null;
  }
  /**
   * Retrieves all configuration keys and values, logs the current cached value, removes it, and adds the current value and logs the new value
   * Use to update the configuration cache to hold the current values in the sheet
   * @param {boolean} logExecution = true - Set to false to disable logging the current execution
   */
  static updateCachedConfigValues(logExecution = true) {
    const data = this.getConfigurationPropertiesData_(logExecution)
    if (!data) {
      return;
    }
    data.forEach((configRow, index) => {
      if (configRow[0] !== null && index !== 0) {
        if (logExecution) {
          LoggingManager
            .LogDebugMessage_(`Initial value for key ${this.getCacheKey_(configRow[0])}: ${this.cache_.get(this.getCacheKey_(configRow[0]))}`);
        }
        this.cache_.remove(this.getCacheKey_(configRow[0]));
        this.cache_.put(this.getCacheKey_(configRow[0]), configRow[1], 1500);
        if (logExecution) {
          LoggingManager.LogDebugMessage_(`New value for key ${this.getCacheKey_(configRow[0])}: ${this.cache_.get(this.getCacheKey_(configRow[0]))}`);
        }
      }
    });
  }
  /**
   * Sanitizes configuration keys for CacheService (alphanumeric, underscores, and dashes only, under 250 characters).
   * @param {string} key - Raw key string
   * @returns {string} Sanitized key
   */
  static sanitizeCacheKey_(key) {
    if (typeof key !== 'string') {
      key = String(key);
    }
    return key.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase().substring(0, 240);
  }
  /**
   * Dynamically maps a row array to a key-value object using the headers list.
   * @param {string[]} headers - Sheet header columns
   * @param {any[]} row - Data row values
   * @returns {Object} Mapped object
   */
  static getRowDataAsObject_(headers, row) {
    const obj = {};
    headers.forEach((header, index) => {
      const headerStr = String(header).trim();
      if (headerStr !== '') {
        obj[headerStr] = row[index];
      }
    });
    return obj;
  }
  /**
   * Retrieves data from a specific sheet in the configuration workbook
   * @param {string} sheetName - Name of the sheet to load
   * @return {any[][]|null} Spreadsheet values, or null if sheet not found
   */
  static getSheetData_(sheetName) {
    const sheet = this.spreadsheet_.getSheetByName(sheetName);
    if (!sheet) {
      console.error(`Sheet '${sheetName}' not found in configuration workbook.`);
      return null;
    }
    return sheet.getDataRange().getValues();
  }
  /**
   * Retrieves an object configuration record from __ObjectConfiguration.
   * Caches the returned record as a JSON string under both its Object Name and Datasheet Name.
   * @param {string} queryValue - Object Name or Datasheet Name
   * @param {string} queryBy - 'objectName' or 'datasheetName'
   * @return {Object|null} The configuration record object, or null if not found
   */
  static getObjectConfiguration(queryValue, queryBy = 'objectName') {
    if (!queryValue) return null;
    const sanitizedVal = this.sanitizeCacheKey_(queryValue);
    const primaryKey = queryBy === 'objectName' ? `obj_${sanitizedVal}` : `obj_ds_${sanitizedVal}`;
    const cacheKey = this.getCacheKey_(primaryKey);
    
    const cachedValue = this.cache_.get(cacheKey);
    if (cachedValue !== null) {
      if (cachedValue === '___NULL___') {
        return null;
      }
      return JSON.parse(cachedValue);
    }
    
    const sheetName = AppUtilitiesGlobalProperties.objectConfigurationSheetName_;
    const data = this.getSheetData_(sheetName);
    if (!data || data.length < 2) {
      this.cache_.put(cacheKey, '___NULL___', 1500);
      return null;
    }
    
    const headers = data[0];
    const targetHeader = queryBy === 'objectName' ? 'Object Name' : 'Datasheet Name';
    let targetColIndex = headers.findIndex(h => String(h).trim().toLowerCase() === targetHeader.toLowerCase());
    if (targetColIndex === -1) {
      targetColIndex = queryBy === 'objectName' ? 0 : 1; // Fallback index
    }
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (String(row[targetColIndex]).trim() === String(queryValue).trim()) {
        const record = this.getRowDataAsObject_(headers, row);
        const jsonStr = JSON.stringify(record);
        
        // Cache under the queried key
        this.cache_.put(cacheKey, jsonStr, 1500);
        
        // Dual caching to pre-populate both name queries
        const objNameCol = headers.findIndex(h => String(h).trim().toLowerCase() === 'object name');
        const dsNameCol = headers.findIndex(h => String(h).trim().toLowerCase() === 'datasheet name');
        if (objNameCol !== -1 && dsNameCol !== -1) {
          const sObjKey = this.getCacheKey_(`obj_${this.sanitizeCacheKey_(row[objNameCol])}`);
          const sDsKey = this.getCacheKey_(`obj_ds_${this.sanitizeCacheKey_(row[dsNameCol])}`);
          this.cache_.put(sObjKey, jsonStr, 1500);
          this.cache_.put(sDsKey, jsonStr, 1500);
        }
        
        return record;
      }
    }
    
    this.cache_.put(cacheKey, '___NULL___', 1500);
    return null;
  }
  /**
   * Retrieves an array of lookup configuration objects from __LookupConfiguration matching a Source Object.
   * Caches the returned array as a JSON string.
   * @param {string} sourceObject - Source object name to query
   * @return {Object[]|null} Array of lookup configuration objects, or null if not found
   */
  static getLookupConfiguration(sourceObject) {
    if (!sourceObject) return null;
    const cacheKey = this.getCacheKey_(`lookup_${this.sanitizeCacheKey_(sourceObject)}`);
    
    const cachedValue = this.cache_.get(cacheKey);
    if (cachedValue !== null) {
      if (cachedValue === '___NULL___') {
        return null;
      }
      return JSON.parse(cachedValue);
    }
    
    const sheetName = AppUtilitiesGlobalProperties.lookupConfigurationSheetName_;
    const data = this.getSheetData_(sheetName);
    if (!data || data.length < 2) {
      this.cache_.put(cacheKey, '___NULL___', 1500);
      return null;
    }
    
    const headers = data[0];
    let sourceColIndex = headers.findIndex(h => String(h).trim().toLowerCase() === 'source object');
    if (sourceColIndex === -1) {
      sourceColIndex = 0; // Fallback index
    }
    
    const results = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (String(row[sourceColIndex]).trim() === String(sourceObject).trim()) {
        results.push(this.getRowDataAsObject_(headers, row));
      }
    }
    
    if (results.length > 0) {
      this.cache_.put(cacheKey, JSON.stringify(results), 1500);
      return results;
    }
    
    this.cache_.put(cacheKey, '___NULL___', 1500);
    return null;
  }
  /**
   * Retrieves a single configuration record from __DropdownConfiguration matching a Dropdown Name and Object Name.
   * Caches the returned record as a JSON string.
   * @param {string} dropdownName - Dropdown Name to query
   * @param {string} objectName - Associated Object Name to query
   * @return {Object|null} Dropdown configuration object, or null if not found
   */
  static getDropdownConfiguration(dropdownName, objectName) {
    if (!dropdownName || !objectName) return null;
    const key = `dropdown_${this.sanitizeCacheKey_(objectName)}_${this.sanitizeCacheKey_(dropdownName)}`;
    const cacheKey = this.getCacheKey_(key);
    
    const cachedValue = this.cache_.get(cacheKey);
    if (cachedValue !== null) {
      if (cachedValue === '___NULL___') {
        return null;
      }
      return JSON.parse(cachedValue);
    }
    
    const sheetName = AppUtilitiesGlobalProperties.dropdownConfigurationSheetName_;
    const data = this.getSheetData_(sheetName);
    if (!data || data.length < 2) {
      this.cache_.put(cacheKey, '___NULL___', 1500);
      return null;
    }
    
    const headers = data[0];
    let dropdownColIndex = headers.findIndex(h => String(h).trim().toLowerCase() === 'dropdown name');
    let objectColIndex = headers.findIndex(h => String(h).trim().toLowerCase() === 'object name');
    if (dropdownColIndex === -1) dropdownColIndex = 0; // Fallback index
    if (objectColIndex === -1) objectColIndex = 1; // Fallback index
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (String(row[dropdownColIndex]).trim() === String(dropdownName).trim() && 
          String(row[objectColIndex]).trim() === String(objectName).trim()) {
        const record = this.getRowDataAsObject_(headers, row);
        this.cache_.put(cacheKey, JSON.stringify(record), 1500);
        return record;
      }
    }
    
    this.cache_.put(cacheKey, '___NULL___', 1500);
    return null;
  }
  /**
   * Retrieves a single configuration record from __GlobalDropdownConfiguration matching a Global Dropdown Name.
   * Caches the returned record as a JSON string.
   * @param {string} globalDropdownName - Global Dropdown Name to query
   * @return {Object|null} Global Dropdown configuration object, or null if not found
   */
  static getGlobalDropdownConfiguration(globalDropdownName) {
    if (!globalDropdownName) return null;
    const cacheKey = this.getCacheKey_(`global_dropdown_${this.sanitizeCacheKey_(globalDropdownName)}`);
    
    const cachedValue = this.cache_.get(cacheKey);
    if (cachedValue !== null) {
      if (cachedValue === '___NULL___') {
        return null;
      }
      return JSON.parse(cachedValue);
    }
    
    const sheetName = AppUtilitiesGlobalProperties.globalDropdownConfigurationSheetName_;
    const data = this.getSheetData_(sheetName);
    if (!data || data.length < 2) {
      this.cache_.put(cacheKey, '___NULL___', 1500);
      return null;
    }
    
    const headers = data[0];
    let globalColIndex = headers.findIndex(h => String(h).trim().toLowerCase() === 'global dropdown name');
    if (globalColIndex === -1) {
      globalColIndex = 0; // Fallback index
    }
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (String(row[globalColIndex]).trim() === String(globalDropdownName).trim()) {
        const record = this.getRowDataAsObject_(headers, row);
        this.cache_.put(cacheKey, JSON.stringify(record), 1500);
        return record;
      }
    }
    
    this.cache_.put(cacheKey, '___NULL___', 1500);
    return null;
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
/**
 * Global API wrapper: Retrieves object configuration as a JSON string
 * @param {string} queryValue - Object Name or Datasheet Name
 * @param {string} queryBy - 'objectName' or 'datasheetName'
 * @return {string|null} The JSON string of the object configuration, or null if not found
 */
function configurationManager_GetObjectConfiguration(queryValue, queryBy = 'objectName') {
  const result = ConfigurationManager.getObjectConfiguration(queryValue, queryBy);
  return result ? JSON.stringify(result) : null;
}
/**
 * Global API wrapper: Retrieves lookup configurations for a source object as a JSON string
 * @param {string} sourceObject - Source object name
 * @return {string|null} The JSON string of the array of lookup configurations, or null if not found
 */
function configurationManager_GetLookupConfiguration(sourceObject) {
  const result = ConfigurationManager.getLookupConfiguration(sourceObject);
  return result ? JSON.stringify(result) : null;
}
/**
 * Global API wrapper: Retrieves dropdown configuration as a JSON string
 * @param {string} dropdownName - Dropdown Name
 * @param {string} objectName - Object Name
 * @return {string|null} The JSON string of the dropdown configuration, or null if not found
 */
function configurationManager_GetDropdownConfiguration(dropdownName, objectName) {
  const result = ConfigurationManager.getDropdownConfiguration(dropdownName, objectName);
  return result ? JSON.stringify(result) : null;
}
/**
 * Global API wrapper: Retrieves global dropdown configuration as a JSON string
 * @param {string} globalDropdownName - Global Dropdown Name
 * @return {string|null} The JSON string of the global dropdown configuration, or null if not found
 */
function configurationManager_GetGlobalDropdownConfiguration(globalDropdownName) {
  const result = ConfigurationManager.getGlobalDropdownConfiguration(globalDropdownName);
  return result ? JSON.stringify(result) : null;
}