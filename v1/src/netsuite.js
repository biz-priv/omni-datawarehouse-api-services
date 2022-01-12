const { create, convert } = require("xmlbuilder2");
const crypto = require("crypto");
const axios = require("axios");
const pgp = require("pg-promise");

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

module.exports.handler = async (event, context, callback) => {
  try {
    /**
     * Get data from db
     */
    const connections = getConnection();
    // const orderData = await getDataGroupBy(connections);
    // console.log("orderData", orderData);
    const orderDataById = await getDataInvoiceNbr(connections, "DFW1076678-00");
    console.log("orderDataById", orderDataById);
    // return {};
    /**
     * get auth keys
     */
    const auth = getOAuthKeys(userConfig);

    /**
     * Make Json to Xml payload
     */
    const xmlPayload = makeJsonToXml(payload, auth, orderDataById);
    console.log(xmlPayload);

    // await callSoapApi(xmlPayload);
    // connections.end();
    return {};
  } catch (error) {
    console.log("error", error);
  }
};

function getConnection() {
  try {
    const dbUser = process.env.USER;
    const dbPassword = process.env.PASS;
    // const dbHost = process.env.HOST;
    const dbHost = "omni-dw-prod.cnimhrgrtodg.us-east-1.redshift.amazonaws.com";
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
    const query = `SELECT invoice_nbr FROM interface_ar_new GROUP BY invoice_nbr limit 2`;
    const result = await connections.query(query);
    if (!result || result.length == 0) {
      throw "No data found.";
    }
    return result;
  } catch (error) {
    throw "No data found.";
  }
}

async function getDataInvoiceNbr(connections, invoice_nbr) {
  try {
    const query = `SELECT * FROM interface_ar_new where invoice_nbr = '${invoice_nbr}'`;
    const result = await connections.query(query);
    if (!result || result.length == 0) {
      throw "No data found.";
    }
    return result;
  } catch (error) {
    throw "No data found.";
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

function makeJsonToXml(payload, auth, data) {
  const singleItem = data[0];
  payload["soap:Envelope"]["soap:Header"] = {
    tokenPassport: {
      account: auth.account,
      consumerKey: auth.consumerKey,
      nonce: auth.nonce,
      timestamp: auth.timeStamp,
      token: auth.tokenKey,
      version: "1.0",
      signature: {
        "@algorithm": "HMAC_SHA256",
        "#": auth.base64hash,
      },
    },
  };

  let recode = payload["soap:Envelope"]["soap:Body"]["add"]["#"]["record"]["#"];
  // recode["q1:entity"]["@internalId"] = singleItem.customer_id; //This is internal ID for the customer.  I believe you can send the customer code instead.
  recode["q1:tranDate"] = singleItem.invoice_date.toISOString(); //invoice date

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
      "@internalId": "1", //hardcode 1 (revenue)
    },
    "q1:class": {
      "@internalId": "2", //hardcode 2 (freight domestic) for worldtrak
    },
    "q1:location": {
      "@externalId": e.handling_stn, // ?? This is internal ID for billing station, I believe you can send the code instead.
      // "@externalId": "LAX",
      // "@externalId": singleItem.customer_id,
    },
    "q1:customFieldList": {
      customField: [
        {
          "@internalId": "1727",
          "@xsi:type": "StringCustomFieldRef",
          "@xmlns": "urn:core_2021_2.platform.webservices.netsuite.com",
          value: "MAWB",
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

  payload["soap:Envelope"]["soap:Body"]["add"]["#"]["record"]["#"] = recode;
  console.log("payload", JSON.stringify(payload));
  const doc = create(payload);
  return doc.end({ prettyPrint: true });
  // return doc;
}

const callSoapApi = async (payload) => {
  try {
    const res = await axios.post(API_ENDPOINT, payload, {
      headers: {
        Accept: "text/xml",
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "add",
      },
    });
    console.log("res", res.data?.data);
    // const obj = convert(res.data, { format: "object" });
    // console.log("obj", obj["soapenv:Envelope"]["soapenv:Body"]);
  } catch (error) {
    console.log("error", error);
  }
};

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
