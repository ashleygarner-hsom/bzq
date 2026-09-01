/**
 * Returns the stable-ID mapped seed configuration records for AppsUtilities.
 */
function getSeedData_AppsUtilities() {
  return {
    "1000": [ // SequenceConfiguration
      {
        "Sequence": "=arrayformula(if(not(isblank(B2:B)),if(not(isblank(C2:C)),text(B2:B,\"0000#\") & \" - \" & C2:C,),))",
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
        "Object": "=ARRAYFORMULA(if(not(isblank(B2:B)), if(not(isblank(C2:C)), text(B2:B,\"0000#\") & \" - \" & C2:C, ), ))",
        "Object Name": "Sequence",
        "Datasheet": "SequenceConfiguration",
        "Enabled For Validation": true,
        "Spreadsheet": "AppsUtilities.1005.1",
        "Spreadsheet Id": "=ARRAYFORMULA(if(not(isblank(F2:F)), BZQ_GET_OBJECT_VALUE(\"Spreadsheet\", F2:F, \"Spreadsheet Id\", BZQ_CACHE_VERSION()), \"\"))",
        "Spreadsheet Url": "=ARRAYFORMULA(if(not(isblank(G2:G)),\"https://docs.google.com/spreadsheets/d/\"&G2:G,\"\"))",
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
        "Spreadsheet Id": "",
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
        "Spreadsheet Id": "",
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
        "Spreadsheet Id": "",
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
        "Spreadsheet Id": "",
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
        "Spreadsheet Id": "",
        "Primary Fields": "Spreadsheet Name",
        "Id Field Name": "Spreadsheet Number",
        "Header Number": 1,
        "Sequence": "AppsUtilities.1000.6",
        "Custom Line Trigger": ""
      }
    ],
    "1002": [ // LookupConfiguration
      {
        "Lookup": "=ARRAYFORMULA(if(not(isblank(B2:B)), if(not(isblank(C2:C)), text(B2:B,\"0000#\") & \" - \" & C2:C, ), ))",
        "Lookup Name": "=ARRAYFORMULA(if(not(isblank(D2:D)),if(not(isblank(E2:E)),D2:D&\" lookup to \"&E2:E,\"\"),\"\"))",
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
        "Dropdown": "=ARRAYFORMULA(if(not(isblank(B2:B)), if(not(isblank(C2:C)), text(B2:B,\"0000#\") & \" - \" & C2:C, ), ))",
        "Dropdown Name": "Enabled For Validation",
        "Object": "AppsUtilities.1001.2", // Object
        "Values": "Yes, No"
      }
    ],
    "1004": [ // GlobalDropdownConfiguration
      {
        "Global Dropdown": "=ARRAYFORMULA(if(not(isblank(B2:B)), if(not(isblank(C2:C)), text(B2:B,\"0000#\") & \" - \" & C2:C, ), ))",
        "Global Dropdown Name": "Enabled",
        "Values": "Yes, No"
      }
    ],
    "1005": [ // Spreadsheets
      {
        "Spreadsheet": "=ARRAYFORMULA(if(not(isblank(B2:B)), if(not(isblank(C2:C)), text(B2:B,\"0000#\") & \" - \" & C2:C, ), ))",
        "Spreadsheet Name": "BZQ Core Configuration",
        "Spreadsheet Id": "${CONFIG_SS_ID}",
        "Spreadsheet Url": "=ARRAYFORMULA(if(not(isblank(D2:D)),\"https://docs.google.com/spreadsheets/d/\"&D2:D,\"\"))",
        "Folder Path": "/",
        "Notes": "Platform master configuration settings"
      }
    ],
    "ConfigurationProperties": [ // ConfigurationProperties
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
