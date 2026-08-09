/**
 * Contains tools for retrieving, managing, and caching configuration keys and their values.
 */
class ConfigurationManager {
  /**
   * Reference to the configuration properties spreadsheet.
   * Opened using the workbook ID stored in AppUtilitiesGlobalProperties.
   * @type {SpreadsheetApp.Spreadsheet}
   * @private
   */
  static get spreadsheet_() {
    const workbookId = AppUtilitiesGlobalProperties.configurationPropertiesWorkbookId_;
    try {
      return SpreadsheetApp.openById(workbookId);
    } catch (e) {
      throw new Error("Insufficient permissions to open configuration workbook. Please select 'ManageBusiness' -> 'Admin' -> 'Reset Configuration Cache' to warm up the configuration cache.");
    }
  }

  /**
   * Reference to the Google Sheets script cache.
   * @type {CacheService.Cache}
   * @private
   */
  static get cache_() {
    return CacheService.getScriptCache();
  }

  /**
   * The prefix used by Configuration Manager to designate configuration cached keys and values.
   * @type {string}
   * @private
   */
  static get keyPrefix_() {
    return 'config_';
  }

  /**
   * Adds keyPrefix_ to the key being retrieved from the cache.
   * @param {string} key - The configuration key as it appears in the Configuration Properties sheet.
   * @returns {string} The concatenated key for use retrieving from the Script Cache.
   * @private
   */
  static getCacheKey_(key) {
    return this.keyPrefix_ + key;
  }

  /**
   * Returns the key and values data from the configuration properties sheet.
   * @param {boolean} [logExecution=true] - Set to false to disable logging the current execution.
   * @returns {Array<Array<*>>|null} The two dimensional array containing the retrieved configuration properties, or null if sheet not found.
   * @private
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
   * @param {string} key - The configuration key to search for.
   * @param {boolean} [logExecution=true] - Set to false to disable logging the current execution.
   * @returns {string|null} The value from the cache or sheet, or null if not found.
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
    // Start at row 1 to skip headers, scan each row's first value and return the second if the key matches
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
   * Retrieves all configuration keys and values, logs the current cached value, removes it, and adds the current value and logs the new value.
   * Use to update the configuration cache to hold the current values in the sheet.
   * @param {boolean} [logExecution=true] - Set to false to disable logging the current execution.
   * @returns {void}
   */
  static updateCachedConfigValues(logExecution = true) {
    const data = this.getConfigurationPropertiesData_(logExecution);
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
   * @param {string} key - Raw key string.
   * @returns {string} Sanitized key.
   * @private
   */
  static sanitizeCacheKey_(key) {
    if (typeof key !== 'string') {
      key = String(key);
    }
    return key.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase().substring(0, 240);
  }

  /**
   * Retrieves data from a specific sheet in the configuration workbook.
   * @param {string} sheetName - Name of the sheet to load.
   * @returns {Array<Array<*>>|null} Spreadsheet values, or null if sheet not found.
   * @private
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
   * @param {string} cacheKey - The cache key to query.
   * @param {boolean} [parseJson=true] - Whether to parse the cached value as JSON.
   * @returns {any|null|undefined} Retrieved value, null if cached as missing, or undefined if not in cache.
   * @private
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
   * @param {string} sheetName - Name of the sheet to load.
   * @param {string} cacheKey - The cache key to update on failure.
   * @returns {Array<Array<*>>|null} Spreadsheet values, or null if sheet not found/empty.
   * @private
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
   * Retrieves an object configuration record from ObjectConfiguration.
   * Caches the returned record as a JSON string under both its Object Name and Datasheet Name.
   * @param {string} queryValue - Object Name or Datasheet Name.
   * @param {string} [queryBy='objectName'] - 'objectName', 'object', or 'datasheetName'.
   * @returns {Object|null} The configuration record object, or null if not found.
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
   * Retrieves an array of lookup configuration objects from LookupConfiguration matching a Source Object.
   * Caches the returned array as a JSON string.
   * @param {string} sourceObject - Source object name to query.
   * @returns {Object[]|null} Array of lookup configuration objects, or null if not found.
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
   * Retrieves a single configuration record from DropdownConfiguration matching a Dropdown Name and Object Name.
   * Caches the returned record as a JSON string.
   * @param {string} dropdownName - Dropdown Name to query.
   * @param {string} objectName - Associated Object Name to query.
   * @returns {Object|null} Dropdown configuration object, or null if not found.
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
   * Retrieves an array of dropdown configuration objects from DropdownConfiguration matching an Object.
   * Caches the returned array as a JSON string.
   * @param {string} objectName - Object name (full object string) to query.
   * @returns {Object[]|null} Array of dropdown configuration objects, or null if not found.
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
   * Retrieves a single configuration record from GlobalDropdownConfiguration matching a Global Dropdown Name.
   * Caches the returned record as a JSON string.
   * @param {string} globalDropdownName - Global Dropdown Name to query.
   * @returns {Object|null} Global Dropdown configuration object, or null if not found.
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
  
  /**
   * Updates or inserts a configuration property value in the Configuration Properties sheet, and updates cache.
   * @param {string} key - The configuration key.
   * @param {string} value - The configuration value.
   * @returns {void}
   */
  static setConfigValue(key, value) {
    const configPropertySheetName = AppUtilitiesGlobalProperties.configurationPropertiesSheetName_;
    const sheet = this.spreadsheet_.getSheetByName(configPropertySheetName);
    if (!sheet) {
      throw new Error(`Sheet '${configPropertySheetName}' not found in configuration workbook.`);
    }
    
    const data = sheet.getDataRange().getValues();
    let rowFound = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === key) {
        rowFound = i + 1; // 1-based index
        break;
      }
    }
    
