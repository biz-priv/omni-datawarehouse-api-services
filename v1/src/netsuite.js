const AWS = require("aws-sdk");
const { create, convert } = require("xmlbuilder2");
const crypto = require("crypto");
const axios = require("axios");
const pgp = require("pg-promise");

const NetSuite = require("node-suitetalk");
const Configuration = NetSuite.Configuration;
const Service = NetSuite.Service;
const Search = NetSuite.Search;

const payload = require("../../Helpers/netsuit_AR.json");

const API_ENDPOINT =
  "https://1238234-sb1.suitetalk.api.netsuite.com/services/NetSuitePort_2021_2";
const userConfig = {
  account: "1238234_SB1",
  apiVersion: "2021_2",
  accountSpecificUrl: true,
  token: {
    consumer_key:
      "cc2b4d76232dbcb49f8678aa968b2c61989683ac8b094db962dc7a56a099768f",
    consumer_secret:
      "5620fcb78dd156f28ac2a9804d3f2d06df3f957297b6b8a9e6a1aaa13f55362b",
    token_key:
      "7a9da21f09bd1ff3911a4699a923ba37a424ad7c9ebf1d44906dfcfdcdbe483e",
    token_secret:
      "6a159f86931aa2ae894bdc7abcc9055f48f254af8ee41cad7e86fd21ba07d5e3",
  },
  wsdlPath:
    "https://1238234-sb1.restlets.api.netsuite.com/wsdl/v2021_2_0/netsuite.wsdl",
};
let totalCountPerLoop = 10;
let loopCount = 4;

module.exports.handler = async (event, context, callback) => {
  let hasMoreData = "false";
  let currentLoopCount = event.hasOwnProperty("currentLoopCount")
    ? event.currentLoopCount
    : 1;
  loopCount = event.hasOwnProperty("loopCount") ? event.loopCount : loopCount;
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
    //LAX3662949-00
    const orderData = await getDataGroupBy(connections);
    console.log("orderData", orderData.length);
    // return {};
    let count = 1;

    for (let i = 0; i < orderData.length; i++) {
      // console.log(orderData[i]);
      let item = orderData[i];
      console.log("count", count);
      count++;
      let singleItem = null;
      try {
        const itemId = item.invoice_nbr;

        /**
         * get invoice obj from DB
         */
        const dataById = await getInvoiceNbrData(connections, itemId);
        // console.log("dataById", dataById);
        singleItem = dataById[0];
        /**
         * group data by invoice_type IN/CM
         */
        const dataGroup = dataById.reduce(
          (result, item) => ({
            ...result,
            [item["invoice_type"]]: [
              ...(result[item["invoice_type"]] || []),
              item,
            ],
          }),
          {}
        );

        /**
         * get customer from netsuit
         */
        const customerData = await getcustomer(dataById[0].customer_id);
        // console.log("customerData", customerData);

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
            payload,
            auth,
            dataGroup[e],
            customerData
          );
          // console.log(xmlPayload);
          // throw "ee";

          /**
           * create Netsuit Invoice
           */
          const invoiceId = await createInvoice(
            xmlPayload,
            singleItem.invoice_type
          );
          // console.log("invoiceId", invoiceId);

          /**
           * update invoice id
           */
          await updateInvoiceId(connections, singleItem, invoiceId);
        }
      } catch (error) {
        if (error.hasOwnProperty("customError")) {
          try {
            await updateInvoiceId(connections, singleItem, null, false);
            await recordErrorResponse(singleItem, error);
          } catch (error) {
            await recordErrorResponse(singleItem, error);
          }
        }
      }
    }

    if (loopCount > currentLoopCount) {
      hasMoreData = "true";
      currentLoopCount = currentLoopCount + 1;
    } else {
      hasMoreData = "false";
    }
    return { hasMoreData, currentLoopCount, loopCount, totalCountPerLoop };
  } catch (error) {
    return { hasMoreData: false, currentLoopCount, totalCountPerLoop };
  }
};

