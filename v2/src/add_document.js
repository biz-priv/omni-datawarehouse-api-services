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
  let eventBody = body;
  let fileExtension = "";
  switch (eventBody.documentUploadRequest.b64str[0]) {
    case "/":
      fileExtension = ".jpeg";
      break;
    case "i":
      fileExtension = ".png";
      break;
    case "R":
      fileExtension = ".gif";
      break;
    case "U":
      fileExtension = ".webp";
      break;
    case "J":
      fileExtension = ".pdf";
      break;
    default:
      fileExtension = "";
  }

  let validated = {};
  validated.b64str = eventBody.documentUploadRequest.b64str;
  let housebill = "";
  let docType = "";
  if (
    "housebill" in eventBody.documentUploadRequest &&
    Number.isInteger(Number(housebill))
  ) {
    validated.housebill = eventBody.documentUploadRequest.housebill;
    housebill = eventBody.documentUploadRequest.housebill;
  }
  if (
    "docType" in eventBody.documentUploadRequest &&
    eventBody.documentUploadRequest.docType != ""
  ) {
    validated.docType = eventBody.documentUploadRequest.docType;
    docType = eventBody.documentUploadRequest.docType;
  }

  let currentDateTime = new Date();
  let formatDate =
    currentDateTime.getFullYear().toString() +
    pad2(currentDateTime.getMonth() + 1) +
    pad2(currentDateTime.getDate()) +
    pad2(currentDateTime.getHours()) +
    pad2(currentDateTime.getMinutes()) +
    pad2(currentDateTime.getSeconds());

  let fileName = housebill + "_" + docType + "_" + formatDate + fileExtension;
  validated.filename = fileName;
  try {
    const postData = makeJsonToXml(validated);
    console.log("postData", postData);
    const res = await getXmlResponse(postData);
    console.log("res***", res);
    const dataObj = makeXmlToJson(res.xml_response);
    if (
      dataObj["soap:Envelope"]["soap:Body"].UploadPODDocumentResponse
        .UploadPODDocumentResult == "true"
    ) {
      return { msg: "Success" };
    } else {
      throw "Failed";
    }
  } catch (error) {
    return callback(response("[500]", "Failed"));
  }
};

async function getXmlResponse(postData) {
  let res;
  try {
    res = await axios.post(process.env.ULOAD_POD_DOCUMENT_API, postData, {
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
