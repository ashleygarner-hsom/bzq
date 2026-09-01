/**
 * Returns the stable-ID mapped seed configuration records and layouts for FormsEngine.
 */
function getSeedData_FormsEngine() {
  return {
    // Delta Seeding onto AppsUtilities Core Objects
    "AppsUtilities.1000": [ // SequenceConfiguration
      {
        "Sequence Name": "Forms",
        "Datasheet Name": "Forms",
        "Sequence Prefix": "xFM-",
        "Starting Number": 1000,
        "Format": "000#",
        "Current Value": 1000,
        "Enabled": true
      }
    ],
    "AppsUtilities.1001": [ // ObjectConfiguration
      {
        "Object Name": "Form",
        "Datasheet": "Forms",
        "Enabled For Validation": true,
        "Spreadsheet": "AppsUtilities.1005.filter(Spreadsheet Name == \"Forms Engine\")",
        "Spreadsheet Id": "",
        "Primary Fields": "Form Name",
        "Id Field Name": "Form Number",
        "Header Number": 1,
        "Sequence": "AppsUtilities.1000.filter(Sequence Name == \"Forms\")",
        "Custom Line Trigger": "",
        "Default Form": "FormsEngine.2000.filter(Form Name == \"New prospect\")" // Delta column and value seed!
      }
    ],
    "AppsUtilities.1002": [ // LookupConfiguration
      {
        "Source Object": "FormsEngine.2000", // Form
        "Target Object": "AppsUtilities.1001.2", // Object
        "Column Name": "Object Name"
      }
    ],
    "AppsUtilities.1003": [ // DropdownConfiguration
      {
        "Dropdown Name": "Form Enabled",
        "Object": "FormsEngine.2000", // Form
        "Values": "Yes, No"
      }
    ],
    "AppsUtilities.1005": [ // Spreadsheets
      {
        "Spreadsheet Name": "Forms Engine",
        "Spreadsheet Id": "${SPOKE_ID}",
        "Folder Path": "/",
        "Notes": "Forms configuration repository and layout builder"
      }
    ],
    "AppsUtilities.1006": [ // ConfigurationProperties
      {
        "Configuration Key": "FORMS_ENGINE_ENABLED",
        "Value": true,
        "Notes": "Enables BZQ HTML Forms Engine layout parsing"
      }
    ],

    // FormsEngine Local Objects
    "2000": [ // Forms
      {
        "Form": "=ARRAYFORMULA(if(not(isblank(B2:B)),B2:B&\" - \"&C2:C,\"\"))",
        "Form Name": "New prospect",
        "Object Name": "Prospect",
        "Enabled": "Yes"
      },
      {
        "Form Name": "New customer",
        "Object Name": "Customer",
        "Enabled": "Yes"
      }
    ],

    // Raw Form Layout Worksheet Seeds (written directly to the Forms Engine spoke sheet)
    "New prospect": [
      {
        "Field": "Prospect Number",
        "Display name": "Please provide contact details and all fields applicable",
        "Field type": "AUTOID",
        "Referenced object": null,
        "Validation": null,
        "Referenced dropdown config": null
      },
      {
        "Field": "Salesperson",
        "Display name": "Attributed sales person",
        "Field type": "LOOKUP",
        "Referenced object": "Sales Parties"
      },
      {
        "Field": "Customer",
        "Display name": "Linked customer - for existing customers",
        "Field type": "LOOKUP",
        "Referenced object": "Customers"
      },
      {
        "Field": "Prospect Name",
        "Display name": "Prospect name",
        "Field type": "TEXT"
      },
      {
        "Field": "Phone",
        "Display name": "Contact phone number",
        "Field type": "TEXT",
        "Validation": "PHONE"
      },
      {
        "Field": "Email",
        "Display name": "Contact email address",
        "Field type": "TEXT",
        "Validation": "EMAIL"
      },
      {
        "Field": "Est. Sale Date",
        "Display name": "Estimated date of sale",
        "Field type": "DATE"
      },
      {
        "Field": "Need By",
        "Display name": "Garments needed by date",
        "Field type": "DATE"
      },
      {
        "Field": "Purpose",
        "Display name": "Purpose of garments",
        "Field type": "TEXT"
      },
      {
        "Field": "Expected $",
        "Display name": "Expected Sale Amount",
        "Field type": "CURRENCY",
        "Validation": "USD"
      },
      {
        "Field": "Likelihood",
        "Display name": "Likelihood of sale",
        "Field type": "NUMBER",
        "Validation": "PERCENT"
      },
      {
        "Field": "Contact Notes",
        "Display name": "Contact Notes",
        "Field type": "TEXT"
      },
      {
        "Field": "Status",
        "Display name": "Current status of customer interaction?",
        "Field type": "LOOKUP",
        "Referenced dropdown config": "BACKLOG_STATUS"
      },
      {
        "Field": "Stage",
        "Display name": "What is the current stage of the opportunity?",
        "Field type": "LOOKUP",
        "Referenced dropdown config": "BACKLOG_STAGE"
      }
    ],
    "New customer": [
      {
        "Field": "Customer Number",
        "Display name": "Provide all available customer details",
        "Field type": "AUTOID",
        "Referenced object": null,
        "Validation": null,
        "Referenced dropdown config": null
      }
    ]
  };
}