    if (rowFound !== -1) {
      sheet.getRange(rowFound, 2).setValue(value);
    } else {
      sheet.appendRow([key, value]);
    }
    
    // Update script cache
    const cacheKey = this.getCacheKey_(key);
    this.cache_.put(cacheKey, String(value), 1500);
  }

  /**
   * Updates cached object configurations from the ObjectConfiguration sheet.
   * @returns {void}
   */
  static updateCachedObjectConfigurations() {
    const sheetName = AppUtilitiesGlobalProperties.objectConfigurationSheetName_;
    const data = this.getSheetData_(sheetName);
    if (!data || data.length < 2) return;
    
    const headers = data[0];
    const objCol = headers.findIndex(h => String(h).trim().toLowerCase() === 'object');
    const objNameCol = headers.findIndex(h => String(h).trim().toLowerCase() === 'object name');
    const dsCol = headers.findIndex(h => String(h).trim().toLowerCase() === 'datasheet');
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const record = GlobalUtilities.getRowDataAsObject(headers, row);
      const jsonStr = JSON.stringify(record);
      
      if (objCol !== -1 && row[objCol]) {
        const key = this.getCacheKey_(`obj_full_${this.sanitizeCacheKey_(row[objCol])}`);
        this.cache_.put(key, jsonStr, 1500);
      }
      if (objNameCol !== -1 && row[objNameCol]) {
        const key = this.getCacheKey_(`obj_${this.sanitizeCacheKey_(row[objNameCol])}`);
        this.cache_.put(key, jsonStr, 1500);
      }
      if (dsCol !== -1 && row[dsCol]) {
        const key = this.getCacheKey_(`obj_ds_${this.sanitizeCacheKey_(row[dsCol])}`);
        this.cache_.put(key, jsonStr, 1500);
      }
    }
  }

  /**
   * Updates cached lookup configurations from the LookupConfiguration sheet.
   * @returns {void}
   */
  static updateCachedLookupConfigurations() {
    const sheetName = AppUtilitiesGlobalProperties.lookupConfigurationSheetName_;
    const data = this.getSheetData_(sheetName);
    if (!data || data.length < 2) return;
    
    const headers = data[0];
    let sourceColIndex = headers.findIndex(h => String(h).trim().toLowerCase() === 'source object');
    if (sourceColIndex === -1) sourceColIndex = 0;
    
    const lookupGroups = {};
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const sourceObj = String(row[sourceColIndex]).trim();
      if (!sourceObj) continue;
      
      if (!lookupGroups[sourceObj]) {
        lookupGroups[sourceObj] = [];
      }
      lookupGroups[sourceObj].push(GlobalUtilities.getRowDataAsObject(headers, row));
    }
    
    // Clear and put new cache entries
    for (const sourceObj in lookupGroups) {
      const cacheKey = this.getCacheKey_(`lookup_${this.sanitizeCacheKey_(sourceObj)}`);
      this.cache_.put(cacheKey, JSON.stringify(lookupGroups[sourceObj]), 1500);
    }
  }

  /**
   * Updates cached dropdown configurations from the DropdownConfiguration sheet.
   * @returns {void}
   */
  static updateCachedDropdownConfigurations() {
    const sheetName = AppUtilitiesGlobalProperties.dropdownConfigurationSheetName_;
    const data = this.getSheetData_(sheetName);
    if (!data || data.length < 2) return;
    
    const headers = data[0];
    let dropdownColIndex = headers.findIndex(h => String(h).trim().toLowerCase() === 'dropdown name');
    let objectColIndex = headers.findIndex(h => {
      const s = String(h).trim().toLowerCase();
      return s === 'object' || s === 'object name';
    });
    if (dropdownColIndex === -1) dropdownColIndex = 2;
    if (objectColIndex === -1) objectColIndex = 3;
    
    const dropdownGroups = {};
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const dropdownName = String(row[dropdownColIndex]).trim();
      const objectName = String(row[objectColIndex]).trim();
      if (!dropdownName || !objectName) continue;
      
      const record = GlobalUtilities.getRowDataAsObject(headers, row);
      const singleKey = this.getCacheKey_(`dropdown_${this.sanitizeCacheKey_(objectName)}_${this.sanitizeCacheKey_(dropdownName)}`);
      this.cache_.put(singleKey, JSON.stringify(record), 1500);
      
      if (!dropdownGroups[objectName]) {
        dropdownGroups[objectName] = [];
      }
      dropdownGroups[objectName].push(record);
    }
    
    for (const objectName in dropdownGroups) {
      const cacheKey = this.getCacheKey_(`dropdowns_${this.sanitizeCacheKey_(objectName)}`);
      this.cache_.put(cacheKey, JSON.stringify(dropdownGroups[objectName]), 1500);
    }
  }

  /**
   * Updates cached global dropdown configurations from the GlobalDropdownConfiguration sheet.
   * @returns {void}
   */
  static updateCachedGlobalDropdownConfigurations() {
    const sheetName = AppUtilitiesGlobalProperties.globalDropdownConfigurationSheetName_;
    const data = this.getSheetData_(sheetName);
    if (!data || data.length < 2) return;
    
    const headers = data[0];
    let globalColIndex = headers.findIndex(h => String(h).trim().toLowerCase() === 'global dropdown name');
    if (globalColIndex === -1) globalColIndex = 2;
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const globalDropdownName = String(row[globalColIndex]).trim();
      if (!globalDropdownName) continue;
      
      const record = GlobalUtilities.getRowDataAsObject(headers, row);
      const cacheKey = this.getCacheKey_(`global_dropdown_${this.sanitizeCacheKey_(globalDropdownName)}`);
      this.cache_.put(cacheKey, JSON.stringify(record), 1500);
    }
  }

  /**
   * Cycles through all configuration worksheets and resets/updates all cached configurations.
   * @returns {void}
   */
  static resetAllCacheValues() {
    // 1. Reset configuration properties
    this.updateCachedConfigValues(false);
    
    // 2. Reset object configurations
    this.updateCachedObjectConfigurations();
    
    // 3. Reset lookup configurations
    this.updateCachedLookupConfigurations();
    
    // 4. Reset dropdown configurations
    this.updateCachedDropdownConfigurations();
    
    // 5. Reset global dropdown configurations
    this.updateCachedGlobalDropdownConfigurations();
  }
}

