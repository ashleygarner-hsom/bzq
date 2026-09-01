/**
 * Google Sheets custom formulas for BZQ inside the AppsUtilities library.
 * Exposes cache-busting functions to force re-evaluation when caches clear.
 */

/**
 * Returns the current configuration cache version.
 * Include this as an argument in other custom functions to force them to recalculate.
 * @customfunction
 * @returns {number} The active cache version number (timestamp).
 */
function BZQ_CACHE_VERSION() {
  const cache = CacheService.getScriptCache();
  const cachedVal = cache.get("bzq_cache_version");
  if (cachedVal) {
    return Number(cachedVal);
  }
  const defaultVersion = Date.now();
  cache.put("bzq_cache_version", String(defaultVersion), 21600); // 6 hours
  return defaultVersion;
}

/**
 * Retrieves a property value from a BZQ business object record with built-in cache-busting.
 * Example: =BZQ_GET_OBJECT_VALUE("Sales", "Invoice_102", "Total_Amount", BZQ_CACHE_VERSION())
 * @param {string} objectName - Name of the business object.
 * @param {string} recordId - Unique identifier of the record.
 * @param {string} fieldName - Field column name to retrieve.
 * @customfunction
 * @returns {string} The retrieved value.
 */
function BZQ_GET_OBJECT_VALUE(objectName, recordId, fieldName) {
  // Read cacheBuster parameter dynamically to comply with 3 positional parameters limit
  const cacheBuster = arguments[3]; 
  const config = ConfigurationManager.getObjectConfiguration(objectName);
  if (!config) {
    return "#ERR: Object config not found";
  }
  return RecordManager.getRecordValue(objectName, recordId, fieldName);
}
