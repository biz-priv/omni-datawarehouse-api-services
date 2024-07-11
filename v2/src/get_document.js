/*
* File: v2\src\get_document.js
* Project: Omni-datawarehouse-api-services
* Author: Bizcloud Experts
* Date: 2023-12-20
* Confidential and Proprietary
*/
const AWS = require("aws-sdk");
const Joi = require("joi");
const axios = require("axios");
const { get } = require("lodash");
const ddb = new AWS.DynamoDB.DocumentClient();


//constants
const constants = {
  billNo: {
    "agistics": true,
    "customer-portal-admin": true,
    "mechanical-orchard": true,
    "10040516": "8515",  //logitech prod
    "10126801": "8515",  //logitech dev
    "10343158": "9468",  //Vivint dev
    "10041424": "9468",  //Vivint prod
    "10573219": "53278", //CDW prod
    "10265170": "53278"  //CDW dev
  },
  pkey: {
    "housebill": "Housebill",
    "fileNumber": "PK_OrderNo"
  }
}


//1. do a joi valiation
const housebillSchema = Joi.object({
  housebill: Joi.string().required().max(13),
  docType: Joi.alternatives().try(
    Joi.string()
      .required()
      .valid(
        "BI",
        "CONSULAR",
        "CUST RATE",
        "CUSTOMS",
        "DCCL",
        "DECON",
        "HCPOD",
        "HOUSEBILL",
        "IBU",
        "INSURANCE",
        "INVOICE",
        "LABEL",
        "MSDS",
        "OCCL",
        "OMNI RA",
        "ORIG BOL",
        "PACKING",
        "PO",
        "POD",
        "PRO FORMA",
        "RA",
        "WAYBILL",
        "LABELZPL"
      ),

    Joi.array().items(
      Joi.string()
        .required()
        .valid(
          "BI",
          "CONSULAR",
          "CUST RATE",
          "CUSTOMS",
          "DCCL",
          "DECON",
          "HCPOD",
          "HOUSEBILL",
          "IBU",
          "INSURANCE",
          "INVOICE",
          "LABEL",
          "MSDS",
          "OCCL",
          "OMNI RA",
          "ORIG BOL",
          "PACKING",
          "PO",
          "POD",
          "PRO FORMA",
          "RA",
          "WAYBILL",
          "LABELZPL"
        )
    )
  ),
});
const fileNumberSchema = Joi.object({
  fileNumber: Joi.string().required().max(13),
  docType: Joi.alternatives().try(
    Joi.string()
      .required()
      .valid(
        "BI",
        "CONSULAR",
        "CUST RATE",
        "CUSTOMS",
        "DCCL",
        "DECON",
        "HCPOD",
        "HOUSEBILL",
        "IBU",
        "INSURANCE",
        "INVOICE",
        "LABEL",
        "MSDS",
        "OCCL",
        "OMNI RA",
        "ORIG BOL",
        "PACKING",
        "PO",
        "POD",
        "PRO FORMA",
        "RA",
        "WAYBILL"
      ),

    Joi.array().items(
      Joi.string()
        .required()
        .valid(
          "BI",
          "CONSULAR",
          "CUST RATE",
          "CUSTOMS",
          "DCCL",
          "DECON",
          "HCPOD",
          "HOUSEBILL",
          "IBU",
          "INSURANCE",
          "INVOICE",
          "LABEL",
          "MSDS",
          "OCCL",
          "OMNI RA",
          "ORIG BOL",
          "PACKING",
          "PO",
          "POD",
          "PRO FORMA",
          "RA",
          "WAYBILL"
        )
    )
  ),
});