function getConnection() {
  try {
    const dbUser = process.env.USER;
    const dbPassword = process.env.PASS;
    const dbHost = process.env.HOST;
    // const dbHost = "omni-dw-prod.cnimhrgrtodg.us-east-1.redshift.amazonaws.com";
    const dbPort = process.env.PORT;
    const dbName = process.env.DBNAME;

    const dbc = pgp({ capSQL: true });
    const connectionString = `postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;
    console.log("connectionString", connectionString);
    return dbc(connectionString);
  } catch (error) {
    throw "DB Connection Error";
  }
}

async function getDataGroupBy(connections) {
  try {
    const query = `SELECT invoice_nbr FROM interface_ar_new where internal_id is null and processed !='P' 
                    and processed !='F' GROUP BY invoice_nbr limit ${totalCountPerLoop}`;
    // const query = `SELECT invoice_nbr FROM interface_ar_new where invoice_type != 'IN' and internal_id is null and customer_id != 'MONGLOPHL'
    //                 GROUP BY invoice_nbr limit ${totalCountPerLoop}`;
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
    const query = `SELECT * FROM interface_ar_new where invoice_nbr = '${invoice_nbr}'`;
    const result = await connections.query(query);
    if (!result || result.length == 0 || !result[0].customer_id) {
      throw "No data found.";
    }
    return result;
  } catch (error) {
    throw "No data found.";
  }
}

function getcustomer(entityId) {
  return new Promise((resolve, reject) => {
    const config = new Configuration(userConfig);
    const service = new Service(config);
    service
      .init()
      .then((/**/) => {
        // Set search preferences
        const searchPreferences = new Search.SearchPreferences();
        searchPreferences.pageSize = 5;
        service.setSearchPreferences(searchPreferences);

        // Create basic search
        const search = new Search.Basic.CustomerSearchBasic();

        const nameStringField = new Search.Fields.SearchStringField();
        nameStringField.field = "entityId";
        nameStringField.operator = "is";
        nameStringField.searchValue = entityId; //"COMSP27";

        search.searchFields.push(nameStringField);

        return service.search(search);
      })
      .then((result, raw, soapHeader) => {
        // console.log(JSON.stringify(result));
        if (result && result?.searchResult?.recordList?.record.length > 0) {
          const record = result.searchResult.recordList.record[0];
          resolve({
            entityId: record.entityId,
            entityInternalId: record["$attributes"].internalId,
            currency: record.currency.name,
            currencyInternalId: record.currency["$attributes"].internalId,
          });
        } else {
          reject({ customError: true, msg: "Customer not found" });
        }
      })
      .catch((err) => {
        reject({ customError: true, msg: "Customer Api failed" });
      });
  });
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
        "@xmlns": "urn:messages_2018_2.platform.webservices.netsuite.com",
        account: {
          "@xmlns": "urn:core_2018_2.platform.webservices.netsuite.com",
          "#": auth.account,
        },
        consumerKey: {
          "@xmlns": "urn:core_2018_2.platform.webservices.netsuite.com",
          "#": auth.consumerKey,
        },
        token: {
          "@xmlns": "urn:core_2018_2.platform.webservices.netsuite.com",
          "#": auth.tokenKey,
        },
        nonce: {
          "@xmlns": "urn:core_2018_2.platform.webservices.netsuite.com",
          "#": auth.nonce,
        },
        timestamp: {
          "@xmlns": "urn:core_2018_2.platform.webservices.netsuite.com",
          "#": auth.timeStamp,
        },
        signature: {
          "@algorithm": "HMAC_SHA256",
          "@xmlns": "urn:core_2018_2.platform.webservices.netsuite.com",
          "#": auth.base64hash,
        },
      },
    };

    let recode = payload["soap:Envelope"]["soap:Body"]["add"]["record"];
    recode["q1:entity"]["@internalId"] = customerData.entityInternalId; //This is internal ID for the customer.
    recode["q1:tranDate"] = singleItem.invoice_date.toISOString(); //invoice date
    recode["q1:class"]["@internalId"] = hardcode.class.head;
    recode["q1:department"]["@internalId"] = hardcode.department.head;
    recode["q1:location"]["@internalId"] = hardcode.location.head;
    recode["q1:currency"]["@internalId"] = customerData.currencyInternalId;

    recode["q1:otherRefNum"] = singleItem.housebill_nbr; //customer reference
    recode["q1:memo"] = ""; //this is for EE only (leave out for worldtrak)

    recode["q1:itemList"]["q1:item"] = data.map((e) => ({
      "q1:item": {
        "@externalId": "AIR FREIGHT", //e.id.trim(),
      },
      "q1:description": e.charge_cd_desc,
      "q1:amount": e.total,
      "q1:rate": e.rate,
      "q1:department": {
        "@internalId": hardcode.department.line, //"1", //hardcode 1 (revenue)
      },
      "q1:class": {
        "@internalId": hardcode.class.line, //"3", //hardcode 2 (freight domestic) for worldtrak
      },
      "q1:location": {
        "@externalId": e.handling_stn, // This is internal ID for billing station
      },
      "q1:customFieldList": {
        customField: [
          // {
          //   "@internalId": "1166",
          //   "@xsi:type": "StringCustomFieldRef",
          //   "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
          //   value: { "@externalId": e.controlling_stn },
          // },
          {
            "@internalId": "760",
            "@xsi:type": "StringCustomFieldRef",
            "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
            value: e.housebill_nbr,
          },
        ],
      },
    }));

    recode["q1:customFieldList"]["customField"] = [
      {
        "@internalId": "1745",
        "@xsi:type": "DateCustomFieldRef",
        "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
        value: "2022-01-11T23:07:57",
      },
      {
        "@internalId": "1730",
        "@xsi:type": "StringCustomFieldRef",
        "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
        value: "91404469", //please replace this with the worldtrak file number ??
      },
      {
        "@internalId": "1744",
        "@xsi:type": "StringCustomFieldRef",
        "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
        value: "wwaller@omnilogistics.com", //this should be the email of the user who finalized the invoice ??
      },
      {
        "@internalId": "2327",
        "@xsi:type": "SelectCustomFieldRef",
        "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
        value: {
          "@typeId": "752",
          "@internalId": singleItem.source_system == "WT" ? "1" : "4",
        }, //please change internalid to "1" for worldtrak
      },
    ];

    /**
     * check if IN or CM (IN => invoice , CM => credit)
     */

    recode["@xsi:type"] =
      singleItem.invoice_type == "IN" ? "q1:Invoice" : "q1:CreditMemo";
    recode["@xmlns:q1"] =
      singleItem.invoice_type == "IN"
        ? "urn:sales_2021_2.transactions.webservices.netsuite.com"
        : "urn:customers_2021_2.transactions.webservices.netsuite.com";

    payload["soap:Envelope"]["soap:Body"]["add"]["record"] = recode;
    const doc = create(payload);
    return doc.end({ prettyPrint: true });
  } catch (error) {
    throw "Unable to make xml";
  }
}

