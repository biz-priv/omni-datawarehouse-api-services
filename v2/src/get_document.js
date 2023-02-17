const AWS = require("aws-sdk");
const Joi = require("joi");
const axios = require("axios");

//1. do a joi valiation
const housebillSchema = Joi.object({
  housebill: Joi.string().required().max(13),
  docType: Joi.string()
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
});
const fileNumberSchema = Joi.object({
  fileNumber: Joi.string().required().max(13),
  docType: Joi.string()
    .required()
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
    ),
});

module.exports.handler = async (event, context, callback) => {
  console.log("Event", event);
  try {
    const eventParams = event.query;
    // const xApiKey = event.headers;

    console.log("websli-api-url", process.env.GET_DOCUMENT_API);

    const searchType = eventParams.hasOwnProperty("housebill")
      ? "housebill"
      : "fileNumber";
    try {
      searchType === "housebill"
        ? await housebillSchema.validateAsync(eventParams)
        : await fileNumberSchema.validateAsync(eventParams);
    } catch (error) {
      console.log("error", error);
      return callback(response("[400]", error?.message ?? ""));
    }

    const resp = await getData(eventParams, searchType);

    //5. change the response structre
    const newResponse = await newResponseStructureForV2(resp.data);
    console.log("newResponse", newResponse);

    //6. send the response
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
async function getData(eventParams, searchType) {
  try {
    const queryType = (response = await axios.get(
      `${process.env.GET_DOCUMENT_API}/fileNumber=${eventParams[searchType]}/doctype=${eventParams.docType}/`
    ));
    return queryType;
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
