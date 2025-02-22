/*
* File: v1\src\uploadpoddocument.js
* Project: Omni-datawarehouse-api-services
* Author: Bizcloud Experts
* Date: 2022-12-15
* Confidential and Proprietary
*/
const AWS = require("aws-sdk");
const Joi = require("joi");
const axios = require("axios");
const { convert, create } = require("xmlbuilder2");

module.exports.handler = async (event, context, callback) => {
  if (event.source === 'serverless-plugin-warmup') {
    console.log('WarmUp - Lambda is warm!');
    return 'Lambda is warm!';
  }
  const { body } = event;
  console.log("event", event);
  const eventValidation = Joi.object()
    .keys({
      UploadPODDocument: Joi.object()
        .keys({
          Housebill: Joi.string().required(),
          b64str: Joi.string().required(),
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
  try {
    const postData = makeJsonToXml(eventBody.UploadPODDocument);
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
    "soap12:Envelope": {
      "@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
      "@xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
      "@xmlns:soap12": "http://www.w3.org/2003/05/soap-envelope",
      "soap12:Header": {
        AuthHeader: {
          "@xmlns": "http://tempuri.org/",
          UserName: "biztest",
          Password: "Api081020!",
        },
      },
      "soap12:Body": {
        UploadPODDocument: {
          "@xmlns": "http://tempuri.org/",
          HAWB: data.Housebill,
          DocumentDataBase64: data.b64str,
          DocumentExtension: "pdf",
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
