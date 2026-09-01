/**
 * Holds global configuration property keys, sheet names, and workbook IDs for the AppUtilities library.
 */
class AppUtilitiesGlobalProperties {
  /**
   * Static reference to the Configuration Properties workbook ID.
   * Used when opening the settings database workbook.
   * @type {string}
   * @private
   */
  static get configurationPropertiesWorkbookId_(){
    const env = typeof BZQ_ENV !== "undefined" ? BZQ_ENV : null;
    const suffix = (env && env !== "PROD") ? " " + env : "";
    const searchName = "BZQ Core Configuration" + suffix;
    return BqzStateService.resolveAndCacheWorkbookId("BZQ_CONFIG_SS_ID", searchName);
  }
  /**
   * Static reference to the Configuration Properties sheet name.
   * @type {string}
   * @private
   */
  static get configurationPropertiesSheetName_(){
    return "ConfigurationProperties";
  }
  /**
   * Static reference to the Sequence Configuration sheet name.
   * @type {string}
   * @private
   */
  static get sequenceConfigurationSheetName_(){
    return "SequenceConfiguration";
  }
  /**
   * Static reference to the Object Configuration sheet name.
   * @type {string}
   * @private
   */
  static get objectConfigurationSheetName_(){
    return "ObjectConfiguration";
  }
  /**
   * Static reference to the Lookup Configuration sheet name.
   * @type {string}
   * @private
   */
  static get lookupConfigurationSheetName_(){
    return "LookupConfiguration";
  }
  /**
   * Static reference to the Dropdown Configuration sheet name.
   * @type {string}
   * @private
   */
  static get dropdownConfigurationSheetName_(){
    return "DropdownConfiguration";
  }
  /**
   * Static reference to the Global Dropdown Configuration sheet name.
   * @type {string}
   * @private
   */
  static get globalDropdownConfigurationSheetName_(){
    return "GlobalDropdownConfiguration";
  }
}