/**
 * Global API wrapper: Resets/updates all cached configurations.
 * @returns {void}
 */
function configurationManager_ResetAllCacheValues() {
  ConfigurationManager.resetAllCacheValues();
}

/**
 * Global API wrapper: Sets a configuration property value.
 * @param {string} key - The configuration key.
 * @param {string} value - The configuration value.
 * @returns {void}
 */
function configurationManager_SetConfigValue(key, value) {
  ConfigurationManager.setConfigValue(key, value);
}

/**
 * Retrieves all configuration keys and values, logs the current cached value, removes it, and adds the current value and logs the new value.
 * Use to update the configuration cache to hold the current values in the sheet.
 * @param {boolean} [logExecution=true] - Set to false to disable logging the current execution.
 * @returns {void}
 */
function configurationManager_UpdateCachedConfigValues(logExecution = true) {
  ConfigurationManager.updateCachedConfigValues(logExecution);
}

/**
 * Efficiently retrieves a configuration value with caching.
 * @param {string} key - The configuration key to search for.
 * @param {boolean} [logExecution=true] - Set to false to disable logging the current execution.
 * @returns {string|null} The value from the cache or sheet, or null if not found.
 */
function configurationManager_GetConfigValue(key, logExecution = true) {
  return ConfigurationManager.getConfigValue(key, logExecution);
}

