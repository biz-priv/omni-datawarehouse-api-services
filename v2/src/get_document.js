const AWS = require("aws-sdk");
const Joi = require("joi");
const axios = require("axios");
const { convert } = require("xmlbuilder2");

const eventValidation = Joi.object().keys({
  housebill: Joi.string().length(13).required(),
  fileNumber: Joi.string().length(13).required(),
  docType: Joi.string().valid(
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
}).or('housebill', 'fileNumber').and('docType');



module.exports.handler = async (event, context, callback) => {
  // console.log("sample")
  if (event.source === 'serverless-plugin-warmup') {
    console.log('WarmUp - Lambda is warm!');
    return 'Lambda is warm!';
  }

console.info(event);
const { body } = event;
const apiKey = event.headers["x-api-key"];
let reqFields = {};
let valError;
// console.log(event.queryStringParameters.housebill)
// const housebill1 = event.queryStringParameters.housebill
// console.log("housebills==> ", housebill1)

  if (
    !("enhancedAuthContext" in event) ||
    !("customerId" in event.enhancedAuthContext)
  ) {
    valError = "customerId not found.";
  } else if (!("fileNumber" in body)) {
    valError = "fileNumber is required.";
  } else if (
    !("housebill" in event.queryStringParameters) ||
    !("fileNumber" in event.queryStringParameters) &&
    !("docType" in event.queryStringParameters)
  ) {
    valError =
      "housebill,fileNumber and docType are required fields. Please ensure you are sending all 3 of these values.";
  } 
  const { error, value } = eventValidation.validate(reqFields);
  // if (valError) {
  //   console.info(valError);
  //   return callback(response("[400]", valError));
  // }else {
  //   return callback(response("[400]", key + " " + error));
  // } 

getdocument(event.queryStringParameters)
}

async function getdocument(eventData) {
    let res;
    try {
      res = await axios.get( process.env.GETDOCUMENT_API+"/housebill="+(eventData.housebill)+"&fileNumber="+(eventData.housebill)+"/doctype=housebill%7Cdoctype=label%7Cdoctype="+(eventData.doctype)+"", {
        headers: {
          Accept: "text/xml",
          "Content-Type": "application/soap+xml; charset=utf-8",
        },
      });
      console.log("XML Response: Axios", (res.data));
      let finalres = {}
      finalres.getDocumentResponse = {}
      finalres.getDocumentResponse.housebill = res.data.wtDocs.housebill
      finalres.getDocumentResponse.fileNumber = res.data.wtDocs.fileNumber
      finalres.getDocumentResponse.documents = res.data.wtDocs.wtDoc
      console.log("final response  ", finalres)
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
 
