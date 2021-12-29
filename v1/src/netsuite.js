const NetSuite = require("node-suitetalk");
const { create, convert } = require("xmlbuilder2");
const crypto = require("crypto");
const axios = require("axios");

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

const toXml = (auth) => {
  const payloadJson = {
    "soap:Envelope": {
      "@xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
      "@xmlns:soap": "http://schemas.xmlsoap.org/soap/envelope/",
      "@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
      "soap:Header": {
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
      },
      "soap:Body": {
        add: {
          "@xmlns": "urn:messages_2021_2.platform.webservices.netsuite.com",
          "#": {
            record: {
              "@xsi:type": "q1:Invoice",
              "@xmlns:q1":
                "urn:sales_2021_2.transactions.webservices.netsuite.com",
              "#": {
                "q1:entity": {
                  "@internalId": "34129",
                },
                "q1:tranDate": "2021-11-08T00:00:00",
                "q1:department": {
                  "@internalId": "15",
                },
                "q1:class": {
                  "@internalId": "9",
                },
                "q1:location": {
                  "@internalId": "18",
                },
                "q1:subsidiary": {
                  "@internalId": "12",
                },
                "q1:currency": {
                  "@internalId": "1",
                },
                "q1:otherRefNum": "CIRRUS",
                "q1:memo": "01*Air Import (LAX)",
                "q1:itemList": {
                  "q1:item": [
                    {
                      "q1:item": {
                        "@externalId": "AIR FREIGHT",
                      },
                      "q1:description": "",
                      "q1:amount": "1012.87",
                      "q1:rate": "1012.87",
                      "q1:department": {
                        "@internalId": "1",
                      },
                      "q1:class": {
                        "@internalId": "3",
                      },
                      "q1:location": {
                        "@externalId": "LAX",
                      },
                      "q1:customFieldList": {
                        customField: [
                          {
                            "@internalId": "1727",
                            "@xsi:type": "StringCustomFieldRef",
                            "@xmlns":
                              "urn:core_2021_2.platform.webservices.netsuite.com",
                            value: "618-3912 1364",
                          },
                          {
                            "@internalId": "1728",
                            "@xsi:type": "StringCustomFieldRef",
                            "@xmlns":
                              "urn:core_2021_2.platform.webservices.netsuite.com",
                            value: "LAX",
                          },
                          {
                            "@internalId": "760",
                            "@xsi:type": "StringCustomFieldRef",
                            "@xmlns":
                              "urn:core_2021_2.platform.webservices.netsuite.com",
                            value: "SIN-5024 0016",
                          },
                        ],
                      },
                    },
                  ],
                },
                "q1:customFieldList": {
                  customField: [
                    {
                      "@internalId": "1735",
                      "@xsi:type": "StringCustomFieldRef",
                      "@xmlns":
                        "urn:core_2021_2.platform.webservices.netsuite.com",
                      value: "05512122",
                    },
                    ,
                    {
                      "@internalId": "1745",
                      "@xsi:type": "DateCustomFieldRef",
                      "@xmlns":
                        "urn:core_2021_2.platform.webservices.netsuite.com",
                      value: "2021-12-13T16:46:45",
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
  };
  const doc = create(payloadJson);
  return doc.end({ prettyPrint: true });
};

const callSoapApi = async (payload) => {
  const res = await axios.post(API_ENDPOINT, payload, {
    headers: {
      Accept: "text/xml",
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "add",
    },
  });
  // console.log("res", res);
  const obj = convert(res.data, { format: "object" });
  console.log("obj", obj["soapenv:Envelope"]["soapenv:Body"]);
};

// module.exports.handler = async (event, context, callback) => {
try {
  const auth = getOAuthKeys(userConfig);
  const payload = toXml(auth);
  // console.log(payload);
  callSoapApi(payload);
} catch (error) {
  console.log("error", error);
}
// };
