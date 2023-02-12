const AWS = require("aws-sdk");
const Joi = require("joi");
const axios = require("axios");
const { convert } = require("xmlbuilder2");

const eventValidation = Joi.object({
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
  ).required(),
}).or('housebill', 'fileNumber');

module.exports.handler = async (event, context, callback) => {
  if (event.source === 'serverless-plugin-warmup') {
    console.log('WarmUp - Lambda is warm!');
    return 'Lambda is warm!';
  }

  console.info(event);
  let reqFields = {};
  let valError;

  // if (
  //   !("enhancedAuthContext" in event) ||
  //   !("customerId" in event.enhancedAuthContext)
  // ) {
  //   valError = "customerId not found.";
  // } else if (!("housebill" in event.query)) {
  //   valError = "housebill is required.";

  // } else if (!("filenumber" in event.query)) {
  //   valError = "filenumber is required.";
  // }
  // else if (("docType" in event.query)) {
  //   valError = "docType is required.";
  // }
  const { error, value } = eventValidation.validate(reqFields);
  if (error) {
    let msg = error.details[0].message
      .split('" ')[1]
      .replace(new RegExp('"', "g"), "");
    let key = error.details[0].context.key;
    return callback(response("[400]", key + " " + msg));
  }
  getdocument(event.query)
}

async function getdocument(eventData) {
  let res;
  try {
    res = await axios.get(process.env.GETDOCUMENT_API + "/housebill=" + (eventData.housebill) + "/doctype=housebill%7Cdoctype=label%7Cdoctype=" + (eventData.doctype) + "", {
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