module.exports.handler = async (event, context, callback) => {
  console.log("Event", event);
  try {
    let eventParams = event.query;
    let doctypeValue = eventParams.docType;
    doctypeValue = doctypeValue.split(",");
    let parameterString = doctypeValue
      .map((value) => `doctype=${value}`)
      .join("|");

    console.log(parameterString);
    console.log("eventParams", doctypeValue);
    console.log("websli-api-url", process.env.GET_DOCUMENT_API);

    const searchType = eventParams.hasOwnProperty("housebill")
      ? "housebill"
      : "fileNumber";
    eventParams.docType = doctypeValue;
    try {
      searchType === "housebill"
        ? await housebillSchema.validateAsync(eventParams)
        : await fileNumberSchema.validateAsync(eventParams);
    } catch (error) {
      console.log("error", error);
      return callback(response("[400]", error?.message ?? ""));
    }

    const customerId = get(event, "enhancedAuthContext.customerId", "")
    if (get(constants, `billNo.${customerId}`, null) == null) {
      return callback(response("[400]", "Customer not valid, please contact support for further queries."));
    }

    const validate = await customerValidation(searchType, get(eventParams, searchType, ""), customerId)

    if (validate == false) {
      return callback(response("[400]", "Unauthorised request."));
    }
    console.info("validation: ", validate)

    const apiKey = event.identity.apiKey
    const params = {
      TableName: process.env.TOKEN_VALIDATOR,
      IndexName: process.env.TOKEN_VALIDATION_TABLE_INDEX,
      KeyConditionExpression: 'ApiKey = :ApiKey',
      ExpressionAttributeValues: {
        ':ApiKey': apiKey
      }
    };
    const data = await ddb.query(params).promise();
    let websliKey = get(data, "Items[0].websli_key", process.env.WEBSLI_DEFAULT_KEY)

    console.log("websli api key record in token validator", data)

    // await getDataWithoutGateway(eventParams, parameterString, searchType);
    const resp = await getData(eventParams, parameterString, searchType, websliKey);

    const newResponse = await newResponseStructureForV2(resp);
    console.log("newResponse", newResponse);
    return newResponse;
  } catch (error) {
    console.log("error", error);
    return callback(response("[400]", error?.message ?? ""));
  }
};

/**
 *
 * @param response
 * @returns
 */
async function newResponseStructureForV2(response) {
  console.log("response====>", response);
  return new Promise((resolve, reject) => {
    const newResponse = {
      housebill: response?.wtDocs?.housebill ? response.wtDocs.housebill : "",
      fileNumber: response?.wtDocs?.fileNumber
        ? response.wtDocs.fileNumber
        : "",
      documents: response?.wtDocs?.wtDoc ? response.wtDocs.wtDoc : [],
    };

    resolve({ getDocumentResponse: newResponse });
  });
}

/**
 *
 * @param eventParams
 * @param searchType
 * @returns
 */
async function getData(eventParams, parameterString, searchType, apiKey) {
  try {

    let url = `${process.env.GET_DOCUMENT_API}/${apiKey}/${searchType}=${eventParams[searchType]}/${parameterString}`;
    console.log("websli url :", url);

    let getDocumentData = {
      wtDocs: {
        housebill: "",
        fileNumber: "",
        wtDoc: [],
      },
    }

    const queryType = await axios.get(url);
    getDocumentData = queryType.data;
    console.log("data", getDocumentData);
    return getDocumentData;
  } catch (error) {
    console.log("error", error);
    throw error;
  }
}

function response(code, message) {
  return JSON.stringify({
    httpStatus: code,
    message,
  });
}

async function customerValidation(searchType, value, customerId) {
  try {
    const billNo = get(constants, `billNo.${customerId}`, false)
    if (billNo == true) {
      return true
    }

    const params = {
      TableName: process.env.SHIPMENT_HEADER_TABLE,
      IndexName: `${searchType}-billNo-index`,
      KeyConditionExpression: '#pKey = :pKey and #sKey = :sKey',
      ExpressionAttributeNames: {
        '#pKey': get(constants, `pkey.${searchType}`, ""),
        '#sKey': "BillNo"
      },
      ExpressionAttributeValues: {
        ':pKey': value,
        ':sKey': get(constants, `billNo.${customerId}`, "")
      }
    };

    console.info("params: ", params)

    const data = await ddb.query(params).promise();
    console.info("data: ", data)
    if (get(data, "Items.length", 0) == 0) {
      return false
    }
    return true
  } catch (error) {
    console.error(error)
    throw error
  }
}