async function createInvoice(soapPayload, type) {
  try {
    const res = await axios.post(API_ENDPOINT, soapPayload, {
      headers: {
        Accept: "text/xml",
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "add",
      },
    });

    // console.log("res", res.data);
    if (res.status == 200) {
      const obj = convert(res.data, { format: "object" });
      return obj["soapenv:Envelope"]["soapenv:Body"]["addResponse"][
        "writeResponse"
      ]["baseRef"]["@internalId"];
    } else {
      throw {
        customError: true,
        msg:
          type == "IN"
            ? "Unable to create invoice"
            : "Unable to create CreditMemo",
        payload: soapPayload,
        response: res.data,
      };
    }
  } catch (error) {
    if (error.hasOwnProperty("customError")) {
      throw error;
    } else {
      throw {
        customError: true,
        msg: "Invoice api failed",
        payload: soapPayload,
      };
    }
  }
}

async function updateInvoiceId(connections, item, invoiceId, isSuccess = true) {
  try {
    console.log(
      "invoice_nbr " + item.invoice_type,
      item.invoice_nbr,
      invoiceId
    );
    let query = `UPDATE interface_ar_new `;
    if (isSuccess) {
      query += ` SET internal_id = '${invoiceId}', processed = 'P' `;
    } else {
      query += ` SET internal_id = null, processed = 'F' `;
    }
    query += `WHERE invoice_nbr = '${item.invoice_nbr}' and invoice_type = '${item.invoice_type}'`;
    const result = await connections.query(query);
    return result;
  } catch (error) {
    throw {
      customError: true,
      msg: "Invoice is created But failed to update internal_id",
      invoiceId,
    };
  }
}

function getHardcodeData(source_system = "WT") {
  try {
    const data = {
      WT: {
        class: { head: "9", line: "2" },
        department: { head: "15", line: "1" },
        location: { head: "18", line: "EXT ID: Take from DB" },
      },
    };
    if (data[source_system]) {
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
      source_system: item.source_system,
      invoice_type: item.invoice_type,
      invoice_date: item.invoice_date.toLocaleString(),
      errorDescription: error?.msg,
      payload: error?.payload,
      response: error?.response,
      invoiceId: error?.invoiceId,
      status: "error",
      created_at: new Date().toLocaleString(),
    };
    // console.log("data", data);
    const params = {
      TableName: "omni-dw-netsuit-ar-error-response-dev",
      Item: data,
    };
    await documentClient.put(params).promise();
  } catch (e) {
    console.log("db err", e);
  }
}
