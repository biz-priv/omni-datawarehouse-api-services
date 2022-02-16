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
const totalCount = 5;
const loopCount = 4;

module.exports.handler = async (event, context, callback) => {
  let hasMoreData = "false";
  let currentLoopCount = event.hasOwnProperty("currentLoopCount")
    ? event.currentLoopCount
    : 0;
  try {
    // let hasMoreData = "true";
    // console.log("event", event);
    // if (
    //   event &&
    //   event.hasOwnProperty("hasMoreData") &&
    //   event.hasMoreData == "true"
    // ) {
    //   hasMoreData = "false";
    // } else {
    //   hasMoreData = "true";
    // }
    // return { hasMoreData };

    /**
     * Get connections
     */
    const connections = getConnection();

    /**
     * Get data from db
     */
    const orderData = await getDataGroupBy(connections);
    console.log("orderData", orderData.length, orderData[0]);
    if (orderData.length > totalCount - 1 && loopCount >= currentLoopCount) {
      hasMoreData = "true";
      currentLoopCount = currentLoopCount + 1;
    }
    // return {};
    await Promise.all(
      orderData.map(async (item) => {
        try {
          // const itemId = "DFW7789410-00";
          const itemId = item.invoice_nbr;
          /**
           * get invoice obj from DB
           */
          const orderDataById = await getInvoiceNbrData(connections, itemId);
          // console.log("orderDataById", orderDataById);
          /**
           * get customer from netsuit
           */
          const customerData = await getcustomer(orderDataById[0].customer_id);
          // console.log("customerData", customerData);
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
            orderDataById,
            customerData
          );
          // console.log(xmlPayload);
          /**
           * create Netsuit Invoice
           */
          const invoiceId = await createInvoice(xmlPayload);
          // console.log("invoiceId", invoiceId);

          /**
           * update invoice id
           */
          await updateInvoiceId(connections, itemId, invoiceId);
          // connections.end();
        } catch (error) {
          console.info("error");
        }
      })
    );
    return { hasMoreData, currentLoopCount };
  } catch (error) {
    // console.info("ERROR INFO", error);
    return { hasMoreData: false, currentLoopCount };
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
    // const query = `SELECT invoice_nbr FROM interface_ar_new GROUP BY invoice_nbr limit 10 offset 0`;
    const query = `SELECT invoice_nbr FROM interface_ar_new where internal_id is null
                    GROUP BY invoice_nbr limit ${totalCount}`;
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
          reject("Customer not found");
        }
      })
      .catch((err) => {
        reject("Customer not found");
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

    recode["q1:otherRefNum"] = "CIRRUS"; //customer reference
    recode["q1:memo"] = ""; //this is for EE only (leave out for worldtrak)

    recode["q1:itemList"]["q1:item"] = data.map((e) => ({
      "q1:item": {
        "@externalId": "AIR FREIGHT",
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
          {
            "@internalId": "1727",
            "@xsi:type": "StringCustomFieldRef",
            "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
            value: "CULVSHA21040316",
          },
          {
            "@internalId": "1728",
            "@xsi:type": "StringCustomFieldRef",
            "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
            value: e.controlling_stn,
          },
          {
            "@internalId": "760",
            "@xsi:type": "StringCustomFieldRef",
            "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
            value: e.housebill_nbr,
          },
        ],
      },
    }));

    payload["soap:Envelope"]["soap:Body"]["add"]["record"] = recode;
    const doc = create(payload);
    return doc.end({ prettyPrint: true });
  } catch (error) {
    throw "Unable to make xml";
  }
}

const createInvoice = async (soapPayload) => {
  try {
    const res = await axios.post(API_ENDPOINT, soapPayload, {
      headers: {
        Accept: "text/xml",
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "add",
      },
    });
    // console.info("res", res.data);
    if (res.status == 200) {
      const obj = convert(res.data, { format: "object" });
      return obj["soapenv:Envelope"]["soapenv:Body"]["addResponse"][
        "writeResponse"
      ]["baseRef"]["@internalId"];
    } else {
      throw "Unable to create invoice";
    }
  } catch (error) {
    console.log("error", error);
    throw "Unable to create invoice";
  }
};

async function updateInvoiceId(connections, invoice_nbr, invoiceId) {
  try {
    console.log("invoice_nbr, invoiceId", invoice_nbr, invoiceId);
    const query = `UPDATE interface_ar_new SET internal_id = '${invoiceId}' WHERE invoice_nbr = '${invoice_nbr}'`;
    const result = await connections.query(query);
    return result;
  } catch (error) {
    throw "No data found.";
  }
}

function formatDate(dateObj) {
  var date = new Date(dateObj);
  return (
    date.getFullYear() +
    ("00" + (date.getMonth() + 1)).slice(-2) +
    ("00" + date.getDate()).slice(-2) +
    ("00" + date.getHours()).slice(-2) +
    ("00" + date.getMinutes()).slice(-2) +
    ("00" + date.getSeconds()).slice(-2)
  );
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
