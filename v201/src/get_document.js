const AWS = require("aws-sdk");
const Joi = require("joi");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

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
  let isAlBEndpoint = false
  try {
    let host = event.headers.host;
    let eventParams = "";   
    if (host === "www.alb-dev-api.omnilogistics.com") {
      eventParams = event.queryStringParameters;
      isAlBEndpoint = true
    } else {
      eventParams = event.query;
    }
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
      if(!isAlBEndpoint){
          return callback(response("[400]", error?.message ?? ""));
      }
     
      return {
        "statusCode": 400,
        "statusDescription": "400 Bad Request",
        "isBase64Encoded": false,
        "headers": {
          "Content-Type": "text/html"
        },
        "body": error?.message ?? ""
      }
    }

    // await getDataWithoutGateway(eventParams, parameterString, searchType);
    const resp = await getData(eventParams, parameterString, searchType);

    const newResponse = await newResponseStructureForV2(resp);
    console.log("newResponse", newResponse);

    for (let index = 0; index < newResponse.getDocumentResponse.documents.length; index++) {
      const item = newResponse.getDocumentResponse.documents[index];
      let s3Result = await createS3File(item.filename, new Buffer(item.b64str, 'base64'));
      let url = await generatePreSignedURL(item.filename);
      item.url = url;
      delete item.b64str;
      console.log("document url", url);
    }
    console.log("updatedResponse", newResponse);
    if(!isAlBEndpoint){
     return newResponse;
  }
    
    return {
      "statusCode": 200,
      "statusDescription": "200 OK",
      "isBase64Encoded": false,
      "headers": {
        "Content-Type": "text/html"
      },
      "body": newResponse
    }
  } catch (error) {
    console.log("handler:error", error);
    if(!isAlBEndpoint){
       return callback(response("[400]", error?.message ?? ""));
   }
    
    return {
      "statusCode": 400,
      "statusDescription": "400 Bad Request",
      "isBase64Encoded": false,
      "headers": {
        "Content-Type": "text/html"
      },
      "body": error?.message ?? ""
    }
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
async function getData(eventParams, parameterString, searchType) {
  try {

    let url = `${process.env.GET_DOCUMENT_API}/${searchType}=${eventParams[searchType]}/${parameterString}`;
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