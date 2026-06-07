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
    const data = this.getSheetData_(configPropertySheetName);
    if (!data && logExecution) {
      LoggingManager.LogError_(`Sheet '${configPropertySheetName}' not found.`);
    }
    return data;
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
    const cacheKey = this.getCacheKey_(key);
    const cached = this.getCachedValue_(cacheKey, false);
    if (cached !== undefined) {
      return cached;
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
        this.cache_.put(cacheKey, value, 1500);
        return value;
      }
    }
    // Negative caching: Cache the missing key to avoid repeated sheet reads
    this.cache_.put(cacheKey, '___NULL___', 1500);
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
   * Retrieves data from a specific sheet in the configuration workbook
   * @param {string} sheetName - Name of the sheet to load
   * @return {any[][]|null} Spreadsheet values, or null if sheet not found
   */
  static getSheetData_(sheetName) {
    const sheet = this.spreadsheet_.getSheetByName(sheetName);
    if (!sheet) {
      LoggingManager.LogError_(`Sheet '${sheetName}' not found in configuration workbook.`);
      return null;
    }
    return sheet.getDataRange().getValues();
  }
  /**
   * Helper: Retrieves a cached value, optionally parsing it as JSON, and handling the negative cache sentinel '___NULL___'.
   * @param {string} cacheKey - The cache key to query
   * @param {boolean} parseJson - Whether to parse the cached value as JSON (defaults to true)
   * @returns {any|null|undefined} Retrieved value, null if cached as missing, or undefined if not in cache
   */
  static getCachedValue_(cacheKey, parseJson = true) {
    const cachedValue = this.cache_.get(cacheKey);
    if (cachedValue !== null) {
      if (cachedValue === '___NULL___') {
        return null;
      }
      return parseJson ? JSON.parse(cachedValue) : cachedValue;
    }
    return undefined;
  }
  /**
   * Helper: Retrieves data from a sheet and caches an empty indicator if missing/empty.
   * @param {string} sheetName - Name of the sheet to load
   * @param {string} cacheKey - The cache key to update on failure
   * @returns {any[][]|null} Spreadsheet values, or null if sheet not found/empty
   */
  static getSheetDataAndValidate_(sheetName, cacheKey) {
    const data = this.getSheetData_(sheetName);
    if (!data || data.length < 2) {
      this.cache_.put(cacheKey, '___NULL___', 1500);
      return null;
    }
    return data;
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
    let primaryKey;
    if (queryBy === 'object') {
      primaryKey = `obj_full_${sanitizedVal}`;
    } else if (queryBy === 'datasheetName') {
      primaryKey = `obj_ds_${sanitizedVal}`;
    } else {
      primaryKey = `obj_${sanitizedVal}`;
    }
    const cacheKey = this.getCacheKey_(primaryKey);
    
    const cached = this.getCachedValue_(cacheKey);
    if (cached !== undefined) return cached;
    
    const sheetName = AppUtilitiesGlobalProperties.objectConfigurationSheetName_;
    const data = this.getSheetDataAndValidate_(sheetName, cacheKey);
    if (!data) return null;
    
    const headers = data[0];
    let targetHeader = 'Object Name';
    if (queryBy === 'object') {
      targetHeader = 'Object';
    } else if (queryBy === 'datasheetName') {
      targetHeader = 'Datasheet';
    }
    let targetColIndex = headers.findIndex(h => String(h).trim().toLowerCase() === targetHeader.toLowerCase());
    if (targetColIndex === -1) {
      if (queryBy === 'object') targetColIndex = 0;
      else if (queryBy === 'datasheetName') targetColIndex = 3;
      else targetColIndex = 2; // Default to Object Name
    }
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (String(row[targetColIndex]).trim() === String(queryValue).trim()) {
        const record = GlobalUtilities.getRowDataAsObject(headers, row);
        const jsonStr = JSON.stringify(record);
        
        // Cache under the queried key
        this.cache_.put(cacheKey, jsonStr, 1500);
        
        // Multiple caching to pre-populate all name queries
        const objCol = headers.findIndex(h => String(h).trim().toLowerCase() === 'object');
        const objNameCol = headers.findIndex(h => String(h).trim().toLowerCase() === 'object name');
        const dsCol = headers.findIndex(h => String(h).trim().toLowerCase() === 'datasheet');
        
        if (objCol !== -1) {
          const sObjFullKey = this.getCacheKey_(`obj_full_${this.sanitizeCacheKey_(row[objCol])}`);
          this.cache_.put(sObjFullKey, jsonStr, 1500);
        }
        if (objNameCol !== -1) {
          const sObjKey = this.getCacheKey_(`obj_${this.sanitizeCacheKey_(row[objNameCol])}`);
          this.cache_.put(sObjKey, jsonStr, 1500);
        }
        if (dsCol !== -1) {
          const sDsKey = this.getCacheKey_(`obj_ds_${this.sanitizeCacheKey_(row[dsCol])}`);
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
    
    const cached = this.getCachedValue_(cacheKey);
    if (cached !== undefined) return cached;
    
    const sheetName = AppUtilitiesGlobalProperties.lookupConfigurationSheetName_;
    const data = this.getSheetDataAndValidate_(sheetName, cacheKey);
    if (!data) return null;
    
    const headers = data[0];
    let sourceColIndex = headers.findIndex(h => String(h).trim().toLowerCase() === 'source object');
    if (sourceColIndex === -1) {
      sourceColIndex = 0; // Fallback index
    }
    
    const results = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (String(row[sourceColIndex]).trim() === String(sourceObject).trim()) {
        results.push(GlobalUtilities.getRowDataAsObject(headers, row));
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
    
    const cached = this.getCachedValue_(cacheKey);
    if (cached !== undefined) return cached;
    
    const sheetName = AppUtilitiesGlobalProperties.dropdownConfigurationSheetName_;
    const data = this.getSheetDataAndValidate_(sheetName, cacheKey);
    if (!data) return null;
    
    const headers = data[0];
    let dropdownColIndex = headers.findIndex(h => String(h).trim().toLowerCase() === 'dropdown name');
    let objectColIndex = headers.findIndex(h => {
      const s = String(h).trim().toLowerCase();
      return s === 'object' || s === 'object name';
    });
    if (dropdownColIndex === -1) dropdownColIndex = 2; // Fallback index
    if (objectColIndex === -1) objectColIndex = 3; // Fallback index
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (String(row[dropdownColIndex]).trim() === String(dropdownName).trim() && 
          String(row[objectColIndex]).trim() === String(objectName).trim()) {
        const record = GlobalUtilities.getRowDataAsObject(headers, row);
        this.cache_.put(cacheKey, JSON.stringify(record), 1500);
        return record;
      }
    }
    
    this.cache_.put(cacheKey, '___NULL___', 1500);
    return null;
  }
  /**
   * Retrieves an array of dropdown configuration objects from __DropdownConfiguration matching an Object.
   * Caches the returned array as a JSON string.
   * @param {string} objectName - Object name (full object string) to query
   * @return {Object[]|null} Array of dropdown configuration objects, or null if not found
   */
  static getDropdownConfigurations(objectName) {
    if (!objectName) return null;
    const cacheKey = this.getCacheKey_(`dropdowns_${this.sanitizeCacheKey_(objectName)}`);
    
    const cached = this.getCachedValue_(cacheKey);
    if (cached !== undefined) return cached;
    
    const sheetName = AppUtilitiesGlobalProperties.dropdownConfigurationSheetName_;
    const data = this.getSheetDataAndValidate_(sheetName, cacheKey);
    if (!data) return null;
    
    const headers = data[0];
    let objectColIndex = headers.findIndex(h => {
      const s = String(h).trim().toLowerCase();
      return s === 'object' || s === 'object name';
    });
    if (objectColIndex === -1) objectColIndex = 3; // Fallback index
    
    const results = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (String(row[objectColIndex]).trim() === String(objectName).trim()) {
        results.push(GlobalUtilities.getRowDataAsObject(headers, row));
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
   * Retrieves a single configuration record from __GlobalDropdownConfiguration matching a Global Dropdown Name.
   * Caches the returned record as a JSON string.
   * @param {string} globalDropdownName - Global Dropdown Name to query
   * @return {Object|null} Global Dropdown configuration object, or null if not found
   */
  static getGlobalDropdownConfiguration(globalDropdownName) {
    if (!globalDropdownName) return null;
    const cacheKey = this.getCacheKey_(`global_dropdown_${this.sanitizeCacheKey_(globalDropdownName)}`);
    
    const cached = this.getCachedValue_(cacheKey);
    if (cached !== undefined) return cached;
    
    const sheetName = AppUtilitiesGlobalProperties.globalDropdownConfigurationSheetName_;
    const data = this.getSheetDataAndValidate_(sheetName, cacheKey);
    if (!data) return null;
    
    const headers = data[0];
    let globalColIndex = headers.findIndex(h => String(h).trim().toLowerCase() === 'global dropdown name');
    if (globalColIndex === -1) {
      globalColIndex = 2; // Fallback index
    }
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (String(row[globalColIndex]).trim() === String(globalDropdownName).trim()) {
        const record = GlobalUtilities.getRowDataAsObject(headers, row);
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
 * Global API wrapper: Retrieves dropdown configurations for an object as a JSON string
 * @param {string} objectName - Object Name
 * @return {string|null} The JSON string of the array of dropdown configurations, or null if not found
 */
function configurationManager_GetDropdownConfigurations(objectName) {
  const result = ConfigurationManager.getDropdownConfigurations(objectName);
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