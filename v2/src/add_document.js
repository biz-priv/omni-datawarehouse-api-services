const AWS = require("aws-sdk");
const Joi = require("joi");
const axios = require("axios");
const { convert, create } = require("xmlbuilder2");

module.exports.handler = async (event, context, callback) => {
  const { body } = event;
  console.log("event", event);
  const eventValidation = Joi.object()
    .keys({
      documentUploadRequest: Joi.object()
        .keys({
          housebill: Joi.any(),
          b64str: Joi.string().min(20).required(),
          contentType: Joi.any(),
          docType: Joi.any(),
          fileNumber: Joi.any(),
        })
        .required(),
    })
    .required();
  const { error, value } = eventValidation.validate(body);
  if (error) {
    let msg = error.details[0].message
      .split('" ')[1]
      .replace(new RegExp('"', "g"), "");
    let key = error.details[0].context.key;
    console.log("[400]", key + " " + msg);
    return callback(response("[400]", key + " " + msg));
  }
  let customerId;
  let fileNumber='';
  let housebill = "";
  let docType = "";
  let eventBody = body;
  let fileExtension = "";
  let validated = {};
  let currentDateTime = new Date();
  validated.b64str = eventBody.documentUploadRequest.b64str;

  if(!('enhancedAuthContext' in event) || !('customerId' in event.enhancedAuthContext)){
    return callback(response("[400]", "Unable to validate user"));
  } else {
    customerId = event.enhancedAuthContext.customerId
  }
  if (
    "housebill" in eventBody.documentUploadRequest &&
    Number.isInteger(Number(eventBody.documentUploadRequest.housebill))
  ) {
    fileNumber = await getFileNumber(eventBody.documentUploadRequest.housebill,customerId)
    if(fileNumber == 'failure'){
      return callback(response("[400]", "Invalid Housebill for this customer."));
    } else {
      fileNumber = fileNumber["FileNumber"]
      validated.housebill = eventBody.documentUploadRequest.housebill;
      console.log('filenumber: ',fileNumber)
    }
  } else if ('fileNumber' in eventBody.documentUploadRequest && Number.isInteger(Number(eventBody.documentUploadRequest.fileNumber))){
    housebill = await getHousebillNumber(eventBody.documentUploadRequest.fileNumber,customerId);
    if(housebill == 'failure'){
      return callback(response("[400]", "No Housebill found."))
    } else {
      fileNumber = eventBody.documentUploadRequest.fileNumber
      validated.housebill = housebill['HouseBillNumber']
      console.log('housebill: ', validated.housebill)
    }
   
  }
  if (
    "docType" in eventBody.documentUploadRequest &&
    eventBody.documentUploadRequest.docType != ""
  ) {
    validated.docType = eventBody.documentUploadRequest.docType;
    docType = eventBody.documentUploadRequest.docType;
  }
  if('contentType' in eventBody.documentUploadRequest){
    fileExtension = "."+eventBody.documentUploadRequest.contentType.split('/')[1]
  } else {
    switch (eventBody.documentUploadRequest.b64str[0]) {
      case "/9j/4":
        fileExtension = ".jpeg";
        break;
      case "iVBOR":
        fileExtension = ".png";
        break;
      case "R0lG":
        fileExtension = ".gif";
        break;
      case "J":
        fileExtension = ".pdf";
        break;
      case "TU0AK" || "SUkqA":
        fileExtension = ".tiff";
        break;
      default:
        fileExtension = "";
    }
  }

  let formatDate =
    currentDateTime.getFullYear().toString() +
    pad2(currentDateTime.getMonth() + 1) +
    pad2(currentDateTime.getDate()) +
    pad2(currentDateTime.getHours()) +
    pad2(currentDateTime.getMinutes()) +
    pad2(currentDateTime.getSeconds());

  let fileName = fileNumber + "_" + docType + "_" + formatDate + fileExtension;
  validated.filename = fileName;

  try {
    const postData = makeJsonToXml(validated);
    console.log("postData", postData);
    const res = await getXmlResponse(postData);
    console.log("resp: ", res);
    const dataObj = makeXmlToJson(res.xml_response);
    if (
      dataObj['soap:Envelope']['soap:Body'].AttachFileToShipmentResponse.AttachFileToShipmentResult.Success == "true"
    ) {
      return { documentUploadResponse: { message: "success" } };
    } else {
      return {documentUploadResponse: {message: 'failed', error: dataObj['soap:Envelope']['soap:Body'].AttachFileToShipmentResponse.AttachFileToShipmentResult.ErrorStatus}}
      // throw "Failed";
    }
  } catch (error) {
    return callback(response("[500]", {documentUploadResponse: {message: 'failed', error: error}}));
  }
};

async function getXmlResponse(postData) {
  let res;
  try {
    res = await axios.post(process.env.ULOAD_DOCUMENT_API, postData, {
      headers: {
        Accept: "text/xml",
        "Content-Type": "application/soap+xml; charset=utf-8",
      },
    });
    return {
      xml_response: res.data,
      status_code: res.status,
      status: res.status == 200 ? "success" : "failed",
    };
  } catch (e) {
    throw "Error";
    // console.log(e);
  }
}
function makeJsonToXml(data) {
  return convert({
    "soap:Envelope": {
      "@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
      "@xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
      "@xmlns:soap": "http://www.w3.org/2003/05/soap-envelope",
      "soap:Body": {
        AttachFileToShipment: {
          "@xmlns": "http://tempuri.org/",
          Housebill: data.housebill,
          FileDataBase64: data.b64str,
          Filename: data.filename,
          DocType: data.docType,
        },
      },
    },
  });
}

function makeXmlToJson(data) {
  try {
    return convert(data, { format: "object" });
  } catch (e) {
    throw e.hasOwnProperty("message") ? e.message : e;
  }
}

function response(code, message) {
  return JSON.stringify({
    httpStatus: code,
    message,
  });
}

function pad2(n) {
  return n < 10 ? "0" + n : n;
}

async function getFileNumber(housebill,customerId) {
  try {
    const documentClient = new AWS.DynamoDB.DocumentClient({
      region: process.env.REGION,
    });
    const params = {
      TableName: process.env.HOUSEBILL_TABLE,
      IndexName: process.env.HOUSEBILL_TABLE_INDEX,
      KeyConditionExpression: "CustomerID = :CustomerID AND HouseBillNumber = :Housebill",
      ExpressionAttributeValues: { ":Housebill": housebill, ":CustomerID":customerId},
    };
    const response = await documentClient.query(params).promise();
    if (response.Items && response.Items.length > 0) {
      console.info("Get FileNumber Dynamo resp: ", response.Items);
      return response.Items[0];
    } else {
      return "failure";
    }
  } catch (e) {
    throw e.hasOwnProperty("message") ? e.message : e;
  }
}

async function getHousebillNumber(filenumber,customerId) {
  try {
    const documentClient = new AWS.DynamoDB.DocumentClient({
      region: process.env.REGION,
    });
    const params = {
      TableName: process.env.HOUSEBILL_TABLE,
      IndexName: process.env.FILENUMBER_TABLE_INDEX,
      KeyConditionExpression: "CustomerID = :CustomerID AND FileNumber = :FileNumber",
      ExpressionAttributeValues: { ":FileNumber": filenumber, ":CustomerID":customerId },
    };
    const response = await documentClient.query(params).promise();
    if (response.Items && response.Items.length > 0) {
      console.info("GetHousebill Dynamo resp: ", response.Items);
      return response.Items[0];
    } else {
      return "failure";
    }
  } catch (e) {
    throw e.hasOwnProperty("message") ? e.message : e;
  }
}
