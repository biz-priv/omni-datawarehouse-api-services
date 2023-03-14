const AWS = require("aws-sdk");
const Joi = require("joi");
const axios = require("axios");
const Base64 = require("js-base64");
const { convert, create } = require("xmlbuilder2");

module.exports.handler = async (event, context, callback) => {
  console.log("event", event);
  const { body } = event;

  const eventValidation = Joi.object()
    .keys({
      documentUploadRequest: Joi.object()
        .keys({
          housebill: Joi.number().integer(),
          b64str: Joi.string().required(),
          contentType: Joi.any(),
          docType: Joi.string()
            .valid(
              "CERTIFICAT",
              "CONSULAR",
              "CUST RATE",
              "CUSTOMS",
              "DANGEROUS",
              "DCCL",
              "DECON",
              "HCPOD",
              "IBU",
              "IMPORT LIC",
              "INSURANCE",
              "INVOICE",
              "MSDS",
              "OCCL",
              "OMNI RA",
              "ORIG BOL",
              "PACKING",
              "PO",
              "POD",
              "PRO FORMA",
              "RA",
              "SED",
              "SLI",
              "WAYBILL"
            )
            .required(),
          fileNumber: Joi.number().integer(),
        })
        .or("housebill", "fileNumber")
        .required(),
    })
    .required();
  let validator = {
    documentUploadRequest: {},
  };
  for (let key in body.documentUploadRequest) {
    if (!key.includes("//")) {
      validator.documentUploadRequest[key] = body.documentUploadRequest[key];
    }
  }
  const { error, value } = eventValidation.validate(validator);
  if (error) {
    let msg = error.details[0].message
      .split('" ')[1]
      .replace(new RegExp('"', "g"), "");
    let key = error.details[0].context.key;
    console.info("[400]", key + " " + msg);
    return callback(response("[400]", key + " " + msg));
  }
  let customerId;
  let fileNumber = "";
  let housebill = "";
  let docType = "";
  let eventBody = validator;
  let fileExtension = "";
  let validated = {};
  let currentDateTime = new Date();
  validated.b64str = eventBody.documentUploadRequest.b64str;

  if (
    !("enhancedAuthContext" in event) ||
    !("customerId" in event.enhancedAuthContext)
  ) {
    return callback(response("[400]", "Unable to validate user"));
  } else {
    customerId = event.enhancedAuthContext.customerId;
  }

  if (eventBody.documentUploadRequest.b64str.length < 3000000) {
    let pattern =
      /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)?$/;
    let Base64 = eventBody.documentUploadRequest.b64str.match(pattern)
      ? "Base64"
      : "Not Base64";
    if (Base64 != "Base64") {
      return callback(
        response(
          "[400]",
          "Please ensure b64str field is a valid base64 string."
        )
      );
    }
  } else if (!Base64.isValid(eventBody.documentUploadRequest.b64str)) {
    return callback(
      response("[400]", "Please ensure b64str field is a valid base64 string.")
    );
  }

  if (
    customerId != "customer-portal-admin" &&
    customerId != process.env.IVIA_CUSTOMER_ID
  ) {
    if (
      "housebill" in eventBody.documentUploadRequest &&
      Number.isInteger(Number(eventBody.documentUploadRequest.housebill))
    ) {
      fileNumber = await getFileNumber(
        eventBody.documentUploadRequest.housebill,
        customerId
      );
      if (fileNumber == "failure") {
        return callback(
          response("[400]", "Invalid Housebill for this customer.")
        );
      } else {
        fileNumber = fileNumber["FileNumber"];
        validated.housebill = eventBody.documentUploadRequest.housebill;
        console.info("filenumber: ", fileNumber);
      }
    } else if (
      "fileNumber" in eventBody.documentUploadRequest &&
      Number.isInteger(Number(eventBody.documentUploadRequest.fileNumber))
    ) {
      housebill = await getHousebillNumber(
        eventBody.documentUploadRequest.fileNumber,
        customerId
      );
      if (housebill == "failure") {
        return callback(response("[400]", "No Housebill found."));
      } else {
        fileNumber = eventBody.documentUploadRequest.fileNumber;
        validated.housebill = housebill["HouseBillNumber"];
        console.info("housebill: ", validated.housebill);
      }
    }
  } else {
    // validated.housebill = eventBody.documentUploadRequest.housebill;

    // based on housebill no query omni-wt-rt-shipment-header-dev ddb table to fetch the pk_ordernumber
    // form pk_ordernumber==fk_ordernumber we query omni-wt-address-mapping-dev
    // now we check cc_con_zip first and then cc_con_address = 1
    // we can send that paylod to wt-api
    // if cc_con_zip!=1 we ignore dont send it to wt
    // if cc_con_address != 1 we check for the google_address  from the ddb table if that equal to 1 send it.

    housebill = body.documentUploadRequest.housebill;
    const paramsshipmentHeader = {
      TableName: process.env.SHIPMENT_HEADER_TABLE,
      IndexName: "Housebill-index",
      KeyConditionExpression: "Housebill = :Housebill",
      ExpressionAttributeValues: {
        ":Housebill": housebill,
      },
    };

    let shipmentHeaderResponse = await queryDynamo(paramsshipmentHeader);
    console.log("shipmentHeaderResponse", shipmentHeaderResponse);
    shipmentHeaderResponse =
      shipmentHeaderResponse.Items.length > 0
        ? shipmentHeaderResponse.Items[0]
        : {};

    const PK_OrderNo =
      shipmentHeaderResponse?.PK_OrderNo?.length > 0
        ? shipmentHeaderResponse.PK_OrderNo
        : null;

    console.log("PK_OrderNo", PK_OrderNo);

    if (!PK_OrderNo) {
      console.log("PK_OrderNo no not found", paramsshipmentHeader);
      return callback(response("[400]", "file number not found"));
    }

    const paramsAddMap = {
      TableName: process.env.ADDRESS_MAPPING_TABLE,
      KeyConditionExpression: "FK_OrderNo = :fkNumber",
      ExpressionAttributeValues: {
        ":fkNumber": PK_OrderNo,
      },
    };

    let addressMappingResponse = await queryDynamo(paramsAddMap);

    console.log("addressMappingResponse", addressMappingResponse);
    if (addressMappingResponse.Items.length > 0) {
      addressMappingResponse = addressMappingResponse.Items[0];
    } else {
      console.log("No data found on address mapping table", paramsAddMap);
      return callback(
        response("[400]", "No data found on address mapping table")
      );
    }

    const { cc_con_zip, cc_con_address, cc_con_google_match } =
      addressMappingResponse;

    if (cc_con_zip == 1) {
      if (cc_con_address == 1) {
        validated.housebill = housebill;
      } else {
        if (cc_con_google_match == 1) {
          validated.housebill = housebill;
        } else {
          console.log("igored response");
          return callback(response("[400]", "igored response")); //TODO: check with will
        }
      }
    } else {
      console.log("igored response");
      return callback(response("[400]", "igored response")); //TODO: check with will
    }
  }

  if (
    "docType" in eventBody.documentUploadRequest &&
    eventBody.documentUploadRequest.docType != ""
  ) {
    if (eventBody.documentUploadRequest.docType.toString().length <= 10) {
      validated.docType = eventBody.documentUploadRequest.docType;
      docType = eventBody.documentUploadRequest.docType;
    } else {
      validated.docType = eventBody.documentUploadRequest.docType
        .toString()
        .slice(0, 10);
      docType = eventBody.documentUploadRequest.docType.toString().slice(0, 10);
    }
  }
  if (
    "contentType" in eventBody.documentUploadRequest &&
    eventBody.documentUploadRequest.contentType.split("/").length >= 2 &&
    eventBody.documentUploadRequest.contentType.split("/")[1] != ""
  ) {
    fileExtension =
      "." + eventBody.documentUploadRequest.contentType.split("/")[1];
  } else {
    if (eventBody.documentUploadRequest.b64str.startsWith("/9j/4")) {
      fileExtension = ".jpeg";
    } else if (eventBody.documentUploadRequest.b64str.startsWith("iVBOR")) {
      fileExtension = ".png";
    } else if (eventBody.documentUploadRequest.b64str.startsWith("R0lG")) {
      fileExtension = ".gif";
    } else if (eventBody.documentUploadRequest.b64str.startsWith("J")) {
      fileExtension = ".pdf";
    } else if (
      eventBody.documentUploadRequest.b64str.startsWith("TU0AK") ||
      eventBody.documentUploadRequest.b64str.startsWith("SUkqA")
    ) {
      fileExtension = ".tiff";
    } else {
      fileExtension = "";
    }
  }
  if (fileExtension == "") {
    return callback(
      response(
        "[400]",
        "Unable to identify filetype. Please send content type with file extension."
      )
    );
  }

  let formatDate =
    currentDateTime.getFullYear().toString() +
    pad2(currentDateTime.getMonth() + 1) +
    pad2(currentDateTime.getDate()) +
    pad2(currentDateTime.getHours()) +
    pad2(currentDateTime.getMinutes()) +
    pad2(currentDateTime.getSeconds());

  let fileName;
  if (fileNumber != "") {
    fileName = fileNumber + "_" + docType + "_" + formatDate + fileExtension;
  } else {
    fileName = docType + "_" + formatDate + fileExtension;
  }
  validated.filename = fileName;

  try {
    const postData = makeJsonToXml(validated);
    console.info("postData", postData);
    const res = await getXmlResponse(postData);
    console.info("resp: ", res);
    const dataObj = makeXmlToJson(res.xml_response);
    if (
      dataObj["soap:Envelope"]["soap:Body"].AttachFileToShipmentResponse
        .AttachFileToShipmentResult.Success == "true"
    ) {
      return { documentUploadResponse: { message: "success" } };
    } else {
      console.log("Returned XML After Conversion: ", dataObj);
      return callback(
        response(
          "[400]",
          dataObj["soap:Envelope"]["soap:Body"].AttachFileToShipmentResponse
            .AttachFileToShipmentResult.ErrorStatus
        )
      );
      // throw "Failed";
    }
  } catch (error) {
    return callback(
      response("[500]", {
        documentUploadResponse: {
          message: "failed",
          error: error.hasOwnProperty("message") ? error.message : error,
        },
      })
    );
  }
};