/**
 * Global API wrapper: Retrieves object configuration as a JSON string.
 * @param {string} queryValue - Object Name or Datasheet Name.
 * @param {string} [queryBy='objectName'] - 'objectName', 'object', or 'datasheetName'.
 * @returns {string|null} The JSON string of the object configuration, or null if not found.
 */
function configurationManager_GetObjectConfiguration(queryValue, queryBy = 'objectName') {
  const result = ConfigurationManager.getObjectConfiguration(queryValue, queryBy);
  return result ? JSON.stringify(result) : null;
}

/**
 * Global API wrapper: Retrieves lookup configurations for a source object as a JSON string.
 * @param {string} sourceObject - Source object name.
 * @returns {string|null} The JSON string of the array of lookup configurations, or null if not found.
 */
function configurationManager_GetLookupConfiguration(sourceObject) {
  const result = ConfigurationManager.getLookupConfiguration(sourceObject);
  return result ? JSON.stringify(result) : null;
}

/**
 * Global API wrapper: Retrieves dropdown configuration as a JSON string.
 * @param {string} dropdownName - Dropdown Name.
 * @param {string} objectName - Object Name.
 * @returns {string|null} The JSON string of the dropdown configuration, or null if not found.
 */
function configurationManager_GetDropdownConfiguration(dropdownName, objectName) {
  const result = ConfigurationManager.getDropdownConfiguration(dropdownName, objectName);
  return result ? JSON.stringify(result) : null;
}

/**
 * Global API wrapper: Retrieves dropdown configurations for an object as a JSON string.
 * @param {string} objectName - Object Name.
 * @returns {string|null} The JSON string of the array of dropdown configurations, or null if not found.
 */
function configurationManager_GetDropdownConfigurations(objectName) {
  const result = ConfigurationManager.getDropdownConfigurations(objectName);
  return result ? JSON.stringify(result) : null;
}

/**
 * Global API wrapper: Retrieves global dropdown configuration as a JSON string.
 * @param {string} globalDropdownName - Global Dropdown Name.
 * @returns {string|null} The JSON string of the global dropdown configuration, or null if not found.
 */
function configurationManager_GetGlobalDropdownConfiguration(globalDropdownName) {
  const result = ConfigurationManager.getGlobalDropdownConfiguration(globalDropdownName);
  return result ? JSON.stringify(result) : null;
}