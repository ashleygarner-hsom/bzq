/**
 * Returns the stable-ID mapped seed configuration records for AppsUtilities.
 */
function getSeedData_AppsUtilities() {
  return {
    "1000": [ // SequenceConfiguration
      {
        "Sequence Name": "Sequence",
        "Datasheet Name": "SequenceConfiguration",
        "Sequence Prefix": "xSC-",
        "Starting Number": 10000,
        "Format": "0000#",
        "Current Value": 10000,
        "Enabled": true
      },
      {
        "Sequence Name": "Objects",
        "Datasheet Name": "ObjectConfiguration",
        "Sequence Prefix": "xOC-",
        "Starting Number": 1000,
        "Format": "000#",
        "Current Value": 1000,
        "Enabled": true
      },
      {
        "Sequence Name": "Object Relations",
        "Datasheet Name": "LookupConfiguration",
        "Sequence Prefix": "xLC-",
        "Starting Number": 10000,
        "Format": "0000#",
        "Current Value": 10000,
        "Enabled": true
      },
      {
        "Sequence Name": "Static Dropdowns",
        "Datasheet Name": "DropdownConfiguration",
        "Sequence Prefix": "xDC-",
        "Starting Number": 10000,
        "Format": "0000#",
        "Current Value": 10000,
        "Enabled": true
      },
      {
        "Sequence Name": "Global Dropdowns",
        "Datasheet Name": "GlobalDropdownConfiguration",
        "Sequence Prefix": "xGD-",
        "Starting Number": 10000,
        "Format": "0000#",
        "Current Value": 10000,
        "Enabled": true
      },
      {
        "Sequence Name": "Spreadsheets",
        "Datasheet Name": "Spreadsheets",
        "Sequence Prefix": "xSS-",
        "Starting Number": 1000,
        "Format": "000#",
        "Current Value": 1000,
        "Enabled": true
      }
    ],
    "1001": [ // ObjectConfiguration
      {
        "Object Name": "Sequence",
        "Datasheet": "SequenceConfiguration",
        "Enabled For Validation": true,
        "Spreadsheet": "AppsUtilities.1005.1",
        "Spreadsheet Id": "${CONFIG_SS_ID}",
        "Primary Fields": "Sequence Name",
        "Id Field Name": "Sequence Number",
        "Header Number": 1,
        "Sequence": "AppsUtilities.1000.1",
        "Custom Line Trigger": ""
      },
      {
        "Object Name": "Object",
        "Datasheet": "ObjectConfiguration",
        "Enabled For Validation": true,
        "Spreadsheet": "AppsUtilities.1005.1",
        "Spreadsheet Id": "${CONFIG_SS_ID}",
        "Primary Fields": "Object Name",
        "Id Field Name": "Object Number",
        "Header Number": 1,
        "Sequence": "AppsUtilities.1000.2",
        "Custom Line Trigger": ""
      },
      {
        "Object Name": "Lookup",
        "Datasheet": "LookupConfiguration",
        "Enabled For Validation": true,
        "Spreadsheet": "AppsUtilities.1005.1",
        "Spreadsheet Id": "${CONFIG_SS_ID}",
        "Primary Fields": "Lookup Name",
        "Id Field Name": "Lookup Number",
        "Header Number": 1,
        "Sequence": "AppsUtilities.1000.3",
        "Custom Line Trigger": ""
      },
      {
        "Object Name": "Dropdown",
        "Datasheet": "DropdownConfiguration",
        "Enabled For Validation": true,
        "Spreadsheet": "AppsUtilities.1005.1",
        "Spreadsheet Id": "${CONFIG_SS_ID}",
        "Primary Fields": "Dropdown Name",
        "Id Field Name": "Dropdown Number",
        "Header Number": 1,
        "Sequence": "AppsUtilities.1000.4",
        "Custom Line Trigger": ""
      },
      {
        "Object Name": "GlobalDropdown",
        "Datasheet": "GlobalDropdownConfiguration",
        "Enabled For Validation": true,
        "Spreadsheet": "AppsUtilities.1005.1",
        "Spreadsheet Id": "${CONFIG_SS_ID}",
        "Primary Fields": "Global Dropdown Name",
        "Id Field Name": "Global Dropdown Number",
        "Header Number": 1,
        "Sequence": "AppsUtilities.1000.5",
        "Custom Line Trigger": ""
      },
      {
        "Object Name": "Spreadsheet",
        "Datasheet": "Spreadsheets",
        "Enabled For Validation": true,
        "Spreadsheet": "AppsUtilities.1005.1",
        "Spreadsheet Id": "${CONFIG_SS_ID}",
        "Primary Fields": "Spreadsheet Name",
        "Id Field Name": "Spreadsheet Number",
        "Header Number": 1,
        "Sequence": "AppsUtilities.1000.6",
        "Custom Line Trigger": ""
      }
    ],
    "1002": [ // LookupConfiguration
      {
        "Source Object": "AppsUtilities.1001.2", // Object
        "Target Object": "AppsUtilities.1001.6", // Spreadsheet
        "Column Name": "Spreadsheet"
      },
      {
        "Source Object": "AppsUtilities.1001.2", // Object
        "Target Object": "AppsUtilities.1001.1", // Sequence
        "Column Name": "Sequence"
      },
      {
        "Source Object": "AppsUtilities.1001.3", // Lookup
        "Target Object": "AppsUtilities.1001.2", // Object
        "Column Name": "Source Object"
      },
      {
        "Source Object": "AppsUtilities.1001.3", // Lookup
        "Target Object": "AppsUtilities.1001.2", // Object
        "Column Name": "Target Object"
      }
    ],
    "1003": [ // DropdownConfiguration
      {
        "Dropdown Name": "Enabled For Validation",
        "Object": "AppsUtilities.1001.2", // Object
        "Values": "Yes, No"
      }
    ],
    "1004": [ // GlobalDropdownConfiguration
      {
        "Global Dropdown Name": "Enabled",
        "Values": "Yes, No"
      }
    ],
    "1005": [ // Spreadsheets
      {
        "Spreadsheet Name": "BZQ Core Configuration",
        "Spreadsheet Id": "${CONFIG_SS_ID}",
        "Folder Path": "/",
        "Notes": "Platform master configuration settings"
      }
    ],
    "1006": [ // ConfigurationProperties
      {
        "Configuration Key": "DEBUG_MODE",
        "Value": true,
        "Notes": "Set to true to turn on debug level logging"
      },
      {
        "Configuration Key": "ProcessValidation_ENABLED",
        "Value": true,
        "Notes": "Enables BZQs data validation process for all objects that have validation enabled"
      },
      {
        "Configuration Key": "HEADER_FORMAT",
        "Value": "{\"background\":\"#d9d9d9\",\"fontColor\":\"#000000\",\"fontFamily\":\"Arial\",\"fontSize\":10,\"fontWeight\":\"bold\",\"fontStyle\":\"normal\",\"fontLine\":\"none\",\"horizontalAlignment\":\"center\",\"verticalAlignment\":\"bottom\"}",
        "Notes": "Header styling format"
      },
      {
        "Configuration Key": "RECORD_FORMAT",
        "Value": "{\"background\":\"#ffffff\",\"fontColor\":\"#000000\",\"fontFamily\":\"Arial\",\"fontSize\":10,\"fontWeight\":\"normal\",\"fontStyle\":\"normal\",\"fontLine\":\"none\",\"horizontalAlignment\":\"general-left\",\"verticalAlignment\":\"bottom\",\"borders\":{\"top\":{\"style\":\"SOLID\",\"color\":\"#000000\"},\"bottom\":{\"style\":\"SOLID\",\"color\":\"#000000\"},\"left\":{\"style\":\"SOLID\",\"color\":\"#000000\"},\"right\":{\"style\":\"SOLID\",\"color\":\"#000000\"}}}",
        "Notes": "Record cell styling format"
      }
    ]
  };
}