async function getXmlResponse(postData) {
  let res;
  try {
    res = await axios.post(process.env.UPLOAD_DOCUMENT_API, postData, {
      headers: {
        Accept: "text/xml",
        "Content-Type": "application/soap+xml; charset=utf-8",
      },
    });
    console.log("XML Response: Axios", res);
    return {
      xml_response: res.data,
      status_code: res.status,
      status: res.status == 200 ? "success" : "failed",
    };
  } catch (e) {
    console.log("XML Response Error: ", e);
    throw e.hasOwnProperty("message") ? e.message : e;
  }
}
function makeJsonToXml(data) {
  try {
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
  } catch (e) {
    console.log("JSON to XML error: ", e);
    throw e.hasOwnProperty("message") ? e.message : e;
  }
}

function makeXmlToJson(data) {
  try {
    return convert(data, { format: "object" });
  } catch (e) {
    console.log("XML to JSON error: ", e);
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

async function getFileNumber(housebill, customerId) {
  try {
    const documentClient = new AWS.DynamoDB.DocumentClient({
      region: process.env.REGION,
    });
    const params = {
      TableName: process.env.HOUSEBILL_TABLE,
      IndexName: process.env.HOUSEBILL_TABLE_INDEX,
      KeyConditionExpression:
        "CustomerID = :CustomerID AND HouseBillNumber = :Housebill",
      ExpressionAttributeValues: {
        ":Housebill": housebill,
        ":CustomerID": customerId,
      },
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

async function getHousebillNumber(filenumber, customerId) {
  try {
    const documentClient = new AWS.DynamoDB.DocumentClient({
      region: process.env.REGION,
    });
    const params = {
      TableName: process.env.HOUSEBILL_TABLE,
      IndexName: process.env.FILENUMBER_TABLE_INDEX,
      KeyConditionExpression:
        "CustomerID = :CustomerID AND FileNumber = :FileNumber",
      ExpressionAttributeValues: {
        ":FileNumber": filenumber,
        ":CustomerID": customerId,
      },
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

//-------------------
async function queryDynamo(params) {
  try {
    const documentClient = new AWS.DynamoDB.DocumentClient({
      region: process.env.REGION,
    });
    const response = await documentClient.query(params).promise();
    return response;
  } catch (error) {
    console.log("error", error);
    return { Items: [] };
  }
}
