/**
 * Central class to manage logging functionality across all business applications
 */
class LoggingManager {
  /**
   * Logging to use during debugging.  Is turned on or off with the config value of DEBUG_MODE, with true meaning debug mode is on
   * @param {string} messaage - The string to log to the execution console
   */
  static LogDebugMessage_(message){
    const debugMode = ConfigurationManager.getConfigValue("DEBUG_MODE", false);
    if (!debugMode) {
      return;
    }
    console.log(message);
    return;
  }
}
/**
 * Wrapper calls the debug logger if the Logging Manager
 * @param {string} message - The message to log to the execution console
 */
function loggingManager_LogDebugMessage(message) {
  LoggingManager.LogDebugMessage_(message);
}
