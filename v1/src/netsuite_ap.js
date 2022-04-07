const AWS = require("aws-sdk");
const { create, convert } = require("xmlbuilder2");
const crypto = require("crypto");
const axios = require("axios");
const nodemailer = require("nodemailer");
const pgp = require("pg-promise");
const dbc = pgp({ capSQL: true });
const payload = require("../../Helpers/netsuit_AP.json");

const userConfig = {
  account: process.env.NETSUIT_AR_ACCOUNT,
  apiVersion: "2021_2",
  accountSpecificUrl: true,
  token: {
    consumer_key: process.env.NETSUIT_AR_CONSUMER_KEY,
    consumer_secret: process.env.NETSUIT_AR_CONSUMER_SECRET,
    token_key: process.env.NETSUIT_AR_TOKEN_KEY,
    token_secret: process.env.NETSUIT_AR_TOKEN_SECRET,
  },
  wsdlPath: process.env.NETSUIT_AR_WDSLPATH,
};

let totalCountPerLoop = 20;
const today = getCustomDate();

module.exports.handler = async (event, context, callback) => {
  let hasMoreData = "false";
  let currentCount = 0;
  totalCountPerLoop = event.hasOwnProperty("totalCountPerLoop")
    ? event.totalCountPerLoop
    : totalCountPerLoop;

  try {
    /**
     * Get connections
     */
    const connections = getConnection();

    /**
     * Get data from db
     */
    const orderData = await getDataGroupBy(connections);

    const invoiceIDs = orderData.map((a) => "'" + a.invoice_nbr + "'");
    console.log("orderData", orderData, orderData.length);
    currentCount = orderData.length;

    const invoiceDataList = await getInvoiceNbrData(connections, invoiceIDs);

    /**
     * 15 simultaneous process
     */
    const perLoop = 15;
    let queryData = "";
    for (let index = 0; index < (orderData.length + 1) / perLoop; index++) {
      let newArray = orderData.slice(
        index * perLoop,
        index * perLoop + perLoop
      );
      const data = await Promise.all(
        newArray.map(async (item) => {
          return await mainProcess(item, invoiceDataList);
        })
      );
      queryData += data.join("");
    }

    /**
     * Updating total 20 invoices at once
     */
    await updateInvoiceId(connections, queryData);

    if (currentCount > totalCountPerLoop) {
      hasMoreData = "true";
    } else {
      hasMoreData = "false";
    }
    dbc.end();
    return { hasMoreData };
  } catch (error) {
    dbc.end();
    return { hasMoreData: "false" };
  }
};

/**
 * main process of netsuite AP API
 * @param {*} connections
 * @param {*} item
 */
async function mainProcess(item, invoiceDataList) {
  let singleItem = null;
  try {
    const itemId = item.invoice_nbr;

    /**
     * get invoice obj from DB
     */
    const dataById = invoiceDataList.filter((e) => {
      return e.invoice_nbr == itemId;
    });

    singleItem = dataById[0];

    /**
     * group data by invoice_type IN/CM
     */
    const dataGroup = dataById.reduce(
      (result, item) => ({
        ...result,
        [item["invoice_type"]]: [...(result[item["invoice_type"]] || []), item],
      }),
      {}
    );

    /**
     * get customer from netsuit
     */
    let customerData = {
      entityId: singleItem.vendor_id,
      entityInternalId: singleItem.vendor_internal_id,
      currency: singleItem.currency,
      currencyInternalId: singleItem.currency_internal_id,
    };
    let getUpdateQueryList = "";

    for (let e of Object.keys(dataGroup)) {
      singleItem = dataGroup[e][0];

      /**
       * get auth keys
       */
      const auth = getOAuthKeys(userConfig);

      /**
       * Make Json to Xml payload
       */
      const xmlPayload = makeJsonToXml(
        JSON.parse(JSON.stringify(payload)),
        auth,
        dataGroup[e],
        customerData
      );

      /**
       * create Netsuit Vendor Bill
       */
      const invoiceId = await createInvoice(
        xmlPayload,
        singleItem.invoice_type
      );

      /**
       * update invoice id
       */
      const getQuery = await getUpdateQuery(singleItem, invoiceId);
      getUpdateQueryList += getQuery;
    }
    return getUpdateQueryList;
  } catch (error) {
    if (error.hasOwnProperty("customError")) {
      let getQuery = "";
      try {
        getQuery = await getUpdateQuery(singleItem, null, false);
        const checkError = await checkSameError(singleItem, error);
        if (!checkError) {
          await recordErrorResponse(singleItem, error);
        }
        return getQuery;
      } catch (error) {
        await recordErrorResponse(singleItem, error);
        return getQuery;
      }
    }
  }
}

