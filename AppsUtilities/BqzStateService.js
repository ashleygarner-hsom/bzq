/**
 * Unified state and cache management service for the BZQ Platform.
 * Provides secure, isolated, document-scoped persistence and caching.
 */
class BqzStateService {
  /**
   * Gets a document-scoped persistent property.
   * @param {string} key - Property key.
   * @returns {string|null} Resolved value.
   */
  static getDocumentProperty(key) {
    return PropertiesService.getDocumentProperties().getProperty(key);
  }

  /**
   * Sets a document-scoped persistent property.
   * @param {string} key - Property key.
   * @param {string} value - Property value.
   */
  static setDocumentProperty(key, value) {
    PropertiesService.getDocumentProperties().setProperty(key, value);
  }

  /**
   * Gets a document-scoped transient cache value.
   * @param {string} key - Cache key.
   * @returns {string|null} Cached value.
   */
  static getDocumentCache(key) {
    return CacheService.getDocumentCache().get(key);
  }

  /**
   * Puts a document-scoped transient cache value.
   * @param {string} key - Cache key.
   * @param {string} value - Value to cache.
   * @param {number} expirationInSeconds - Cache duration in seconds.
   */
  static putDocumentCache(key, value, expirationInSeconds) {
    CacheService.getDocumentCache().put(key, value, expirationInSeconds);
  }

  /**
   * Resolves a workbook ID dynamically and caches it, preventing expensive DriveApp calls.
   * @param {string} cacheKey - Unique key name for caching (e.g. "BZQ_CONFIG_SS_ID").
   * @param {string} searchName - Exact Drive file name to search if not cached.
   * @returns {string} The resolved spreadsheet ID.
   */
  static resolveAndCacheWorkbookId(cacheKey, searchName) {
    const cachedId = BqzStateService.getDocumentCache(cacheKey) || 
                     BqzStateService.getDocumentProperty(cacheKey);
    if (cachedId) return cachedId;

    const resolvedId = BqzStateService.searchDriveForFile_(searchName);
    BqzStateService.saveWorkbookIdToCacheAndProperties_(cacheKey, resolvedId);
    return resolvedId;
  }

  /**
   * Helper to query DriveApp for a file by name. Constraint search to parent folder if available.
   * @param {string} searchName - File name to find.
   * @returns {string} Resolved Google file ID.
   * @private
   */
  static searchDriveForFile_(searchName) {
    try {
      const parentId = typeof BZQ_PARENT_FOLDER_ID !== "undefined" ? BZQ_PARENT_FOLDER_ID : null;
      const files = parentId ? 
        DriveApp.getFolderById(parentId).getFilesByName(searchName) : 
        DriveApp.getFilesByName(searchName);
      if (files.hasNext()) {
        return files.next().getId();
      }
    } catch (e) {
      throw new Error(`Error searching Drive for "${searchName}": ${e.message}`);
    }
    throw new Error(`Workbook file "${searchName}" was not found on Google Drive.`);
  }

  /**
   * Helper to write a resolved ID to the Document cache and properties.
   * @param {string} cacheKey - Target storage key.
   * @param {string} id - Google file ID.
   * @private
   */
  static saveWorkbookIdToCacheAndProperties_(cacheKey, id) {
    try {
      BqzStateService.setDocumentProperty(cacheKey, id);
      BqzStateService.putDocumentCache(cacheKey, id, 1500);
    } catch (e) {
      // Non-blocking cache write failure
    }
  }
}
