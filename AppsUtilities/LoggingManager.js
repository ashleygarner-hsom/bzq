/**
 * Central class to manage logging functionality across all business applications.
 * Handles debug message filtering based on Configuration settings and standard error output.
 */
class LoggingManager {
  /**
   * Logs a message to the execution console if debug mode is active.
   * Debug mode is determined by the "DEBUG_MODE" configuration property.
   * Falls back to plain logging if configurations cannot be read.
   * @param {string} message - The debug message string to log.
   * @returns {void}
   */
  static LogDebugMessage_(message){
    let debugMode = false;
    try {
      const configVal = ConfigurationManager.getConfigValue("DEBUG_MODE", false);
      debugMode = (configVal && String(configVal).toUpperCase() === 'TRUE');
    } catch (e) {
      // Fallback for restricted contexts (e.g. simple triggers, custom functions)
      console.log("[Debug] " + message);
      return;
    }
    if (debugMode) {
      console.log(message);
    }
    return;
  }
  /**
   * Logs an error message to the execution console.
   * @param {string} message - The error message string to log.
   * @returns {void}
   */
  static LogError_(message) {
    console.error(message);
  }
}
/**
 * Wrapper calls the debug logger of the Logging Manager.
 * @param {string} message - The message string to log.
 * @returns {void}
 */
function loggingManager_LogDebugMessage(message) {
  LoggingManager.LogDebugMessage_(message);
}
/**
 * Wrapper calls the error logger of the Logging Manager.
 * @param {string} message - The error message string to log.
 * @returns {void}
 */
function loggingManager_LogError(message) {
  LoggingManager.LogError_(message);
}