function getConnection() {
  try {
    const dbUser = process.env.USER;
    const dbPassword = process.env.PASS;
    const dbHost = process.env.HOST;
    // const dbHost = "omni-dw-prod.cnimhrgrtodg.us-east-1.redshift.amazonaws.com";
    const dbPort = process.env.PORT;
    const dbName = process.env.DBNAME;

    const connectionString = `postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;
    return dbc(connectionString);
  } catch (error) {
    throw "DB Connection Error";
  }
}

async function getDataGroupBy(connections) {
  try {
    const query = `SELECT distinct invoice_nbr FROM interface_ap where (internal_id is null and processed != 'F' and
                  vendor_internal_id !='') or (vendor_internal_id !='' and processed ='F' and processed_date < '${today}') limit ${
      totalCountPerLoop + 1
    }`;

    const result = await connections.query(query);
    if (!result || result.length == 0) {
      throw "No data found.";
    }
    return result;
  } catch (error) {
    throw "No data found.";
  }
}

async function getInvoiceNbrData(connections, invoice_nbr) {
  try {
    const query = `select * from interface_ap where invoice_nbr in (${invoice_nbr.join(
      ","
    )})`;

    const result = await connections.query(query);
    if (!result || result.length == 0) {
      throw "No data found.";
    }
    return result;
  } catch (error) {
    throw "getInvoiceNbrData: No data found.";
  }
}

function getOAuthKeys(configuration) {
  const res = {};
  res.account = configuration.account;
  res.consumerKey = configuration.token.consumer_key;
  res.tokenKey = configuration.token.token_key;

  res.nonce =
    Math.random().toString(36).substr(2, 15) +
    Math.random().toString(36).substr(2, 15);

  res.timeStamp = Math.round(new Date().getTime() / 1000);

  const key = `${configuration.token.consumer_secret}&${configuration.token.token_secret}`;

  const baseString =
    configuration.account +
    "&" +
    configuration.token.consumer_key +
    "&" +
    configuration.token.token_key +
    "&" +
    res.nonce +
    "&" +
    res.timeStamp;

  res.base64hash = crypto
    .createHmac("sha256", Buffer.from(key, "utf8"))
    .update(baseString)
    .digest(null, null)
    .toString("base64");
  return res;
}

function makeJsonToXml(payload, auth, data, customerData) {
  try {
    const hardcode = getHardcodeData();

    const singleItem = data[0];
    payload["soap:Envelope"]["soap:Header"] = {
      tokenPassport: {
        "@xmlns": "urn:messages_2021_2.platform.webservices.netsuite.com",
        account: {
          "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
          "#": auth.account,
        },
        consumerKey: {
          "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
          "#": auth.consumerKey,
        },
        token: {
          "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
          "#": auth.tokenKey,
        },
        nonce: {
          "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
          "#": auth.nonce,
        },
        timestamp: {
          "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
          "#": auth.timeStamp,
        },
        signature: {
          "@algorithm": "HMAC_SHA256",
          "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
          "#": auth.base64hash,
        },
      },
    };

    let recode = payload["soap:Envelope"]["soap:Body"]["add"]["record"];
    recode["q1:entity"]["@internalId"] = customerData.entityInternalId; //This is internal ID for the customer.
    recode["q1:tranId"] = singleItem.invoice_nbr; //invoice ID
    recode["q1:tranDate"] = dateFormat(singleItem.invoice_date); //invoice date

    recode["q1:class"]["@internalId"] = hardcode.class.head;
    recode["q1:department"]["@internalId"] = hardcode.department.head;
    recode["q1:location"]["@internalId"] = hardcode.location.head;
    recode["q1:subsidiary"]["@internalId"] = singleItem.subsidiary;
    recode["q1:currency"]["@internalId"] = customerData.currencyInternalId;

    recode["q1:otherRefNum"] = singleItem.customer_po; //customer_po is the bill to ref nbr
    recode["q1:memo"] = ""; // (leave out for worldtrak)

    if (singleItem.invoice_type == "IN") {
      recode["q1:approvalStatus"] = { "@internalId": "2" };
    }

    recode["q1:itemList"]["q1:item"] = data.map((e) => {
      return {
        "q1:item": {
          "@internalId": e.charge_cd_internal_id,
        },
        "q1:description": e.charge_cd_desc,
        "q1:amount": e.total,
        "q1:rate": e.rate,
        "q1:department": {
          "@internalId": hardcode.department.line,
        },
        "q1:class": {
          "@internalId":
            hardcode.class.line[e.business_segment.split(":")[1].trim()], //hardcode.class.line, // class International - 3, Domestic - 2, Warehouse - 4,
        },
        "q1:location": {
          "@externalId": e.handling_stn,
        },
        "q1:customFieldList": {
          customField: [
            {
              "@internalId": "760",
              "@xsi:type": "StringCustomFieldRef",
              "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
              value: e.housebill_nbr,
            },
            {
              "@internalId": "1167",
              "@xsi:type": "StringCustomFieldRef",
              "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
              value: e.sales_person,
            },
            {
              "@internalId": "1727",
              "@xsi:type": "StringCustomFieldRef",
              "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
              value: e.master_bill_nbr ?? "",
            },
            {
              "@internalId": "1166",
              "@xsi:type": "SelectCustomFieldRef",
              "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
              value: { "@externalId": e.controlling_stn },
            },
            {
              "@internalId": "1168",
              "@xsi:type": "StringCustomFieldRef",
              "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
              value: e.ref_nbr,
            },
          ],
        },
      };
    });

    recode["q1:customFieldList"]["customField"] = [
      {
        "@internalId": "1730",
        "@xsi:type": "StringCustomFieldRef",
        "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
        value: singleItem.file_nbr,
      },
      {
        "@internalId": "1744",
        "@xsi:type": "StringCustomFieldRef",
        "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
        value: singleItem.email ?? "",
      },
      {
        "@internalId": "2327",
        "@xsi:type": "SelectCustomFieldRef",
        "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
        value: {
          "@typeId": "752",
          "@internalId": hardcode.source_system,
        },
      },
      {
        "@internalId": "2506",
        "@xsi:type": "StringCustomFieldRef",
        "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
        value: singleItem.consol_nbr ?? "",
      },
      {
        "@internalId": "1748",
        "@xsi:type": "StringCustomFieldRef",
        "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
        value: singleItem.housebill_nbr ?? "",
      },
      {
        "@internalId": "1756",
        "@xsi:type": "StringCustomFieldRef",
        "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
        value: singleItem.master_bill_nbr ?? "",
      },
    ];

    /**
     * check if IN or CM (IN => Bill , CM => credit)
     */

    recode["@xsi:type"] =
      singleItem.invoice_type == "IN" ? "q1:VendorBill" : "q1:VendorCredit";

    payload["soap:Envelope"]["soap:Body"]["add"]["record"] = recode;
    const doc = create(payload);
    return doc.end({ prettyPrint: true });
  } catch (error) {
    throw "Unable to make xml";
  }
}

async function createInvoice(soapPayload, type) {
  try {
    const res = await axios.post(
      process.env.NETSUIT_AR_API_ENDPOINT,
      soapPayload,
      {
        headers: {
          Accept: "text/xml",
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: "add",
        },
      }
    );

    const obj = convert(res.data, { format: "object" });
    if (
      res.status == 200 &&
      obj["soapenv:Envelope"]["soapenv:Body"]["addResponse"]["writeResponse"][
        "platformCore:status"
      ]["@isSuccess"] == "true"
    ) {
      return obj["soapenv:Envelope"]["soapenv:Body"]["addResponse"][
        "writeResponse"
      ]["baseRef"]["@internalId"];
    } else if (res.status == 200) {
      throw {
        customError: true,
        msg: obj["soapenv:Envelope"]["soapenv:Body"]["addResponse"][
          "writeResponse"
        ]["platformCore:status"]["platformCore:statusDetail"][
          "platformCore:message"
        ],
        payload: soapPayload,
        response: res.data,
      };
    } else {
      throw {
        customError: true,
        msg:
          type == "IN"
            ? "Unable to create Vendor Bill. Internal Server Error"
            : "Unable to create Vendor Credit. Internal Server Error",
        payload: soapPayload,
        response: res.data,
      };
    }
  } catch (error) {
    if (error.hasOwnProperty("customError")) {
      throw error;
    } else {
      throw {
        // customError: false,
        msg: "Netsuit AP Api Failed",
      };
    }
  }
}

/**
 * prepear the query for update interface_ap
 * @param {*} item
 * @param {*} invoiceId
 * @param {*} isSuccess
 * @returns
 */
async function getUpdateQuery(item, invoiceId, isSuccess = true) {
  try {
    console.log("invoice_nbr ", item.invoice_nbr, invoiceId);
    let query = `UPDATE interface_ap `;
    if (isSuccess) {
      query += ` SET internal_id = '${invoiceId}', processed = 'P', `;
    } else {
      query += ` SET internal_id = null, processed = 'F', `;
    }
    query += `  processed_date = '${today}'  WHERE invoice_nbr = '${item.invoice_nbr}' and invoice_type = '${item.invoice_type}'; `;

    return query;
  } catch (error) {}
}

/**
 * Update processed invoice ids
 * @param {*} connections
 * @param {*} query
 * @returns
 */
async function updateInvoiceId(connections, query) {
  try {
    const result = await connections.query(query);
    return result;
  } catch (error) {
    throw {
      customError: true,
      msg: "Vendor Bill is created But failed to update internal_id",
      invoiceId,
    };
  }
}

/**
 * hardcode data for the payload.
 * @param {*} source_system
 * @returns
 */
function getHardcodeData(source_system = "WT") {
  try {
    const data = {
      WT: {
        source_system: "3",
        class: {
          head: "9",
          line: { International: 3, Domestic: 2, Warehouse: 4 },
        },
        department: { head: "15", line: "2" },
        location: { head: "18", line: "EXT ID: Take from DB" },
        _1746: "F",
      },
      CW: {
        source_system: "1",
        class: {
          head: "9",
          line: { International: 3, Domestic: 2, Warehouse: 4 },
        },
        department: { head: "15", line: "1" },
        location: { head: "18", line: "EXT ID: Take from DB" },
        _1746: "T",
      },
      EE: {
        source_system: "4",
        class: {
          head: "9",
          line: { International: 3, Domestic: 2, Warehouse: 4 },
        },
        department: { head: "15", line: "1" },
        location: { head: "18", line: "EXT ID: Take from DB" },
        _1746: "F",
      },
      M1: {
        source_system: "2",
        class: {
          head: "9",
          line: { International: 3, Domestic: 2, Warehouse: 4 },
        },
        department: { head: "15", line: "1" },
        location: { head: "18", line: "EXT ID: Take from DB" },
        _1746: "F",
      },
    };
    if (data.hasOwnProperty(source_system)) {
      return data[source_system];
    } else {
      throw "source_system not exists";
    }
  } catch (error) {
    throw "source_system not exists";
  }
}

async function recordErrorResponse(item, error) {
  try {
    let documentClient = new AWS.DynamoDB.DocumentClient({
      region: process.env.REGION,
    });
    const data = {
      id: item.invoice_nbr + item.invoice_type,
      invoice_nbr: item.invoice_nbr,
      vendor_id: item.vendor_id,
      source_system: item.source_system,
      invoice_type: item.invoice_type,
      invoice_date: item.invoice_date.toLocaleString(),
      charge_cd_internal_id: item.charge_cd_internal_id,
      errorDescription: error?.msg,
      payload: error?.payload,
      response: error?.response,
      invoiceId: error?.invoiceId,
      status: "error",
      created_at: new Date().toLocaleString(),
    };
    const params = {
      TableName: process.env.NETSUIT_AP_ERROR_TABLE,
      Item: data,
    };
    await documentClient.put(params).promise();
    await sendMail(data);
  } catch (e) {}
}

function sendMail(data) {
  return new Promise((resolve, reject) => {
    try {
      let errorObj = JSON.parse(JSON.stringify(data));
      delete errorObj["payload"];
      delete errorObj["response"];

      const transporter = nodemailer.createTransport({
        host: process.env.NETSUIT_AR_ERROR_EMAIL_HOST,
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.NETSUIT_AR_ERROR_EMAIL_USER,
          pass: process.env.NETSUIT_AR_ERROR_EMAIL_PASS,
        },
      });

      const message = {
        from: `Netsuite <${process.env.NETSUIT_AR_ERROR_EMAIL_FROM}>`,
        to: process.env.NETSUIT_AP_ERROR_EMAIL_TO,
        subject: `Netsuite AP - Dev Error`,
        html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Netsuite Error</title>
        </head>
        <body>
          <h3>Error msg:- ${errorObj.errorDescription} </h3>
          <p> Error Obj:- </p> <pre> ${JSON.stringify(errorObj, null, 4)} </pre>
          <p> Payload:- </p> <pre>${
            data?.payload ? htmlEncode(data?.payload) : "No Payload"
          }</pre>
          <p> Response:- </p> <pre>${
            data?.response ? htmlEncode(data?.response) : "No Response"
          }</pre>
        </body>
        </html>
        `,
      };

      transporter.sendMail(message, function (err, info) {
        if (err) {
          resolve(true);
        } else {
          resolve(true);
        }
      });
    } catch (error) {
      resolve(true);
    }
  });
}

