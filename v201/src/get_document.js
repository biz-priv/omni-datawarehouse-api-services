const AWS = require("aws-sdk");
const Joi = require("joi");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { get } = require("lodash");
const ddb = new AWS.DynamoDB.DocumentClient();

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
    console.log("eventParams", eventParams);
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
      console.log("searchType:error", error);
      return callback(response("[400]", error?.message ?? ""));
    }

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
    let websliKey = get(data, "Items[0].websli_key", "")
    if(websliKey == ""){
      websliKey = process.env.WEBSLI_DEFAULT_KEY
    }
    console.log("websli api key record in token validator", data)


    // await getDataWithoutGateway(eventParams, parameterString, searchType);
    const resp = await getData(eventParams, parameterString, searchType, websliKey);

    const newResponse = await newResponseStructureForV2(resp);
    console.log("newResponse", newResponse);

    for (let index = 0; index < newResponse.getDocumentResponse.documents.length; index++) {
      const item = newResponse.getDocumentResponse.documents[index];
      await createS3File(item.filename, Buffer.from(item.b64str, 'base64'));
      let url = await generatePreSignedURL(item.filename);
      item.url = url;
      delete item.b64str;
      console.log("document url", url);
    }
    console.log("updatedResponse", newResponse);
    return newResponse;
  } catch (error) {
    console.log("handler:error", error);
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
      id: uuidv4(),
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
    console.log("error while calling websli endpoint: ", error);
    throw error;
  }
}

/**
 *
 * @param eventParams
 * @param searchType
 * @returns
 */
async function getDataWithoutGateway(eventParams, parameterString, searchType) {
  try {

    let url = `https://jsi-websli.omni.local/wtProd/getwtdoc/v1/json/fa75bbb8-9a10-4c64-80e8-e48d48f34088/${searchType}=${eventParams[searchType]}/${parameterString}`;
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
    //   return getDocumentData;
  } catch (error) {
    console.log("error", error);
    //   throw error;
  }
}

function response(code, message) {
  return JSON.stringify({
    httpStatus: code,
    message,
  });
}


async function createS3File(filename, body) {
  const S3 = new AWS.S3();
  const params = {
    Key: filename,
    Body: body,
    Bucket: process.env.DOCUMENTS_BUCKET,
    ContentType: 'application/pdf'
  };
  return await S3.upload(params).promise();
}

async function generatePreSignedURL(filename) {
  const S3 = new AWS.S3();
  const params = {
    Key: filename,
    Bucket: process.env.DOCUMENTS_BUCKET,
    Expires: 15 * 60
  };
  let url = await S3.getSignedUrlPromise('getObject', params)
  return url;
}