function htmlEncode(data) {
  return data.replace(/[\u00A0-\u9999<>\&]/g, function (i) {
    return "&#" + i.charCodeAt(0) + ";";
  });
}

function dateFormat(param) {
  const date = new Date(param);
  return (
    date.getFullYear() +
    "-" +
    ("00" + (date.getMonth() + 1)).slice(-2) +
    "-" +
    ("00" + date.getDate()).slice(-2) +
    "T11:05:03.000Z"
  );
}

function getCustomDate() {
  const date = new Date();
  let ye = new Intl.DateTimeFormat("en", { year: "numeric" }).format(date);
  let mo = new Intl.DateTimeFormat("en", { month: "2-digit" }).format(date);
  let da = new Intl.DateTimeFormat("en", { day: "2-digit" }).format(date);
  return `${ye}-${mo}-${da}`;
}

/**
 * check error already exists or not.
 * @param {*} singleItem
 * @returns
 */
async function checkSameError(singleItem, error) {
  try {
    const documentClient = new AWS.DynamoDB.DocumentClient({
      region: process.env.REGION,
    });

    const params = {
      TableName: process.env.NETSUIT_AP_ERROR_TABLE,
      FilterExpression:
        "#invoice_nbr = :invoice_nbr AND #errorDescription = :errorDescription",
      ExpressionAttributeNames: {
        "#invoice_nbr": "invoice_nbr",
        "#errorDescription": "errorDescription",
      },
      ExpressionAttributeValues: {
        ":invoice_nbr": singleItem.invoice_nbr,
        ":errorDescription": error?.msg,
      },
    };
    const res = await documentClient.scan(params).promise();
    if (res && res.Count && res.Count == 1) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    return false;
  }
}
